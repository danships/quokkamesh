import * as ed from '@noble/ed25519';
import { type AgentIdentity, sign, verify } from './keys.js';
import { canonicalize } from './serialize.js';

const { bytesToHex, hexToBytes } = ed.etc;

export interface DelegationCert {
  owner: string;
  agent: string;
  scope: string[];
  issuedAt: number;
  expiresAt: number;
  signature: string;
}

export function createDelegationCert(
  ownerIdentity: AgentIdentity,
  agentPublicKey: Uint8Array,
  scope: string[],
  ttlMs: number,
): DelegationCert {
  const now = Date.now();
  const unsigned = {
    owner: bytesToHex(ownerIdentity.publicKey),
    agent: bytesToHex(agentPublicKey),
    scope,
    issuedAt: now,
    expiresAt: now + ttlMs,
  };

  const message = canonicalize(unsigned);
  const signature = sign(message, ownerIdentity.secretKey);

  return { ...unsigned, signature: bytesToHex(signature) };
}

export function verifyDelegationCert(cert: DelegationCert): boolean {
  if (cert.expiresAt <= Date.now()) {
    return false;
  }

  const { signature, ...unsigned } = cert;
  const message = canonicalize(unsigned);

  return verify(hexToBytes(signature), message, hexToBytes(cert.owner));
}

export function isFleetSibling(certA: DelegationCert, certB: DelegationCert): boolean {
  return verifyDelegationCert(certA) && verifyDelegationCert(certB) && certA.owner === certB.owner;
}
