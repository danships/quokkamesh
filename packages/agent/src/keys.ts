import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import {
  type AgentIdentity,
  generateIdentity,
  createDelegationCert,
  type DelegationCert,
} from '@agentmesh/transport';

const KEYS_DIR = 'keys';
const AGENT_KEY_FILE = 'agent.key';
const OWNER_KEY_FILE = 'keys/owner.key';
const DELEGATION_CERT_FILE = 'keys/delegation.json';

/** Simple file format: first 32 bytes = secretKey, next 32 = publicKey (for agent or owner). */
function serializeKeypair(identity: AgentIdentity): Buffer {
  return Buffer.concat([Buffer.from(identity.secretKey), Buffer.from(identity.publicKey)]);
}

function deserializeKeypair(buf: Buffer): AgentIdentity {
  if (buf.length < 64) {
    throw new Error('Invalid key file: expected at least 64 bytes');
  }
  return {
    secretKey: new Uint8Array(buf.subarray(0, 32)),
    publicKey: new Uint8Array(buf.subarray(32, 64)),
  };
}

function ensureDir(dataDir: string, subdir: string): string {
  const dir = path.join(dataDir, subdir);
  mkdirSync(dir, { recursive: true });
  return dir;
}

/** Load agent keypair from data dir. Returns undefined if the key file does not exist or is invalid. */
export function loadAgentKey(dataDir: string): AgentIdentity | undefined {
  const keyPath = path.join(dataDir, KEYS_DIR, AGENT_KEY_FILE);
  if (!existsSync(keyPath)) {
    return undefined;
  }
  try {
    const buf = readFileSync(keyPath);
    return deserializeKeypair(buf);
  } catch {
    return undefined;
  }
}

/** Load or generate agent keypair. If the key file does not exist or is invalid, generates a new identity and saves it. */
export function loadOrCreateAgentKey(dataDir: string): AgentIdentity {
  const keysDir = ensureDir(dataDir, KEYS_DIR);
  const keyPath = path.join(keysDir, AGENT_KEY_FILE);

  if (existsSync(keyPath)) {
    try {
      const buf = readFileSync(keyPath);
      return deserializeKeypair(buf);
    } catch {
      // Corrupt or truncated key file; overwrite with new identity
      const identity = generateIdentity();
      writeFileSync(keyPath, serializeKeypair(identity), { mode: 0o600 });
      return identity;
    }
  }

  const identity = generateIdentity();
  writeFileSync(keyPath, serializeKeypair(identity), { mode: 0o600 });
  return identity;
}

/** Load owner keypair from data dir. Returns undefined if not present or invalid. */
export function loadOwnerKey(dataDir: string): AgentIdentity | undefined {
  const keyPath = path.join(dataDir, OWNER_KEY_FILE);
  if (!existsSync(keyPath)) {
    return undefined;
  }
  try {
    const buf = readFileSync(keyPath);
    return deserializeKeypair(buf);
  } catch {
    return undefined;
  }
}

/**
 * Generate and persist an owner keypair. Overwrites if present.
 */
export function createOwnerKey(dataDir: string): AgentIdentity {
  ensureDir(dataDir, KEYS_DIR);
  const keyPath = path.join(dataDir, OWNER_KEY_FILE);
  const identity = generateIdentity();
  writeFileSync(keyPath, serializeKeypair(identity), { mode: 0o600 });
  return identity;
}

/**
 * Load or create a delegation cert for the given agent and owner. Scope and TTL are fixed for simplicity.
 */
export function loadOrCreateDelegationCert(
  dataDir: string,
  agentPublicKey: Uint8Array,
  ownerIdentity: AgentIdentity,
  scope: string[] = ['*'],
  ttlMs: number = 365 * 24 * 60 * 60 * 1000,
): DelegationCert {
  const certPath = path.join(dataDir, DELEGATION_CERT_FILE);
  if (existsSync(certPath)) {
    try {
      const raw = readFileSync(certPath, 'utf8');
      const cert = JSON.parse(raw) as DelegationCert;
      if (cert.expiresAt > Date.now()) {
        return cert;
      }
    } catch {
      // Corrupt or invalid delegation file; fall through to regenerate
    }
  }

  const cert = createDelegationCert(ownerIdentity, agentPublicKey, scope, ttlMs);
  ensureDir(dataDir, KEYS_DIR);
  writeFileSync(certPath, JSON.stringify(cert, null, 2), { mode: 0o600 });
  return cert;
}
