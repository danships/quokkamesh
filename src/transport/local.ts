import type { Tool } from '../protocol/types.js';
import type { Transport } from './interface.js';

interface RegistryEntry {
  transport: LocalTransport;
  tools: Tool[];
}

const registry = new Map<string, RegistryEntry>();

/**
 * In-memory transport. All instances in the same process share a static registry.
 * Useful for unit tests — no ports, no networking, instant delivery.
 */
export class LocalTransport implements Transport {
  readonly peerId: string;
  private messageHandler: ((peerId: string, msg: Uint8Array) => void) | null = null;
  private started = false;

  constructor(peerId?: string) {
    this.peerId = peerId ?? crypto.randomUUID();
  }

  async start(): Promise<void> {
    if (this.started) {
      return;
    }
    registry.set(this.peerId, { transport: this, tools: [] });
    this.started = true;
  }

  async stop(): Promise<void> {
    if (!this.started) {
      return;
    }
    registry.delete(this.peerId);
    this.started = false;
  }

  onMessage(handler: (peerId: string, msg: Uint8Array) => void): void {
    this.messageHandler = handler;
  }

  async send(peerId: string, message: Uint8Array): Promise<void> {
    const entry = registry.get(peerId);
    if (!entry) {
      throw new Error(`LocalTransport: peer not found: ${peerId}`);
    }
    entry.transport.deliver(this.peerId, message);
  }

  /** Internal: deliver a message to this transport's handler. */
  deliver(fromPeerId: string, message: Uint8Array): void {
    if (this.messageHandler) {
      this.messageHandler(fromPeerId, message);
    }
  }

  async advertise(tools: Tool[]): Promise<void> {
    const entry = registry.get(this.peerId);
    if (!entry) {
      throw new Error('LocalTransport: cannot advertise before start()');
    }
    entry.tools = [...tools];
  }

  async discover(toolName: string): Promise<string[]> {
    const peerIds: string[] = [];
    for (const [pid, entry] of registry) {
      if (entry.tools.some((t) => t.name === toolName)) {
        peerIds.push(pid);
      }
    }
    return peerIds;
  }
}
