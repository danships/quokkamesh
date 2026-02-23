import {
  Agent,
  type DelegationCert,
  Libp2pTransport,
  LLM_MESSAGE_TOOL,
} from '@agentmesh/transport';
import { loadConfig, resolveDataDir } from './config.js';
import { loadOrCreateAgentKey, loadOwnerKey, loadOrCreateDelegationCert } from './keys.js';

/** Default handler for agentmesh/llm-message: echoes the text and returns it. */
async function defaultLlmMessageHandler(payload: unknown): Promise<unknown> {
  const obj = payload as { text?: string };
  const text = typeof obj?.text === 'string' ? obj.text : '';
  return { received: true, text };
}

/**
 * Create and start an agent from config. Loads keys from data dir, creates transport and agent,
 * registers the standard LLM message tool and any config tools, then starts.
 */
export async function runAgent(configPath?: string): Promise<Agent> {
  const config = loadConfig(configPath);
  const dataDir = resolveDataDir(config);

  const agentIdentity = loadOrCreateAgentKey(dataDir);
  const ownerIdentity = loadOwnerKey(dataDir);
  let delegation: DelegationCert | undefined = undefined;
  if (ownerIdentity) {
    delegation = loadOrCreateDelegationCert(dataDir, agentIdentity.publicKey, ownerIdentity);
  }

  const transportOpts = config.transport ?? {};
  const transport = new Libp2pTransport({
    listenPort: transportOpts.listenPort ?? 0,
    bootstrapAddrs: transportOpts.bootstrapAddrs ?? [],
    network: transportOpts.network ?? 'public',
  });

  const agent = new Agent(transport, {
    identity: agentIdentity,
    delegation,
  });

  // Always register the standard free-text tool for LLM agents
  agent.registerTool(LLM_MESSAGE_TOOL, defaultLlmMessageHandler);

  // Register any tools from config (placeholder: only name/description, no dynamic handler loading yet)
  for (const t of config.tools ?? []) {
    if (t.name === LLM_MESSAGE_TOOL.name) {
      continue; // Keep built-in LLM handler; do not overwrite with placeholder
    }
    const tool = { name: t.name, description: t.description, parameters: t.parameters };
    agent.registerTool(tool, async (payload) => {
      return { tool: t.name, payload, message: 'Handler not implemented; add handlerId in config' };
    });
  }

  await agent.start();
  return agent;
}
