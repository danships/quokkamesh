import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { LocalTransport } from '../src/transport/local.js';
import type { Tool } from '../src/protocol/types.js';

const echoTool: Tool = { name: 'echo', description: 'Echoes back the message it receives' };

describe('LocalTransport', () => {
  let transportA: LocalTransport;
  let transportB: LocalTransport;

  beforeEach(async () => {
    transportA = new LocalTransport('agent-A');
    transportB = new LocalTransport('agent-B');
    await transportA.start();
    await transportB.start();
  });

  afterEach(async () => {
    await transportA.stop();
    await transportB.stop();
  });

  it('uses explicit peerId when provided', () => {
    expect(transportA.peerId).toBe('agent-A');
    expect(transportB.peerId).toBe('agent-B');
  });

  it('generates peerId when not provided', () => {
    const t = new LocalTransport();
    expect(t.peerId).toBeDefined();
    expect(t.peerId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
    t.stop();
  });

  it('agent A discovers agent B by tool name', async () => {
    await transportB.advertise([echoTool]);

    const peerIds = await transportA.discover('echo');
    expect(peerIds).toContain('agent-B');
    expect(peerIds).toHaveLength(1);
  });

  it('discover returns empty when no peer advertises the tool', async () => {
    const peerIds = await transportA.discover('nonexistent');
    expect(peerIds).toEqual([]);
  });

  it('discover returns all peers that advertise the tool', async () => {
    const transportC = new LocalTransport('agent-C');
    await transportC.start();
    await transportB.advertise([echoTool]);
    await transportC.advertise([echoTool]);

    const peerIds = await transportA.discover('echo');
    expect(peerIds).toHaveLength(2);
    expect(peerIds).toContain('agent-B');
    expect(peerIds).toContain('agent-C');

    await transportC.stop();
  });

  it('send delivers message to target onMessage handler', async () => {
    const received: { peerId: string; msg: Uint8Array }[] = [];
    transportB.onMessage((peerId, msg) => {
      received.push({ peerId, msg });
    });

    const payload = new TextEncoder().encode('hello');
    await transportA.send('agent-B', payload);

    expect(received).toHaveLength(1);
    expect(received[0].peerId).toBe('agent-A');
    expect(new TextDecoder().decode(received[0].msg)).toBe('hello');
  });

  it('send to unknown peer throws', async () => {
    await expect(transportA.send('unknown-peer', new Uint8Array())).rejects.toThrow(
      'peer not found',
    );
  });

  it('advertise before start throws', async () => {
    const t = new LocalTransport('orphan');
    await expect(t.advertise([echoTool])).rejects.toThrow('cannot advertise before start');
  });
});
