import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Agent } from '../src/agent.js';
import { Libp2pTransport } from '../src/transport/libp2p.js';
import { echoTool, echoHandler } from './fixtures/echo.js';
import { dialableLocalAddrs } from './fixtures/local-addrs.js';

const runP2PIntegration = Boolean(process.env['RUN_P2P_INTEGRATION']);

/**
 * Integration tests for DHT-based capability advertising and search.
 * Two agents: B advertises a tool (and provides it on the DHT), A discovers via discover()
 * and findProvidersForCapability().
 * Skipped by default; run with RUN_P2P_INTEGRATION=1 pnpm test when you have a working network.
 */
describe.skipIf(!runP2PIntegration)(
  'Capability discovery (DHT advertise and search)',
  () => {
  let transportA: Libp2pTransport;
  let transportB: Libp2pTransport;
  let agentA: Agent;
  let agentB: Agent;

  beforeAll(async () => {
    transportB = new Libp2pTransport({
      listenPort: 0,
      network: 'lan',
      advertiseCapabilities: true,
    });
    agentB = new Agent(transportB);
    agentB.registerTool(echoTool, echoHandler);
    await agentB.start();

    const bAddrs = dialableLocalAddrs(
      transportB.getMultiaddrs(),
      agentB.peerId,
    );
    expect(bAddrs.length).toBeGreaterThan(0);

    transportA = new Libp2pTransport({
      listenPort: 0,
      bootstrapAddrs: bAddrs,
      network: 'lan',
      advertiseCapabilities: true,
    });
    agentA = new Agent(transportA);
    await agentA.start();

    await transportA.dialAddresses(bAddrs);
    await transportA.waitForPeer(agentB.peerId, 20_000);
    await transportA.waitForTool('echo', 20_000);
  }, 60_000);

  afterAll(async () => {
    await agentA?.stop();
    await agentB?.stop();
  }, 20_000);

  it('discover(toolName) finds provider (stream exchange or DHT)', async () => {
    const peerIds = await transportA.discover('echo');
    expect(peerIds).toContain(agentB.peerId);
    expect(peerIds.length).toBeGreaterThanOrEqual(1);
  }, 15_000);

  it('findProvidersForCapability returns array and eventually finds provider', async () => {
    const descriptor = 'echo';
    const peerIds = await transportA.findProvidersForCapability(descriptor);
    expect(Array.isArray(peerIds)).toBe(true);
    expect(peerIds.every((id) => typeof id === 'string')).toBe(true);
    if (peerIds.length > 0) {
      expect(peerIds).toContain(agentB.peerId);
    }
  }, 15_000);

  it('findProvidersForCapability with unknown descriptor returns empty', async () => {
    const peerIds = await transportA.findProvidersForCapability(
      'nonexistent-tool-xyz',
    );
    expect(peerIds).toEqual([]);
  });

  it('full round-trip: discover then request', async () => {
    const peerIds = await transportA.discover('echo');
    expect(peerIds).toContain(agentB.peerId);
    const response = await agentA.request(agentB.peerId, 'echo', {
      message: 'capability discovery works',
    });
    expect(response.result).toEqual({
      echo: 'capability discovery works',
    });
  }, 15_000);
  },
);
