# AgentMesh — Implementation Plan

> A decentralized P2P platform where AI agents discover each other, exchange tasks, and build trust — without a central coordinator.

---

## Table of Contents

1. [Vision & Goals](#1-vision--goals)
2. [Architecture Overview](#2-architecture-overview)
3. [Core Design Decisions](#3-core-design-decisions)
4. [Layer Breakdown](#4-layer-breakdown)
5. [Staged Roadmap](#5-staged-roadmap)
6. [Technology Stack](#6-technology-stack)
7. [Security Model](#7-security-model)
8. [Protocol Interoperability](#8-protocol-interoperability)
9. [Design Principles](#9-design-principles)

---

## 1. Vision & Goals

Build a **hybrid-decentralized agent platform** where:

- Agents run on user devices or servers (no mandatory central coordinator)
- Agents discover and communicate with each other via P2P networking
- Identity is **self-sovereign** — cryptographic keypairs, no central registry
- Tasks are **signed envelopes** — verifiable, auditable, portable
- Trust **emerges locally** before scaling globally
- The system is language-agnostic at the protocol level, even if the first implementation is TypeScript

### What kind of system

- **Collaborative agent swarms** — agents with specialized capabilities cooperate on tasks
- **Personal agents negotiating** — a user's agent finds and delegates to other agents
- Payment is **optional**, layered in later
- Agents are **human-linked** (delegated identity), not anonymous

---

## 2. Architecture Overview

```
┌──────────────────────────────┐
│  Agent Runtime               │
│   - Tool handlers            │
│   - Task logic / AI calls    │
│   - Policy engine            │
└──────────────┬───────────────┘
               │
┌──────────────▼───────────────┐
│  Protocol Layer              │
│   - TaskEnvelope (signed)    │
│   - TaskResponse (signed)    │
│   - Tool definitions         │
│   - Signature validation     │
│   - Deterministic serialize  │
└──────────────┬───────────────┘
               │
┌──────────────▼───────────────┐
│  Transport Adapter           │
│   - libp2p (JS) — primary   │
│   - WebRTC (optional)        │
│   - Mock / local transport   │
│   - Future: Rust bridge      │
└──────────────────────────────┘
```

**Key constraint:** The protocol layer **must not depend on libp2p directly**. Transport is behind an adapter interface so it can be swapped (Rust, Go, WebRTC) without breaking the ecosystem.

---

## 3. Core Design Decisions

### 3.1 Decentralization Model: Hybrid

- P2P transport for agent-to-agent messaging
- Optional discovery hubs / bootstrap nodes
- Optional relay servers for NAT traversal
- Strong cryptographic identity throughout

### 3.2 Identity: ed25519 Keypairs

Each agent:

- Generates an ed25519 keypair
- Public key = Agent ID
- URI scheme: `agent://<base58pubkey>`

Ownership model: **Delegated identity**

- A human (owner) has their own ed25519 keypair
- The owner signs a delegation certificate for each agent: _"I delegate agent X to act on my behalf until revoked"_
- Agents can rotate, revocation is possible, actions are auditable

### 3.2.1 Fleet Recognition

When an owner runs multiple agents, they form a **fleet**. Agents in the same fleet can recognize and trust each other:

- Each agent carries a `DelegationCert` signed by the owner
- When two agents connect, they can exchange delegation certs
- Agent A verifies B's cert signature against the owner's public key
- If both certs share the same `owner` field, they are **fleet siblings**
- Fleet siblings can skip reputation checks and grant elevated trust (e.g. accept tasks without rate limits, share internal state)

This is pure crypto verification — no central server needed. The owner's public key acts as a fleet identifier.

### 3.3 Tool-Based Capabilities

Agents are **not** generic chat peers. Each agent exposes a list of **tools** — similar to function/tool calling in LLMs or MCP tool definitions. A tool has a freeform name, a human-readable description, and an optional parameter schema.

```typescript
// Example tools an agent might advertise:
{ name: "summarize", description: "Summarize a block of text into key points" }
{ name: "translate", description: "Translate text between languages", parameters: { from: "string", to: "string", text: "string" } }
{ name: "render_3d", description: "Render a Blender scene file and return the image" }
```

The protocol does **not** enforce naming conventions or versioning on tool names. Agents describe what they can do in plain language, and other agents (or humans) decide whether a tool fits their needs. This keeps the system flexible and avoids baking rigid taxonomies into the protocol.

---

## 4. Layer Breakdown

### 4.1 Identity Layer

```typescript
// Agent identity from ed25519 keypair
// Library: @noble/ed25519 v3

interface AgentIdentity {
  publicKey: Uint8Array; // 32 bytes, this IS the agent ID
  secretKey: Uint8Array; // 32 bytes, kept private
  agentUri: string; // agent://<base58(publicKey)>
}

// Owner identity (human or organization that owns agents)
interface OwnerIdentity {
  publicKey: Uint8Array; // 32 bytes, identifies the fleet
  secretKey: Uint8Array; // 32 bytes, used to sign delegation certs
}

// Delegation certificate (owner → agent)
// The owner signs this to prove they authorize the agent.
// Agents carry this cert and present it during handshake.
interface DelegationCert {
  owner: string; // hex-encoded owner public key (= fleet ID)
  agent: string; // hex-encoded agent public key
  scope: string[]; // allowed tool name patterns (e.g. ["*"] or ["summarize", "translate"])
  issuedAt: number; // when the cert was created
  expiresAt: number; // when the cert expires
  signature: string; // ed25519 signature by the owner's secret key
}

// Fleet verification: given two agents' certs, check if they share the same owner
function isFleetSibling(certA: DelegationCert, certB: DelegationCert): boolean;
// → verifies both signatures, checks certA.owner === certB.owner, checks expiry
```

### 4.2 Protocol Layer (wire format)

Everything is signed. Everything is verifiable. Serialization must be **deterministic** (canonical JSON or similar).

```typescript
interface TaskEnvelope {
  taskId: string; // UUID v4
  from: string; // sender pubkey
  to?: string; // target pubkey (optional for broadcast)
  tool: string; // name of the tool to invoke (e.g. "summarize")
  payload: unknown; // tool-specific input
  constraints?: {
    maxDuration?: number;
    maxCost?: number;
  };
  timestamp: number;
  signature: string; // ed25519 signature of canonical(envelope - signature)
}

interface TaskResponse {
  taskId: string;
  from: string; // responder pubkey
  result: unknown;
  proof?: string; // optional verification proof
  timestamp: number;
  signature: string;
}
```

### 4.3 Tool Model

Tools are described freeform — a name, a human-readable description, and an optional parameter schema. This mirrors how LLM tool calling and MCP work: the caller reads the description to understand what the tool does.

```typescript
interface Tool {
  name: string; // freeform, e.g. "summarize", "translate", "echo"
  description: string; // plain-language description of what the tool does
  parameters?: Record<string, unknown>; // optional JSON Schema for input validation
}

// Registration
agent.registerTool(tool, handler);
```

#### Standard tool: free-text for LLM agents

The protocol defines a well-known tool for LLM-to-LLM communication:

- **Name:** `agentmesh/llm-message`
- **Description:** Free-form text message for LLM agents.
- **Payload:** `{ text: string }` — a single required `text` field.

Agents that support LLM messaging should register this tool (e.g. from `@agentmesh/transport`: `LLM_MESSAGE_TOOL`) and handle payloads that conform to this shape. Payload validation is applied at accept time; invalid payloads receive an error response.

### 4.4 Transport Adapter

```typescript
interface Transport {
  start(): Promise<void>;
  stop(): Promise<void>;
  send(peerId: string, message: Uint8Array): Promise<void>;
  onMessage(handler: (peerId: string, msg: Uint8Array) => void): void;
  advertise(tools: Tool[]): Promise<void>;
  discover(toolName: string): Promise<string[]>; // returns peer IDs
}

// Implementations
class Libp2pTransport implements Transport {
  /* uses js-libp2p */
}
class LocalTransport implements Transport {
  /* in-process, for testing */
}
// Future:
class RustTransportBridge implements Transport {
  /* bridges to Rust core */
}
```

### 4.5 Policy Engine

Every agent decides whether to accept or reject incoming tasks.

```typescript
interface PolicyDecision {
  accept: boolean;
  reason?: string;
}

interface Policy {
  evaluate(task: TaskEnvelope): PolicyDecision;
}
```

Policies prevent spam, infinite loops, malicious payloads, and enforce rate limits.

### 4.6 Reputation (Local-First)

```typescript
interface PeerReputation {
  peerId: string;
  successRate: number;
  completedTasks: number;
  failures: number;
  lastSeen: number;
}
```

Local scoring only in v1. No global consensus. Reputation is based on signed task receipts, attached to public keys, and portable across nodes.

### 4.7 Discovery

Primary: **DHT (Kademlia)** via libp2p's `@libp2p/kad-dht`

- Agents publish their tool list to the DHT (keyed by tool name)
- Querying: `discover("summarize")` → returns peer IDs of agents offering that tool
- Peers can also fetch a full tool listing from a discovered agent to read descriptions and parameter schemas

Secondary: **Bootstrap list** of known peers for initial network entry.

Optional: **Tool Registry** — anyone can host one, agents register their tool listings, registry does not control identity.

#### LAN vs public network mode

The libp2p transport supports two network modes (see `Libp2pTransportOptions.network`):

- **`lan`:** DHT uses protocol `/ipfs/lan/kad/1.0.0` and a peer-info mapper that removes public addresses. Agents only discover and connect to peers on the same local network. Listen address is `0.0.0.0` so LAN peers can connect.
- **`public`:** DHT uses protocol `/ipfs/kad/1.0.0` (IPFS Amino) and a peer-info mapper that removes private addresses. Agents can discover peers on the public internet. Provide bootstrap multiaddrs for initial discovery.

LAN agents never see public-only peers; public agents use the public DHT. Choose the mode that matches your deployment.

#### Fleet Discovery

Agents with a `DelegationCert` can also be discovered by fleet (owner public key):

- Agents publish their owner's public key to the DHT alongside their tool list
- `discoverFleet(ownerPubkey)` → returns peer IDs of all agents belonging to that owner
- On connection, agents exchange certs and verify signatures to confirm fleet membership

---

## 5. Staged Roadmap

### 🟢 Stage 0 — Protocol Design (Local, Single-Process)

**Goal:** Define and validate the protocol without any networking.

Deliverables:

- [ ] ed25519 identity generation and agent URI scheme
- [ ] Owner identity and delegation certificate signing/verification
- [ ] Fleet recognition (`isFleetSibling()`)
- [ ] Deterministic serialization (canonical JSON)
- [ ] TaskEnvelope / TaskResponse types and signing
- [ ] Signature verification
- [ ] Tool registration system (name + description + optional parameter schema)
- [ ] Policy engine interface
- [ ] Local transport (two agents in one process)
- [ ] Full test suite for protocol correctness

**No networking. This is pure protocol design.**

### 🟡 Stage 1 — Real P2P Messaging

**Goal:** Agents discover and communicate across machines.

Deliverables:

- [ ] libp2p transport adapter (TCP + Noise encryption)
- [ ] Peer discovery via DHT or static bootstrap list
- [ ] Tool advertisement over the network
- [ ] Encrypted task sending across peers
- [ ] Signed task responses across peers
- [ ] Basic CLI to run an agent node

Still no payments, no staking, no reputation consensus. Just **pure decentralized task passing**.

### 🟠 Stage 2 — Trust & Security Hardening

**Goal:** Survive in a hostile network.

Deliverables:

- [ ] Rate limiting per peer
- [ ] Peer scoring / local reputation tracking
- [ ] Blacklisting / banning
- [ ] Tool-based routing (tasks only go to peers that advertise the tool)
- [ ] Multi-peer redundant execution (ask N peers, compare results for deterministic tasks)
- [ ] Fleet-aware policies (auto-trust fleet siblings, stricter rules for unknown peers)
- [ ] Sandbox strategy: only registered tool handlers, no arbitrary code execution

### 🔵 Stage 3 — Economic Layer (Optional)

**Goal:** Enable value exchange between agents.

Options to explore (do NOT introduce blockchain prematurely):

- [ ] Off-chain credits / signed IOUs
- [ ] Micropayment channels
- [ ] On-chain staking (only if protocol is stable and attack surface is tested)
- [ ] Integration with Google's AP2 (Agent Payments Protocol) for agent-led commerce

### 🟣 Stage 4 — Advanced Decentralization

Possible additions:

- [ ] Gossip-based reputation (peer-signed endorsements)
- [ ] Verifiable execution proofs
- [ ] Distributed tool registry
- [ ] Agent swarms (multi-hop task routing — agent A delegates to B, B delegates to C)
- [ ] Delegated authority chains
- [ ] WASM sandbox for per-tool isolation

---

## 6. Technology Stack

### Primary (TypeScript-First)

| Concern                | Library / Tool                             |
| ---------------------- | ------------------------------------------ |
| Language               | TypeScript (strict mode)                   |
| Runtime                | Node.js (v20+)                             |
| P2P networking         | `libp2p` v3.x (JS implementation)          |
| Transports             | `@libp2p/tcp`, `@libp2p/websockets`        |
| Encryption             | `@chainsafe/libp2p-noise` (Noise protocol) |
| Stream muxing          | `@chainsafe/libp2p-yamux`                  |
| Peer discovery         | `@libp2p/kad-dht`, `@libp2p/bootstrap`     |
| PubSub                 | `@chainsafe/libp2p-gossipsub`              |
| Cryptographic identity | `@noble/ed25519` v3                        |
| Schema validation      | `zod` (or JSON Schema)                     |
| Serialization          | Canonical JSON (deterministic)             |
| Local state            | SQLite (via `better-sqlite3`)              |
| Multiformat compat     | `multiformats` (for future IPFS interop)   |

### Future (if scale demands it)

| Concern      | Migration Path                                   |
| ------------ | ------------------------------------------------ |
| Network core | Rewrite transport in Rust (`rust-libp2p`)        |
| Sandbox      | WASM runtime (WASI) for untrusted task execution |
| Payments     | AP2 / stablecoin channels                        |

---

## 7. Security Model

### Threat: Sybil Attacks

Anyone can create infinite agents. Mitigations:

- Proof of stake (economic cost to create identity)
- Web-of-trust (agents sign/endorse other agents)
- Human-anchored identity (delegation certificates)
- Rate limiting per unknown peer

### Threat: Malicious Results

Agent returns fake output. Mitigations:

- Redundant execution (ask 3 agents, compare for deterministic tasks)
- Hash validation for deterministic tools
- Reputation scoring (track success/failure per peer)

### Threat: Task Abuse

Infinite tasks, malicious payloads, prompt injection. Mitigations:

- Rate limiting per peer
- Signed economic commitment (in later stages)
- Tool sandboxing (agents only execute registered handlers)
- Local policy engine evaluates every incoming task

### Trust Model

**Human-anchored + crypto verification:**

1. Everything is signed with ed25519
2. Owner identity signs agent identity (delegation certificates)
3. **Fleet trust:** agents sharing the same owner verify each other's certs and form a trusted group — no reputation needed between siblings
4. Reputation is layered on top for cross-fleet interactions (local first, gossip later)
5. Assume hostile peers from day one for any agent outside your fleet

### Privacy

- Tasks are encrypted in transit (Noise protocol via libp2p)
- Metadata minimization (only advertise tool names/descriptions, not internals)
- Future: selective disclosure credentials, onion-style relay

---

## 8. Protocol Interoperability

### Google A2A (Agent2Agent Protocol)

The A2A protocol (now under the Linux Foundation, v0.3.0) addresses a similar problem — agent-to-agent interoperability — but for enterprise/cloud contexts. Key concepts to align with or learn from:

| A2A Concept                                      | AgentMesh Equivalent                 |
| ------------------------------------------------ | ------------------------------------ |
| Agent Card (JSON metadata)                       | Tool listing advertised via DHT      |
| Task lifecycle (submitted → working → completed) | TaskEnvelope / TaskResponse state    |
| JSON-RPC 2.0 over HTTPS                          | Signed envelopes over libp2p         |
| Skills                                           | Tools (name + description)           |
| Opaque agents                                    | Same — agents don't expose internals |

**Strategy:** AgentMesh operates P2P-first, but should be able to expose an A2A-compatible HTTP interface so that AgentMesh agents can interoperate with enterprise A2A agents. This can be a bridge/gateway component in Stage 2+.

### Anthropic MCP (Model Context Protocol)

MCP standardizes how agents connect to tools and data sources. AgentMesh's tool model is intentionally similar — freeform tool names with descriptions and parameter schemas — making a bridge from MCP tools → AgentMesh tools a natural extension.

### Google AP2 (Agent Payments Protocol)

AP2 extends A2A with payment mandates and verifiable credentials for agent-initiated commerce. Relevant for Stage 3 economic layer — especially the concept of **mandates** (cryptographically signed proof of user authorization to transact).

---

## 9. Design Principles

1. **Protocol must be deterministic and language-agnostic.** The wire format (signed envelopes, tool descriptions) should be implementable in Rust, Go, or any language.
2. **Never tie identity to transport.** Agent identity (ed25519 keys) is independent of how messages travel.
3. **Never mix business logic with networking.** The protocol layer is pure; the transport is an adapter.
4. **Tools are freeform, not rigid.** The protocol does not enforce naming conventions or versioning on tool names. Agents describe what they do in plain language — like MCP or LLM tool calling.
5. **Assume hostile peers from day one.** Every message is signed. Every peer is untrusted until proven.
6. **Start small.** Protocol purity first. Decentralization is a feature you earn, not a starting point.
7. **Don't introduce blockchain before the protocol is stable**, the network behavior is understood, and the attack surface is tested.
