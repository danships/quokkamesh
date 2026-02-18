import { describe, it, expect, afterEach } from 'vitest';
import { Agent } from '../src/agent.js';
import { Libp2pTransport } from '../src/transport/libp2p.js';
import { verifyTaskResponse } from '../src/protocol/envelope.js';
import { echoTool, echoHandler } from './fixtures/echo.js';

describe('P2P Integration', () => {
  let agentA: Agent;
  let agentB: Agent;
  let transportA: Libp2pTransport;
  let transportB: Libp2pTransport;

  afterEach(async () => {
    await agentA?.stop();
    await agentB?.stop();
  });

  async function setupAgents(): Promise<void> {
    // Agent B starts first (no bootstrap needed)
    transportB = new Libp2pTransport({ listenPort: 0 });
    agentB = new Agent(transportB);
    agentB.registerTool(echoTool, echoHandler);
    await agentB.start();

    // Get B's multiaddr for A to bootstrap to
    const bAddrs = transportB.getMultiaddrs();
    expect(bAddrs.length).toBeGreaterThan(0);

    // Agent A bootstraps to B
    transportA = new Libp2pTransport({
      listenPort: 0,
      bootstrapAddrs: bAddrs,
    });
    agentA = new Agent(transportA);
    await agentA.start();

    // Wait for connection
    await transportA.waitForPeer(agentB.peerId, 10_000);
  }

  it('two agents connect over TCP', async () => {
    await expect(setupAgents()).resolves.toBeUndefined();
  }, 15_000);

  it('agent A discovers agent B by tool name', async () => {
    await setupAgents();

    // Wait for tool advertisement to propagate
    const peerIds = await transportA.waitForTool('echo', 10_000);
    expect(peerIds).toContain(agentB.peerId);
  }, 15_000);

  it('full task round-trip over P2P', async () => {
    await setupAgents();

    // Wait for tool discovery
    await transportA.waitForTool('echo', 10_000);

    // Send task and get response
    const response = await agentA.request(agentB.peerId, 'echo', { message: 'hello p2p' });

    // Verify signature
    expect(verifyTaskResponse(response)).toBe(true);
  }, 15_000);

  it('response payload is correct', async () => {
    await setupAgents();

    await transportA.waitForTool('echo', 10_000);

    const response = await agentA.request(agentB.peerId, 'echo', { message: 'mesh works' });
    expect(response.result).toEqual({ echo: 'mesh works' });
  }, 15_000);
});
