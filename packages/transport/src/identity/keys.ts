import * as ed from '@noble/ed25519';
import { sha512 } from '@noble/hashes/sha2';

ed.hashes.sha512 = (...msgs: Uint8Array[]) => sha512(ed.etc.concatBytes(...msgs));

export interface AgentIdentity {
  publicKey: Uint8Array;
  secretKey: Uint8Array;
}

export function generateIdentity(): AgentIdentity {
  const secretKey = ed.utils.randomSecretKey();
  const publicKey = ed.getPublicKey(secretKey);
  return { publicKey, secretKey };
}

export function sign(message: Uint8Array, secretKey: Uint8Array): Uint8Array {
  return ed.sign(message, secretKey);
}

export function verify(signature: Uint8Array, message: Uint8Array, publicKey: Uint8Array): boolean {
  try {
    return ed.verify(signature, message, publicKey);
  } catch {
    return false;
  }
}
