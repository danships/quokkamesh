import { describe, it, expect } from 'vitest';
import { generateIdentity } from '../src/identity/keys.js';
import {
  createTaskEnvelope,
  verifyTaskEnvelope,
  createTaskResponse,
  verifyTaskResponse,
} from '../src/protocol/envelope.js';
import * as ed from '@noble/ed25519';

const { bytesToHex } = ed.etc;

describe('TaskEnvelope', () => {
  it('creates a valid TaskEnvelope', () => {
    const sender = generateIdentity();
    const receiver = generateIdentity();
    const envelope = createTaskEnvelope(sender, bytesToHex(receiver.publicKey), 'echo', {
      message: 'hello',
    });

    expect(envelope.taskId).toMatch(/^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/);
    expect(envelope.from).toBe(bytesToHex(sender.publicKey));
    expect(envelope.to).toBe(bytesToHex(receiver.publicKey));
    expect(envelope.tool).toBe('echo');
    expect(envelope.payload).toEqual({ message: 'hello' });
    expect(envelope.timestamp).toBeLessThanOrEqual(Date.now());
    expect(envelope.signature).toMatch(/^[\da-f]{128}$/);
  });

  it('TaskEnvelope signature verifies', () => {
    const sender = generateIdentity();
    const receiver = generateIdentity();
    const envelope = createTaskEnvelope(sender, bytesToHex(receiver.publicKey), 'echo', {
      message: 'hello',
    });

    expect(verifyTaskEnvelope(envelope)).toBe(true);
  });

  it('tampered envelope fails verification', () => {
    const sender = generateIdentity();
    const receiver = generateIdentity();
    const envelope = createTaskEnvelope(sender, bytesToHex(receiver.publicKey), 'echo', {
      message: 'hello',
    });

    const tampered = { ...envelope, payload: { message: 'tampered' } };
    expect(verifyTaskEnvelope(tampered)).toBe(false);
  });
});

describe('TaskResponse', () => {
  it('creates a valid TaskResponse', () => {
    const responder = generateIdentity();
    const response = createTaskResponse(responder, crypto.randomUUID(), { echo: 'hello' });

    expect(response.taskId).toBeDefined();
    expect(response.from).toBe(bytesToHex(responder.publicKey));
    expect(response.result).toEqual({ echo: 'hello' });
    expect(response.timestamp).toBeLessThanOrEqual(Date.now());
    expect(response.signature).toMatch(/^[\da-f]{128}$/);
  });

  it('TaskResponse signature verifies', () => {
    const responder = generateIdentity();
    const response = createTaskResponse(responder, crypto.randomUUID(), { echo: 'hello' });

    expect(verifyTaskResponse(response)).toBe(true);
  });

  it('tampered response fails verification', () => {
    const responder = generateIdentity();
    const response = createTaskResponse(responder, crypto.randomUUID(), { echo: 'hello' });

    const tampered = { ...response, result: { echo: 'tampered' } };
    expect(verifyTaskResponse(tampered)).toBe(false);
  });
});
