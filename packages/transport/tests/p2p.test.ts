import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Agent } from '../src/agent.js';
import { Libp2pTransport } from '../src/transport/libp2p.js';
import { verifyTaskResponse } from '../src/protocol/envelope.js';
import { echoTool, echoHandler } from './fixtures/echo.js';

describe('P2P Integration', () => {
  let agentA: Agent;
  let agentB: Agent;
  let transportA: Libp2pTransport;
  let transportB: Libp2pTransport;

  beforeAll(async () => {
    // Agent B starts first (no bootstrap needed)
    transportB = new Libp2pTransport({ listenPort: 0 });
    agentB = new Agent(transportB);
    agentB.registerTool(echoTool, echoHandler);
    await agentB.start();

    const bAddrs = transportB.getMultiaddrs();
    expect(bAddrs.length).toBeGreaterThan(0);

    transportA = new Libp2pTransport({
      listenPort: 0,
      bootstrapAddrs: bAddrs,
    });
    agentA = new Agent(transportA);
    await agentA.start();

    await transportA.waitForPeer(agentB.peerId, 10_000);
    await transportA.waitForTool('echo', 10_000);
  }, 30_000);

  afterAll(async () => {
    await agentA?.stop();
    await agentB?.stop();
  }, 15_000);

  it('two agents connect over TCP', () => {
    expect(transportA).toBeDefined();
    expect(transportB).toBeDefined();
    expect(agentB.peerId).toBeDefined();
  });

  it('agent A discovers agent B by tool name', async () => {
    const peerIds = await transportA.discover('echo');
    expect(peerIds).toContain(agentB.peerId);
  }, 30_000);

  it('full task round-trip over P2P', async () => {
    const response = await agentA.request(agentB.peerId, 'echo', { message: 'hello p2p' });

    expect(verifyTaskResponse(response)).toBe(true);
  }, 30_000);

  it('response payload is correct', async () => {
    const response = await agentA.request(agentB.peerId, 'echo', { message: 'mesh works' });
    expect(response.result).toEqual({ echo: 'mesh works' });
  }, 30_000);
});
