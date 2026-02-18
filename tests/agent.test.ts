import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Agent } from '../src/agent.js';
import { LocalTransport } from '../src/transport/local.js';
import { generateIdentity } from '../src/identity/keys.js';
import { createDelegationCert } from '../src/identity/delegation.js';
import { verifyTaskResponse } from '../src/protocol/envelope.js';
import { echoTool, echoHandler } from './fixtures/echo.js';

describe('Agent — LocalTransport integration', () => {
  let agentA: Agent;
  let agentB: Agent;

  beforeEach(async () => {
    const transportA = new LocalTransport();
    const transportB = new LocalTransport();

    agentA = new Agent(transportA);
    agentB = new Agent(transportB);

    agentB.registerTool(echoTool, echoHandler);

    await agentB.start();
    await agentA.start();
  });

  afterEach(async () => {
    await agentA.stop();
    await agentB.stop();
  });

  it('agent A discovers agent B by tool name', async () => {
    const peerIds = await agentA.discover('echo');
    expect(peerIds).toContain(agentB.peerId);
    expect(peerIds).toHaveLength(1);
  });

  it('agent A sends task, agent B responds', async () => {
    const response = await agentA.request(agentB.peerId, 'echo', { message: 'hello' });
    expect(response.result).toEqual({ echo: 'hello' });
  });

  it('response signature is valid', async () => {
    const response = await agentA.request(agentB.peerId, 'echo', { message: 'hello' });
    expect(verifyTaskResponse(response)).toBe(true);
  });

  it('unknown tool returns error', async () => {
    const response = await agentA.request(agentB.peerId, 'nonexistent', { data: 1 });
    expect(response.result).toEqual({ error: 'unknown tool: nonexistent' });
  });

  it('invalid signature is rejected', async () => {
    // Manually craft a tampered envelope by sending raw bytes
    const { createTaskEnvelope } = await import('../src/protocol/envelope.js');
    const { canonicalize } = await import('../src/identity/serialize.js');

    const envelope = createTaskEnvelope(agentA.identity, agentB.peerId, 'echo', {
      message: 'hello',
    });
    // Tamper with the payload after signing
    envelope.payload = { message: 'tampered' };

    const wireMsg = { type: 'task' as const, envelope };
    const bytes = canonicalize(wireMsg);

    // Set up a handler to capture the response
    const transportA = (agentA as unknown as { transport: LocalTransport }).transport;

    const responsePromise = new Promise<string>((resolve) => {
      // Replace the agent's message handler temporarily
      const originalHandler = transportA['messageHandler'];
      transportA.onMessage((peerId, msg) => {
        const decoded = JSON.parse(new TextDecoder().decode(msg));
        if (decoded.type === 'response') {
          resolve(JSON.stringify(decoded.response.result));
        }
        if (originalHandler) {
          originalHandler(peerId, msg);
        }
      });
    });

    await transportA.send(agentB.peerId, bytes);
    const result = await responsePromise;
    expect(JSON.parse(result)).toEqual({ error: 'invalid signature' });
  });
});

describe('Agent — Fleet recognition', () => {
  let agentA: Agent;
  let agentB: Agent;

  afterEach(async () => {
    await agentA?.stop();
    await agentB?.stop();
  });

  it('fleet siblings recognize each other', async () => {
    const owner = generateIdentity();

    const certA = createDelegationCert(owner, generateIdentity().publicKey, ['*'], 60_000);
    const certB = createDelegationCert(owner, generateIdentity().publicKey, ['*'], 60_000);

    agentA = new Agent(new LocalTransport(), certA);
    agentB = new Agent(new LocalTransport(), certB);

    agentB.registerTool(echoTool, echoHandler);
    await agentA.start();
    await agentB.start();

    // Exchange certs
    await agentA.exchangeCert(agentB.peerId);
    await agentB.exchangeCert(agentA.peerId);

    // Check fleet recognition
    const bCert = agentA.getPeerCert(agentB.peerId);
    expect(bCert).toBeDefined();
    expect(agentA.checkFleetSibling(bCert!)).toBe(true);
  });

  it('non-fleet agents are not siblings', async () => {
    const ownerA = generateIdentity();
    const ownerB = generateIdentity();

    const certA = createDelegationCert(ownerA, generateIdentity().publicKey, ['*'], 60_000);
    const certB = createDelegationCert(ownerB, generateIdentity().publicKey, ['*'], 60_000);

    agentA = new Agent(new LocalTransport(), certA);
    agentB = new Agent(new LocalTransport(), certB);

    agentB.registerTool(echoTool, echoHandler);
    await agentA.start();
    await agentB.start();

    // Exchange certs
    await agentA.exchangeCert(agentB.peerId);
    await agentB.exchangeCert(agentA.peerId);

    const bCert = agentA.getPeerCert(agentB.peerId);
    expect(bCert).toBeDefined();
    expect(agentA.checkFleetSibling(bCert!)).toBe(false);
  });
});
