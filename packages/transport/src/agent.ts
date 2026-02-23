import { type AgentIdentity, generateIdentity } from './identity/keys.js';
import {
  type DelegationCert,
  isFleetSibling,
  verifyDelegationCert,
} from './identity/delegation.js';
import { canonicalize } from './identity/serialize.js';
import {
  createTaskEnvelope,
  verifyTaskEnvelope,
  createTaskResponse,
  verifyTaskResponse,
} from './protocol/envelope.js';
import { validatePayload } from './protocol/standard-tools.js';
import { type TaskHandler, ToolRegistry } from './protocol/tools.js';
import type { Tool, TaskEnvelope, TaskResponse } from './protocol/types.js';
import type { Transport } from './transport/interface.js';

interface PendingRequest {
  resolve: (response: TaskResponse) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

/**
 * Wire message types exchanged over transport.
 * Wraps TaskEnvelope, TaskResponse, and delegation cert exchange.
 */
type WireMessage =
  | { type: 'task'; envelope: TaskEnvelope }
  | { type: 'response'; response: TaskResponse }
  | { type: 'cert-exchange'; cert: DelegationCert };

export interface AgentOptions {
  /** Use this identity instead of generating a new one (e.g. loaded from disk). */
  identity?: AgentIdentity;
  /** Optional delegation cert when this agent is owned by a fleet. */
  delegation?: DelegationCert;
  /** Request timeout in ms. Default 30_000. */
  requestTimeoutMs?: number;
}

export class Agent {
  readonly identity: AgentIdentity;
  readonly delegation?: DelegationCert;
  readonly tools: ToolRegistry;
  private readonly transport: Transport;
  private readonly pending = new Map<string, PendingRequest>();
  private readonly peerCerts = new Map<string, DelegationCert>();
  private readonly requestTimeoutMs: number;
  private started = false;

  constructor(
    transport: Transport,
    delegationOrOptions?: DelegationCert | AgentOptions,
    requestTimeoutMs?: number,
  ) {
    let options: AgentOptions = {};
    if (delegationOrOptions != null) {
      const o = delegationOrOptions as Record<string, unknown>;
      options =
        typeof o === 'object' && ('identity' in o || 'requestTimeoutMs' in o)
          ? (delegationOrOptions as AgentOptions)
          : { delegation: delegationOrOptions as DelegationCert };
    }
    if (requestTimeoutMs != null) {
      options.requestTimeoutMs = requestTimeoutMs;
    }
    this.identity = options.identity ?? generateIdentity();
    this.delegation = options.delegation;
    this.tools = new ToolRegistry();
    this.transport = transport;
    this.requestTimeoutMs = options.requestTimeoutMs ?? 30_000;
  }

  registerTool(tool: Tool, handler: TaskHandler): void {
    this.tools.register(tool, handler);
  }

  async start(): Promise<void> {
    if (this.started) {
      return;
    }
    this.transport.onMessage((peerId, msg) => this.handleMessage(peerId, msg));
    await this.transport.start();
    await this.transport.advertise(this.tools.list());
    this.started = true;
  }

  async stop(): Promise<void> {
    await this.transport.stop();
    // Reject any pending requests
    for (const [taskId, pending] of this.pending) {
      clearTimeout(pending.timer);
      pending.reject(new Error('Agent stopped'));
      this.pending.delete(taskId);
    }
  }

  get peerId(): string {
    return this.transport.peerId;
  }

  async request(peerId: string, tool: string, payload: unknown): Promise<TaskResponse> {
    const envelope = createTaskEnvelope(this.identity, peerId, tool, payload);
    const wireMsg: WireMessage = { type: 'task', envelope };
    const bytes = canonicalize(wireMsg);

    return new Promise<TaskResponse>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(envelope.taskId);
        reject(new Error('Request timed out'));
      }, this.requestTimeoutMs);

      this.pending.set(envelope.taskId, { resolve, reject, timer });
      this.transport.send(peerId, bytes).catch((error) => {
        clearTimeout(timer);
        this.pending.delete(envelope.taskId);
        reject(error);
      });
    });
  }

  async discover(toolName: string): Promise<string[]> {
    return this.transport.discover(toolName);
  }

  checkFleetSibling(remoteCert: DelegationCert): boolean {
    if (!this.delegation) {
      return false;
    }
    return isFleetSibling(this.delegation, remoteCert);
  }

  getPeerCert(peerId: string): DelegationCert | undefined {
    return this.peerCerts.get(peerId);
  }

  private isValidWireMessage(parsed: unknown): parsed is WireMessage {
    if (typeof parsed !== 'object' || parsed === null) {
      return false;
    }
    const obj = parsed as Record<string, unknown>;
    if (typeof obj.type !== 'string') {
      return false;
    }
    switch (obj.type) {
      case 'task': {
        const envelope = obj.envelope;
        return (
          typeof envelope === 'object' &&
          envelope !== null &&
          typeof (envelope as Record<string, unknown>).taskId === 'string'
        );
      }
      case 'response': {
        const response = obj.response;
        return (
          typeof response === 'object' &&
          response !== null &&
          typeof (response as Record<string, unknown>).taskId === 'string'
        );
      }
      case 'cert-exchange': {
        const cert = obj.cert;
        return (
          typeof cert === 'object' &&
          cert !== null &&
          typeof (cert as Record<string, unknown>).owner === 'string'
        );
      }
      default: {
        return false;
      }
    }
  }

  private handleMessage(peerId: string, msg: Uint8Array): void {
    let parsed: unknown;
    try {
      parsed = JSON.parse(new TextDecoder().decode(msg));
    } catch {
      return; // Ignore malformed messages
    }

    if (!this.isValidWireMessage(parsed)) {
      return;
    }

    const wireMsg = parsed;

    switch (wireMsg.type) {
      case 'task': {
        void this.handleTask(peerId, wireMsg.envelope);
        break;
      }
      case 'response': {
        this.handleResponse(wireMsg.response);
        break;
      }
      case 'cert-exchange': {
        this.handleCertExchange(peerId, wireMsg.cert);
        break;
      }
    }
  }

  private async handleTask(peerId: string, envelope: TaskEnvelope): Promise<void> {
    // 1. Verify signature
    if (!verifyTaskEnvelope(envelope)) {
      const errorResponse = createTaskResponse(this.identity, envelope.taskId, {
        error: 'invalid signature',
      });
      const wireMsg: WireMessage = { type: 'response', response: errorResponse };
      await this.transport.send(peerId, canonicalize(wireMsg));
      return;
    }

    // 2. Look up tool handler
    const handler = this.tools.getHandler(envelope.tool);
    if (!handler) {
      const errorResponse = createTaskResponse(this.identity, envelope.taskId, {
        error: `unknown tool: ${envelope.tool}`,
      });
      const wireMsg: WireMessage = { type: 'response', response: errorResponse };
      await this.transport.send(peerId, canonicalize(wireMsg));
      return;
    }

    // 3. Validate payload against tool definition
    const tool = this.tools.getTool(envelope.tool);
    if (tool) {
      const validation = validatePayload(tool, envelope.payload);
      if (!validation.valid) {
        const errorResponse = createTaskResponse(this.identity, envelope.taskId, {
          error: validation.error ?? 'invalid payload',
        });
        const wireMsg: WireMessage = { type: 'response', response: errorResponse };
        await this.transport.send(peerId, canonicalize(wireMsg));
        return;
      }
    }

    // 4. Execute handler
    try {
      const result = await handler(envelope.payload);
      const response = createTaskResponse(this.identity, envelope.taskId, result);
      const wireMsg: WireMessage = { type: 'response', response };
      await this.transport.send(peerId, canonicalize(wireMsg));
    } catch (error) {
      const errorResponse = createTaskResponse(this.identity, envelope.taskId, {
        error: error instanceof Error ? error.message : 'handler failed',
      });
      const wireMsg: WireMessage = { type: 'response', response: errorResponse };
      await this.transport.send(peerId, canonicalize(wireMsg));
    }
  }

  private handleResponse(response: TaskResponse): void {
    const pending = this.pending.get(response.taskId);
    if (!pending) {
      return;
    }

    this.pending.delete(response.taskId);
    clearTimeout(pending.timer);

    if (!verifyTaskResponse(response)) {
      pending.reject(new Error('Invalid task response signature'));
      return;
    }

    pending.resolve(response);
  }

  private handleCertExchange(peerId: string, cert: DelegationCert): void {
    if (verifyDelegationCert(cert)) {
      this.peerCerts.set(peerId, cert);
    }
  }

  async exchangeCert(peerId: string): Promise<void> {
    if (!this.delegation) {
      throw new Error('No delegation cert to exchange');
    }
    const wireMsg: WireMessage = { type: 'cert-exchange', cert: this.delegation };
    await this.transport.send(peerId, canonicalize(wireMsg));
  }
}
