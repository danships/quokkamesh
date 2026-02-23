import { describe, it, expect } from 'vitest';
import { generateIdentity } from '../src/identity/keys.js';
import {
  createDelegationCert,
  verifyDelegationCert,
  isFleetSibling,
} from '../src/identity/delegation.js';
import * as ed from '@noble/ed25519';

const { bytesToHex } = ed.etc;
const ONE_HOUR = 60 * 60 * 1000;

describe('delegation', () => {
  it('creates a valid delegation cert', () => {
    const owner = generateIdentity();
    const agent = generateIdentity();
    const cert = createDelegationCert(owner, agent.publicKey, ['*'], ONE_HOUR);

    expect(cert.owner).toBe(bytesToHex(owner.publicKey));
    expect(cert.agent).toBe(bytesToHex(agent.publicKey));
    expect(cert.scope).toEqual(['*']);
    expect(cert.issuedAt).toBeLessThanOrEqual(Date.now());
    expect(cert.expiresAt).toBeGreaterThan(Date.now());
    expect(cert.signature).toMatch(/^[\da-f]{128}$/);
  });

  it('delegation cert signature verifies', () => {
    const owner = generateIdentity();
    const agent = generateIdentity();
    const cert = createDelegationCert(owner, agent.publicKey, ['*'], ONE_HOUR);

    expect(verifyDelegationCert(cert)).toBe(true);
  });

  it('tampered cert fails verification', () => {
    const owner = generateIdentity();
    const agent = generateIdentity();
    const cert = createDelegationCert(owner, agent.publicKey, ['*'], ONE_HOUR);

    const tampered = { ...cert, agent: bytesToHex(generateIdentity().publicKey) };
    expect(verifyDelegationCert(tampered)).toBe(false);
  });

  it('expired cert fails verification', () => {
    const owner = generateIdentity();
    const agent = generateIdentity();
    const cert = createDelegationCert(owner, agent.publicKey, ['*'], -1);

    expect(verifyDelegationCert(cert)).toBe(false);
  });

  it('fleet siblings recognized', () => {
    const owner = generateIdentity();
    const agentA = generateIdentity();
    const agentB = generateIdentity();
    const certA = createDelegationCert(owner, agentA.publicKey, ['*'], ONE_HOUR);
    const certB = createDelegationCert(owner, agentB.publicKey, ['*'], ONE_HOUR);

    expect(isFleetSibling(certA, certB)).toBe(true);
  });

  it('different owners are not siblings', () => {
    const ownerA = generateIdentity();
    const ownerB = generateIdentity();
    const agentA = generateIdentity();
    const agentB = generateIdentity();
    const certA = createDelegationCert(ownerA, agentA.publicKey, ['*'], ONE_HOUR);
    const certB = createDelegationCert(ownerB, agentB.publicKey, ['*'], ONE_HOUR);

    expect(isFleetSibling(certA, certB)).toBe(false);
  });

  it('forged cert rejected', () => {
    const realOwner = generateIdentity();
    const fakeOwner = generateIdentity();
    const agent = generateIdentity();

    // Create cert signed by fakeOwner but claiming to be from realOwner
    const cert = createDelegationCert(fakeOwner, agent.publicKey, ['*'], ONE_HOUR);
    const forged = { ...cert, owner: bytesToHex(realOwner.publicKey) };

    expect(verifyDelegationCert(forged)).toBe(false);
  });
});
