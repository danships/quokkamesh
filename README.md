# QuokkaMesh

**P2P agent mesh proof of concept** — minimum implementation to prove that agents can identify themselves, discover each other over P2P, exchange signed tasks, and return signed results.

## Scope

This PoC validates the core loop:

1. **Identity** — Agent generates an ed25519 keypair
2. **Delegation** — Owner creates delegation certificates for their agents
3. **Tools** — Agent registers tools (name, description, handler)
4. **Discovery** — Agent joins a transport and advertises its tools
5. **Fleet** — Agents exchange delegation certs and recognize fleet siblings (same owner)
6. **Tasks** — Requesting agent sends a signed task targeting a tool
7. **Execution** — Receiving agent runs the handler and returns a signed response
8. **Verification** — Requesting agent verifies the signature on the response

**Out of scope for this PoC:** reputation, policy engine, payments, sandboxing, persistence, CLI tooling.

## Getting Started

### Prerequisites

- Node.js 18+
- [pnpm](https://pnpm.io/) (or enable [Corepack](https://nodejs.org/api/corepack.html): `corepack enable`)

### Install

```bash
pnpm install
```

### Build

```bash
pnpm build
```

### Test

```bash
pnpm test
```

Watch mode:

```bash
pnpm test:watch
```

### Lint & Format

```bash
pnpm lint
pnpm lint:fix
pnpm format
pnpm format:check
```

## Project Structure

```
quokkamesh/
├── src/
│   ├── identity/           # Keys, delegation certs, canonical serialization
│   ├── protocol/           # TaskEnvelope, TaskResponse, tool registry
│   ├── transport/          # Transport interface, LocalTransport (libp2p planned)
│   └── agent.ts            # Agent class (planned)
├── tests/
├── docs/
│   └── plan.md             # Full PoC plan and implementation details
├── package.json
├── tsconfig.json
└── vitest.config.ts
```

## Current Status

| Component               | Status  |
| ----------------------- | ------- |
| Identity (keys)         | ✅      |
| Delegation certs        | ✅      |
| Canonical serialization | ✅      |
| Protocol types          | ✅      |
| Envelope signing        | ✅      |
| Tool registry           | ✅      |
| Transport interface     | ✅      |
| Local transport         | ✅      |
| libp2p transport        | ⬜ Todo |
| Agent class             | ⬜ Todo |

Test suites for identity, delegation, envelope, tools, and local transport are passing.

## Documentation

See [docs/plan.md](docs/plan.md) for the full proof-of-concept plan, API sketches, and implementation notes.

## License

ISC
