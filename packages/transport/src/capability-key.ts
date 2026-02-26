/**
 * Capability key derivation for DHT-based discovery.
 * Maps a namespace + descriptor string to a deterministic key (CID) so that
 * advertisers and searchers use the same key. No allowlist: any descriptor is valid.
 */

import { sha256 } from '@noble/hashes/sha2';
import { CID } from 'multiformats/cid';
import * as raw from 'multiformats/codecs/raw';
import type { MultihashDigest } from 'multiformats/hashes/interface';

const DEFAULT_NAMESPACE = 'quokkamesh/capability';
const SHA2_256_CODE = 0x12;

/**
 * Build the full capability descriptor string (namespace + descriptor).
 * Convention: descriptor is typically the tool name so both sides use the same key.
 */
export function capabilityDescriptor(
  descriptor: string,
  namespace: string = DEFAULT_NAMESPACE,
): string {
  const trimmed = descriptor.trim();
  if (namespace.endsWith('/')) {
    return `${namespace}${trimmed}`;
  }
  return `${namespace}/${trimmed}`;
}

/**
 * Compute the deterministic DHT key for a capability.
 * Uses UTF-8 encoding and SHA-256 so all nodes agree. Returns a CID (content identifier)
 * suitable for libp2p contentRouting.provide() and findProviders().
 *
 * @param descriptor - Arbitrary capability string (e.g. tool name). No fixed list.
 * @param namespace - Optional namespace prefix; defaults to 'quokkamesh/capability'.
 */
export function capabilityKey(
  descriptor: string,
  namespace: string = DEFAULT_NAMESPACE,
): CID {
  const full = capabilityDescriptor(descriptor, namespace);
  const bytes = new TextEncoder().encode(full);
  const digest = sha256(bytes);
  const multihashBytes = new Uint8Array(2 + digest.length);
  multihashBytes[0] = SHA2_256_CODE;
  multihashBytes[1] = digest.length;
  multihashBytes.set(digest, 2);
  const multihash: MultihashDigest<typeof SHA2_256_CODE> = {
    code: SHA2_256_CODE,
    size: digest.length,
    digest,
    bytes: multihashBytes,
  };
  return CID.create(1, raw.code, multihash);
}
