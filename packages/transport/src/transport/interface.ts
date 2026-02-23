import type { Tool } from '../protocol/types.js';

/**
 * Transport adapter interface. Abstracts message passing and discovery
 * so that Agent can work with in-memory (LocalTransport) or P2P (Libp2pTransport).
 */
export interface Transport {
  /** Start the transport (e.g. bind ports, join DHT). */
  start(): Promise<void>;

  /** Stop the transport and release resources. */
  stop(): Promise<void>;

  /** Send raw bytes to a peer by peerId. */
  send(peerId: string, message: Uint8Array): Promise<void>;

  /** Register handler for incoming messages. Called with (sender peerId, raw message bytes). */
  onMessage(handler: (peerId: string, msg: Uint8Array) => void): void;

  /** Advertise that this peer provides the given tools (for discovery). */
  advertise(tools: Tool[]): Promise<void>;

  /** Discover peerIds that advertise the given tool name. */
  discover(toolName: string): Promise<string[]>;

  /** This transport's peer identity (used for addressing by other peers). */
  readonly peerId: string;
}
