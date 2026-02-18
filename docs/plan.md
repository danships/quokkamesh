# AgentMesh — Proof of Concept Plan

> Minimum implementation to prove: agents can identify themselves, discover each other over P2P, exchange signed tasks, and return signed results.

---

## Scope

This PoC covers **only** what's needed to validate the core loop:

1. Agent generates an identity (ed25519 keypair)
2. An owner creates delegation certificates for their agents
3. Agent registers tools (name + description + handler)
4. Agent joins a P2P network and advertises its tools
5. Another agent discovers it by tool name
6. Agents exchange delegation certs and recognize fleet siblings (same owner)
7. Requesting agent sends a signed task targeting a tool
8. Receiving agent executes the tool handler and returns a signed response
9. Requesting agent verifies the signature on the response

**Out of scope:** reputation, policy engine, payments, sandboxing, persistence, CLI tooling.

---

## Project Structure

```
agentmesh/
├── src/
│   ├── identity/
│   │   ├── keys.ts              # Keypair generation, signing, verification
│   │   ├── delegation.ts        # DelegationCert creation, signing, verification, fleet check
│   │   └── serialize.ts         # Canonical JSON serialization
│   ├── protocol/
│   │   ├── types.ts             # TaskEnvelope, TaskResponse, Tool
│   │   ├── envelope.ts          # Create & sign envelopes, verify signatures
│   │   └── tools.ts             # Tool registry per agent
│   ├── transport/
│   │   ├── interface.ts         # Transport adapter interface
│   │   ├── local.ts             # In-memory transport (for unit tests)
│   │   └── libp2p.ts            # Real P2P transport using libp2p
│   └── agent.ts                 # Agent class that ties it all together
├── tests/
│   ├── identity.test.ts         # Key generation, signing, verification
│   ├── delegation.test.ts       # Delegation certs, fleet recognition
│   ├── envelope.test.ts         # Envelope creation, signing, validation
│   ├── tools.test.ts            # Tool registration & lookup
│   ├── local-transport.test.ts  # Two agents in-process via LocalTransport
│   └── p2p.test.ts              # Two agents over real libp2p (integration)
├── package.json
├── tsconfig.json
└── vitest.config.ts
```

---

## Dependencies

```json
{
  "dependencies": {
    "@noble/ed25519": "^3.0.0",
    "@noble/hashes": "^1.7.0",
    "libp2p": "^3.1.0",
    "@libp2p/tcp": "^11.0.0",
    "@chainsafe/libp2p-noise": "^16.0.0",
    "@chainsafe/libp2p-yamux": "^7.0.0",
    "@libp2p/bootstrap": "^12.0.0",
    "@multiformats/multiaddr": "^12.0.0",
    "uint8arrays": "^5.0.0"
  },
  "devDependencies": {
    "typescript": "^5.7.0",
    "vitest": "^3.0.0"
  }
}
```

> Version numbers are approximate — lock to latest compatible at project init.

---

## Progress

| #   | Component               | Status  |
| --- | ----------------------- | ------- |
| 1   | Identity (keys.ts)      | ✅ Done |
| 2   | Delegation              | ✅ Done |
| 3   | Canonical Serialization | ✅ Done |
| 4   | Protocol Types          | ✅ Done |
| 5   | Envelope Signing        | ✅ Done |
| 6   | Tool Registry           | ✅ Done |
| 7   | Transport Interface     | ✅ Done |
| 8   | Local Transport         | ✅ Done |
| 9   | libp2p Transport        | ✅ Done |
| 10  | Agent                   | ✅ Done |

| #   | Test Suite              | Status                                                                |
| --- | ----------------------- | --------------------------------------------------------------------- |
| 1   | identity.test.ts        | ✅ 7/7 passing                                                        |
| 2   | delegation.test.ts      | ✅ 7/7 passing                                                        |
| 3   | envelope.test.ts        | ✅ 6/6 passing                                                        |
| 4   | tools.test.ts           | ✅ 4/4 passing                                                        |
| 5   | local-transport.test.ts | ✅ 8/8 passing                                                        |
| 6   | agent.test.ts           | ✅ 7/7 passing (Agent + LocalTransport full loop + fleet recognition) |
| 7   | p2p.test.ts             | ✅ 4/4 passing (Agent + Libp2pTransport over real TCP)                |

---

## Implementation Details

### 1. Identity (`src/identity/keys.ts`) ✅

Generate an ed25519 keypair. Sign and verify arbitrary byte payloads.

```typescript
import * as ed from '@noble/ed25519';
import { sha512 } from '@noble/hashes/sha2.js';

// Enable sync methods
ed.hashes.sha512 = sha512;

interface AgentIdentity {
  publicKey: Uint8Array;
  secretKey: Uint8Array;
}

function generateIdentity(): AgentIdentity;
function sign(message: Uint8Array, secretKey: Uint8Array): Uint8Array;
function verify(signature: Uint8Array, message: Uint8Array, publicKey: Uint8Array): boolean;
```

### 2. Delegation & Fleet Recognition (`src/identity/delegation.ts`) ✅

An owner (human or org) has their own ed25519 keypair. They sign a `DelegationCert` for each agent they control. Agents carry their cert and present it to peers to prove ownership.

```typescript
interface DelegationCert {
  owner: string; // hex-encoded owner public key (= fleet ID)
  agent: string; // hex-encoded agent public key
  scope: string[]; // allowed tool names, e.g. ["*"] or ["echo", "summarize"]
  issuedAt: number; // Date.now() when cert was created
  expiresAt: number; // expiry timestamp
  signature: string; // ed25519 signature by the owner's secret key
}

// Create a delegation cert (called by the owner, offline or at setup time)
function createDelegationCert(
  ownerIdentity: AgentIdentity,
  agentPublicKey: Uint8Array,
  scope: string[],
  ttlMs: number,
): DelegationCert;

// Verify a delegation cert's signature and expiry
function verifyDelegationCert(cert: DelegationCert): boolean;

// Check if two agents belong to the same owner (fleet siblings)
function isFleetSibling(certA: DelegationCert, certB: DelegationCert): boolean;
// → verifies both certs, then checks certA.owner === certB.owner
```

The `owner` public key is the fleet identifier. Any agent presenting a valid, non-expired cert signed by the same owner key is a trusted sibling.

### 3. Canonical Serialization (`src/identity/serialize.ts`) ✅

Deterministic JSON: sorted keys, no whitespace, UTF-8 encoded to `Uint8Array`. This is critical — if two implementations serialize differently, signatures break.

```typescript
function canonicalize(obj: unknown): Uint8Array;
```

Rules:

- Sort object keys lexicographically (recursive)
- No trailing commas, no extra whitespace
- Numbers as-is (no scientific notation normalization needed for PoC)
- Output is `TextEncoder.encode(json)`

### 4. Protocol Types (`src/protocol/types.ts`) ✅

Minimal set of types. Tools are freeform — a name and a human-readable description, similar to LLM tool calling or MCP.

```typescript
interface Tool {
  name: string; // freeform, e.g. "echo", "summarize", "translate"
  description: string; // plain-language description of what the tool does
  parameters?: Record<string, unknown>; // optional JSON Schema for input
}

interface TaskEnvelope {
  taskId: string; // crypto.randomUUID()
  from: string; // hex-encoded public key
  to: string; // hex-encoded public key of target
  tool: string; // name of the tool to invoke
  payload: unknown; // tool-specific input
  timestamp: number; // Date.now()
  signature: string; // hex-encoded ed25519 signature
}

interface TaskResponse {
  taskId: string; // matches the request
  from: string; // hex-encoded public key of responder
  result: unknown; // tool-specific output
  timestamp: number;
  signature: string;
}
```

### 5. Envelope Signing (`src/protocol/envelope.ts`) ✅

```typescript
// Create a signed TaskEnvelope
function createTaskEnvelope(
  identity: AgentIdentity,
  to: string,
  tool: string,
  payload: unknown,
): TaskEnvelope;

// Verify the signature on a TaskEnvelope
function verifyTaskEnvelope(envelope: TaskEnvelope): boolean;

// Create a signed TaskResponse
function createTaskResponse(identity: AgentIdentity, taskId: string, result: unknown): TaskResponse;

// Verify the signature on a TaskResponse
function verifyTaskResponse(response: TaskResponse): boolean;
```

Signing process:

1. Build the object without the `signature` field
2. Canonicalize it → `Uint8Array`
3. Sign with ed25519 → set `signature` as hex string

### 6. Tool Registry (`src/protocol/tools.ts`) ✅

Per-agent registry. An agent registers tools with handlers.

```typescript
type TaskHandler = (payload: unknown) => Promise<unknown>;

class ToolRegistry {
  register(tool: Tool, handler: TaskHandler): void;
  has(toolName: string): boolean;
  getHandler(toolName: string): TaskHandler | undefined;
  list(): Tool[];
}
```

### 7. Transport Interface (`src/transport/interface.ts`)

```typescript
interface Transport {
  start(): Promise<void>;
  stop(): Promise<void>;
  send(peerId: string, message: Uint8Array): Promise<void>;
  onMessage(handler: (peerId: string, msg: Uint8Array) => void): void;
  // Discovery
  advertise(tools: Tool[]): Promise<void>;
  discover(toolName: string): Promise<string[]>;
  // Own identity for addressing
  peerId: string;
}
```

### 8. Local Transport (`src/transport/local.ts`)

In-memory message bus. All `LocalTransport` instances in the same process share a static registry. Useful for unit tests — no ports, no networking, instant.

```typescript
class LocalTransport implements Transport {
  // Static shared registry: peerId → LocalTransport instance
  // send() looks up the target in the registry and calls its handler directly
  // discover() scans the registry for peers advertising the tool
}
```

### 9. libp2p Transport (`src/transport/libp2p.ts`)

Real P2P transport for integration tests and production.

```typescript
class Libp2pTransport implements Transport {
  // Creates a libp2p node with:
  //   - TCP transport
  //   - Noise encryption
  //   - Yamux stream multiplexing
  //   - Kademlia DHT for discovery
  //
  // Custom protocol: /agentmesh/task/1.0.0
  //   - Handles incoming streams → passes to onMessage handler
  //
  // advertise(): stores tool names in DHT under content-addressed keys
  // discover(): queries DHT for peers providing a tool
  // send(): opens a stream to the peer and writes the message
}
```

Discovery approach for PoC:

- Use `@libp2p/bootstrap` with explicit multiaddrs for the other test peer (avoids needing a real DHT network)
- For the integration test, Agent B starts first and Agent A bootstraps to B's address

### 10. Agent (`src/agent.ts`)

The top-level class that wires everything together.

```typescript
class Agent {
  readonly identity: AgentIdentity;
  readonly delegation?: DelegationCert; // optional — set if this agent has an owner
  readonly tools: ToolRegistry;
  private transport: Transport;

  constructor(transport: Transport, delegation?: DelegationCert);

  // Register a tool with a handler
  registerTool(tool: Tool, handler: TaskHandler): void;

  // Start the agent (starts transport, advertises tools)
  start(): Promise<void>;

  // Stop the agent
  stop(): Promise<void>;

  // Send a task to another agent and wait for the response
  request(peerId: string, tool: string, payload: unknown): Promise<TaskResponse>;

  // Find agents that provide a tool
  discover(toolName: string): Promise<string[]>;

  // Check if a remote agent is a fleet sibling (same owner)
  isFleetSibling(remoteCert: DelegationCert): boolean;
}
```

Internal flow when a message arrives:

1. Deserialize `TaskEnvelope` from bytes
2. Verify signature → reject if invalid
3. Look up tool handler → reject if not registered
4. Execute handler → get result
5. Create signed `TaskResponse`
6. Send response back to sender

---

## Test Plan

All tests use [Vitest](https://vitest.dev/). Run with `npx vitest`.

### Test 1: Identity (`tests/identity.test.ts`) ✅

| Test                                           | Description                                                                |
| ---------------------------------------------- | -------------------------------------------------------------------------- |
| generates a keypair                            | `publicKey` and `secretKey` are 32 bytes each                              |
| sign and verify                                | signing a message and verifying with the correct public key returns `true` |
| verify rejects wrong key                       | verifying with a different public key returns `false`                      |
| verify rejects tampered message                | modifying the message after signing fails verification                     |
| canonical serialization is deterministic       | same object with different key order produces identical bytes              |
| canonical serialization handles nested objects | nested objects have their keys sorted recursively                          |

### Test 2: Delegation & Fleet (`tests/delegation.test.ts`) ✅

| Test                               | Description                                                                      |
| ---------------------------------- | -------------------------------------------------------------------------------- |
| creates a valid delegation cert    | cert has `owner`, `agent`, `scope`, `issuedAt`, `expiresAt`, `signature`         |
| delegation cert signature verifies | `verifyDelegationCert()` returns `true` for a freshly created cert               |
| tampered cert fails verification   | changing `agent` after signing fails verification                                |
| expired cert fails verification    | a cert with `expiresAt` in the past returns `false`                              |
| fleet siblings recognized          | two agents with certs from the same owner → `isFleetSibling()` returns `true`    |
| different owners are not siblings  | two agents with certs from different owners → `isFleetSibling()` returns `false` |
| forged cert rejected               | a cert claiming owner A but signed by owner B → verification fails               |

### Test 3: Envelope (`tests/envelope.test.ts`) ✅

| Test                                 | Description                                                                  |
| ------------------------------------ | ---------------------------------------------------------------------------- |
| creates a valid TaskEnvelope         | envelope has all required fields, signature is a hex string                  |
| TaskEnvelope signature verifies      | `verifyTaskEnvelope()` returns `true` for a freshly created envelope         |
| tampered envelope fails verification | changing `payload` after signing makes `verifyTaskEnvelope()` return `false` |
| creates a valid TaskResponse         | response has `taskId`, `from`, `result`, `timestamp`, `signature`            |
| TaskResponse signature verifies      | `verifyTaskResponse()` returns `true`                                        |
| tampered response fails verification | changing `result` after signing fails                                        |

### Test 4: Tools (`tests/tools.test.ts`) ✅

| Test                | Description                                                     |
| ------------------- | --------------------------------------------------------------- |
| register and lookup | registering a tool makes `has()` return `true`                  |
| handler is callable | `getHandler()` returns the registered function                  |
| unknown tool        | `has()` returns `false`, `getHandler()` returns `undefined`     |
| list returns all    | `list()` returns all registered tools with name and description |

### Test 5: Local Transport — Full Loop (`tests/local-transport.test.ts`)

End-to-end test with two agents in-process, no networking.

| Test                                   | Description                                                                      |
| -------------------------------------- | -------------------------------------------------------------------------------- |
| agent A discovers agent B by tool name | B registers `echo`, A calls `discover("echo")` and gets B's peerId               |
| agent A sends task, agent B responds   | A sends `{ message: "hello" }` to B's `echo` tool, B returns `{ echo: "hello" }` |
| response signature is valid            | A verifies the signature on B's response                                         |
| unknown tool returns error             | A sends a task for a tool B doesn't have, gets a rejection                       |
| invalid signature is rejected          | A sends a tampered envelope, B rejects it                                        |
| fleet siblings recognize each other    | A and B with certs from same owner → `isFleetSibling()` returns `true`           |
| non-fleet agents are not siblings      | A and C with certs from different owners → `isFleetSibling()` returns `false`    |

### Test 6: P2P Integration (`tests/p2p.test.ts`)

End-to-end test with two agents communicating over real libp2p TCP connections.

| Test                                   | Description                                                                |
| -------------------------------------- | -------------------------------------------------------------------------- |
| two agents connect over TCP            | Agent A and B start on different ports, A bootstraps to B                  |
| agent A discovers agent B by tool name | B advertises `echo`, A discovers B                                         |
| full task round-trip over P2P          | A sends signed task → B processes → B returns signed response → A verifies |
| response payload is correct            | The echoed payload matches what was sent                                   |

These tests spin up real libp2p nodes on `127.0.0.1` with random ports. Each test starts both agents, runs the assertion, then stops both agents. Use `afterEach` to ensure cleanup.

---

## Example Tool for Testing: `echo`

A trivial tool that returns whatever it receives. Used in all integration tests.

```typescript
const echoTool: Tool = {
  name: 'echo',
  description: 'Echoes back the message it receives',
};

const echoHandler: TaskHandler = async (payload) => {
  return { echo: (payload as { message: string }).message };
};
```

---

## Definition of Done

The PoC is complete when:

- [x] `npx vitest` passes all tests (identity ✅, delegation ✅, envelope ✅, tools ✅, local transport, P2P)
- [x] Two agents on separate libp2p nodes can discover each other by tool name
- [x] Agents with delegation certs from the same owner recognize each other as fleet siblings
- [x] A signed task travels from Agent A → Agent B over TCP
- [x] Agent B executes the tool handler and returns a signed response
- [x] Agent A verifies the response signature
- [x] All messages use canonical JSON serialization and ed25519 signatures
- [x] The transport layer is behind an interface — swapping `LocalTransport` for `Libp2pTransport` requires zero changes to `Agent` or `Protocol`
