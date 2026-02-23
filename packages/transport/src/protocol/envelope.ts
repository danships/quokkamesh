import * as ed from '@noble/ed25519';
import { type AgentIdentity, sign, verify } from '../identity/keys.js';
import { canonicalize } from '../identity/serialize.js';
import type { TaskEnvelope, TaskResponse } from './types.js';

const { bytesToHex, hexToBytes } = ed.etc;

export function createTaskEnvelope(
  identity: AgentIdentity,
  to: string,
  tool: string,
  payload: unknown,
): TaskEnvelope {
  const unsigned = {
    taskId: crypto.randomUUID(),
    from: bytesToHex(identity.publicKey),
    to,
    tool,
    payload,
    timestamp: Date.now(),
  };

  const message = canonicalize(unsigned);
  const signature = sign(message, identity.secretKey);

  return { ...unsigned, signature: bytesToHex(signature) };
}

export function verifyTaskEnvelope(envelope: TaskEnvelope): boolean {
  const { signature, ...unsigned } = envelope;
  const message = canonicalize(unsigned);

  return verify(hexToBytes(signature), message, hexToBytes(envelope.from));
}

export function createTaskResponse(
  identity: AgentIdentity,
  taskId: string,
  result: unknown,
): TaskResponse {
  const unsigned = {
    taskId,
    from: bytesToHex(identity.publicKey),
    result,
    timestamp: Date.now(),
  };

  const message = canonicalize(unsigned);
  const signature = sign(message, identity.secretKey);

  return { ...unsigned, signature: bytesToHex(signature) };
}

export function verifyTaskResponse(response: TaskResponse): boolean {
  const { signature, ...unsigned } = response;
  const message = canonicalize(unsigned);

  return verify(hexToBytes(signature), message, hexToBytes(response.from));
}
