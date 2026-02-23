import { describe, it, expect } from 'vitest';
import { generateIdentity, sign, verify } from '../src/identity/keys.js';
import { canonicalize } from '../src/identity/serialize.js';

describe('identity', () => {
  it('generates a keypair', () => {
    const id = generateIdentity();
    expect(id.publicKey).toBeInstanceOf(Uint8Array);
    expect(id.secretKey).toBeInstanceOf(Uint8Array);
    expect(id.publicKey).toHaveLength(32);
    expect(id.secretKey).toHaveLength(32);
  });

  it('sign and verify', () => {
    const id = generateIdentity();
    const message = new TextEncoder().encode('hello agentmesh');
    const signature = sign(message, id.secretKey);
    expect(verify(signature, message, id.publicKey)).toBe(true);
  });

  it('verify rejects wrong key', () => {
    const id1 = generateIdentity();
    const id2 = generateIdentity();
    const message = new TextEncoder().encode('hello');
    const signature = sign(message, id1.secretKey);
    expect(verify(signature, message, id2.publicKey)).toBe(false);
  });

  it('verify rejects tampered message', () => {
    const id = generateIdentity();
    const message = new TextEncoder().encode('original');
    const signature = sign(message, id.secretKey);
    const tampered = new TextEncoder().encode('tampered');
    expect(verify(signature, tampered, id.publicKey)).toBe(false);
  });
});

describe('canonical serialization', () => {
  it('is deterministic', () => {
    const a = canonicalize({ z: 1, a: 2 });
    const b = canonicalize({ a: 2, z: 1 });
    expect(a).toEqual(b);
    expect(new TextDecoder().decode(a)).toBe('{"a":2,"z":1}');
  });

  it('handles nested objects', () => {
    const result = canonicalize({ b: { d: 1, c: 2 }, a: 3 });
    expect(new TextDecoder().decode(result)).toBe('{"a":3,"b":{"c":2,"d":1}}');
  });

  it('handles arrays', () => {
    const result = canonicalize({ items: [{ z: 1, a: 2 }] });
    expect(new TextDecoder().decode(result)).toBe('{"items":[{"a":2,"z":1}]}');
  });
});
