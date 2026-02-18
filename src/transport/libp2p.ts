import { createLibp2p } from 'libp2p';
import { tcp } from '@libp2p/tcp';
import { noise } from '@chainsafe/libp2p-noise';
import { yamux } from '@chainsafe/libp2p-yamux';
import { bootstrap } from '@libp2p/bootstrap';
import { identify } from '@libp2p/identify';
import type { Libp2p } from 'libp2p';
import type { PeerId, Stream } from '@libp2p/interface';
import type { Tool } from '../protocol/types.js';
import type { Transport } from './interface.js';

const PROTOCOL = '/agentmesh/task/1.0.0';

export interface Libp2pTransportOptions {
  /** TCP port to listen on (0 = random). */
  listenPort?: number;
  /** Multiaddrs to bootstrap to (e.g. other agent addresses). */
  bootstrapAddrs?: string[];
}

/**
 * Real P2P transport using libp2p (TCP + Noise + Yamux).
 *
 * For the PoC, discovery uses bootstrap peers and a simple tool-advertisement
 * protocol rather than full Kademlia DHT.
 */
/** Event detail for peer:discovery (id is PeerId). */
type PeerDiscoveryEvent = { detail: { id: PeerId } };
/** Event detail for connection:open (remotePeer is PeerId). */
type ConnectionOpenEvent = { detail: { remotePeer: PeerId } };

export class Libp2pTransport implements Transport {
  private node!: Libp2p;
  private messageHandler: ((peerId: string, msg: Uint8Array) => void) | null = null;
  private peerDiscoveryHandler: ((e: PeerDiscoveryEvent) => void) | null = null;
  private connectionOpenHandler: ((e: ConnectionOpenEvent) => void) | null = null;
  private readonly listenPort: number;
  private readonly bootstrapAddrs: string[];
  private readonly localTools: Tool[] = [];
  private readonly peerTools = new Map<string, Tool[]>();
  private started = false;

  constructor(options: Libp2pTransportOptions = {}) {
    this.listenPort = options.listenPort ?? 0;
    this.bootstrapAddrs = options.bootstrapAddrs ?? [];
  }

  get peerId(): string {
    if (!this.node) {
      throw new Error('Libp2pTransport not started: call start() before accessing peerId');
    }
    return this.node.peerId.toString();
  }

  async start(): Promise<void> {
    if (this.started) {
      return;
    }

    const peerDiscovery =
      this.bootstrapAddrs.length > 0 ? [bootstrap({ list: this.bootstrapAddrs })] : [];

    this.node = await createLibp2p({
      addresses: {
        listen: [`/ip4/127.0.0.1/tcp/${this.listenPort}`],
      },
      transports: [tcp()],
      connectionEncrypters: [noise()],
      streamMuxers: [yamux()],
      peerDiscovery,
      services: {
        identify: identify(),
      },
    });

    // Handle incoming task messages
    await this.node.handle(PROTOCOL, (stream, connection) => {
      const remotePeer = connection.remotePeer.toString();
      this.readStream(stream, remotePeer);
    });

    // Handle incoming tool advertisement messages
    await this.node.handle('/agentmesh/tools/1.0.0', (stream, connection) => {
      const remotePeer = connection.remotePeer.toString();
      this.readToolsStream(stream, remotePeer);
    });

    // Auto-dial discovered peers and exchange tools
    this.peerDiscoveryHandler = (event) => {
      const peerId = event.detail.id;
      void this.node.dial(peerId).catch(() => {
        // Ignore dial errors during discovery
      });
    };
    this.node.addEventListener('peer:discovery', this.peerDiscoveryHandler as (e: unknown) => void);

    // When a new connection is established, send our tools (with a brief
    // delay so the remote peer's protocol handlers are ready).
    this.connectionOpenHandler = (event) => {
      const remotePeer = event.detail.remotePeer.toString();
      if (this.localTools.length > 0) {
        void this.sendToolAdvertisementWithRetry(remotePeer).catch(() => {
          // Ignore errors during tool advertisement
        });
      }
    };
    this.node.addEventListener(
      'connection:open',
      this.connectionOpenHandler as (e: unknown) => void,
    );

    await this.node.start();
    this.started = true;
  }

  async stop(): Promise<void> {
    if (!this.started) {
      return;
    }
    if (this.node) {
      if (this.peerDiscoveryHandler) {
        this.node.removeEventListener(
          'peer:discovery',
          this.peerDiscoveryHandler as (e: unknown) => void,
        );
        this.peerDiscoveryHandler = null;
      }
      if (this.connectionOpenHandler) {
        this.node.removeEventListener(
          'connection:open',
          this.connectionOpenHandler as (e: unknown) => void,
        );
        this.connectionOpenHandler = null;
      }
      await this.node.stop();
    }
    this.peerTools.clear();
    this.localTools.length = 0;
    this.started = false;
  }

  onMessage(handler: (peerId: string, msg: Uint8Array) => void): void {
    this.messageHandler = handler;
  }

  async send(peerId: string, message: Uint8Array): Promise<void> {
    const connections = this.node.getConnections();
    const conn = connections.find((c) => c.remotePeer.toString() === peerId);
    if (!conn) {
      throw new Error(`Libp2pTransport: no connection to peer: ${peerId}`);
    }

    const stream = await conn.newStream(PROTOCOL);
    await this.writeAndClose(stream, message);
  }

  async advertise(tools: Tool[]): Promise<void> {
    this.localTools.length = 0;
    this.localTools.push(...tools);

    // Send tool advertisement to all connected peers
    const peers = this.node.getPeers();
    await Promise.all(
      peers.map((peerId) => this.sendToolAdvertisement(peerId.toString()).catch(() => {})),
    );
  }

  async discover(toolName: string): Promise<string[]> {
    const peerIds: string[] = [];
    for (const [pid, tools] of this.peerTools) {
      if (tools.some((t) => t.name === toolName)) {
        peerIds.push(pid);
      }
    }
    return peerIds;
  }

  /** Get the multiaddrs this transport is listening on. */
  getMultiaddrs(): string[] {
    return this.node.getMultiaddrs().map((ma) => ma.toString());
  }

  /** Wait for a connection to a specific peer (with timeout). */
  async waitForPeer(peerId: string, timeoutMs = 10_000): Promise<void> {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      const connections = this.node.getConnections();
      if (connections.some((c) => c.remotePeer.toString() === peerId)) {
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    throw new Error(`Timeout waiting for peer: ${peerId}`);
  }

  /** Wait until at least one peer advertises the given tool (with timeout). */
  async waitForTool(toolName: string, timeoutMs = 10_000): Promise<string[]> {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      const peerIds = await this.discover(toolName);
      if (peerIds.length > 0) {
        return peerIds;
      }
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    throw new Error(`Timeout waiting for tool: ${toolName}`);
  }

  private async sendToolAdvertisementWithRetry(
    peerId: string,
    retries = 3,
    delayMs = 200,
  ): Promise<void> {
    for (let i = 0; i < retries; i++) {
      try {
        await new Promise((resolve) => setTimeout(resolve, delayMs));
        await this.sendToolAdvertisement(peerId);
        return;
      } catch {
        if (i === retries - 1) {
          throw new Error(`Failed to send tool advertisement to ${peerId}`);
        }
      }
    }
  }

  private async sendToolAdvertisement(peerId: string): Promise<void> {
    const connections = this.node.getConnections();
    const conn = connections.find((c) => c.remotePeer.toString() === peerId);
    if (!conn) {
      return;
    }

    const payload = JSON.stringify(this.localTools);
    const bytes = new TextEncoder().encode(payload);
    const stream = await conn.newStream('/agentmesh/tools/1.0.0');
    await this.writeAndClose(stream, bytes);
  }

  private readStream(stream: Stream, remotePeer: string): void {
    stream.addEventListener('message', (event) => {
      if (!this.messageHandler) {
        return;
      }
      const data = event.data;
      const bytes = data instanceof Uint8Array ? data : data.subarray();
      this.messageHandler(remotePeer, bytes);
    });
  }

  private readToolsStream(stream: Stream, remotePeer: string): void {
    stream.addEventListener('message', (event) => {
      try {
        const data = event.data;
        const bytes = data instanceof Uint8Array ? data : data.subarray();
        const json = new TextDecoder().decode(bytes);
        const tools = JSON.parse(json) as Tool[];
        this.peerTools.set(remotePeer, tools);
      } catch {
        // Ignore malformed tool advertisements
      }
    });
  }

  private async writeAndClose(stream: Stream, data: Uint8Array): Promise<void> {
    const drained = stream.send(data);
    if (!drained) {
      await stream.onDrain();
    }
    await stream.close();
  }
}
