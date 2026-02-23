import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';

/** Transport and network options for the agent. */
export interface TransportConfig {
  /** 'lan' or 'public'. Default 'public'. */
  network?: 'lan' | 'public';
  /** TCP listen port (0 = random). */
  listenPort?: number;
  /** Bootstrap multiaddrs. */
  bootstrapAddrs?: string[];
}

/** Inline tool definition (name, description, optional parameters). Handler is referenced by handlerId. */
export interface ToolConfig {
  name: string;
  description: string;
  parameters?: Record<string, unknown>;
  /** Reference to a built-in handler (e.g. 'echo') or path to a module that exports handler. */
  handlerId?: string;
}

/** Agent mesh configuration file shape. */
export interface AgentMeshConfig {
  /** Optional display name for the agent. */
  name?: string;
  /** Data directory for keys and certs (default: ~/.agentmesh or ./.agentmesh). */
  dataDir?: string;
  /** Transport options. */
  transport?: TransportConfig;
  /** Tools to register (besides the standard agentmesh/llm-message). */
  tools?: ToolConfig[];
  /** Optional paths to skills/prompts/commands (reserved for future use). */
  skills?: string[];
  prompts?: string[];
  commands?: string[];
}

const DEFAULT_CONFIG_PATHS = ['agentmesh.config.json', '.agentmesh.json'];

/**
 * Resolve data directory: AGENTMESH_DATA_DIR env (first), then config.dataDir, then ~/.agentmesh, then ./.agentmesh.
 */
export function resolveDataDir(config?: AgentMeshConfig): string {
  const env = process.env['AGENTMESH_DATA_DIR'];
  if (env) {
    return path.resolve(env);
  }
  if (config?.dataDir) {
    return path.resolve(config.dataDir);
  }
  const home = process.env['HOME'] ?? process.env['USERPROFILE'];
  if (home) {
    return path.resolve(home, '.agentmesh');
  }
  return path.resolve(process.cwd(), '.agentmesh');
}

/**
 * Load config from file. Searches cwd (or AGENTMESH_CONFIG_PATH) for agentmesh.config.json or .agentmesh.json.
 */
export function loadConfig(explicitPath?: string): AgentMeshConfig {
  const searchDir = process.env['AGENTMESH_CONFIG_PATH']
    ? path.resolve(process.env['AGENTMESH_CONFIG_PATH'])
    : process.cwd();
  const paths = explicitPath
    ? [path.resolve(explicitPath)]
    : DEFAULT_CONFIG_PATHS.map((p) => path.resolve(searchDir, p));

  for (const p of paths) {
    if (existsSync(p)) {
      const raw = readFileSync(p, 'utf8');
      try {
        return JSON.parse(raw) as AgentMeshConfig;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        throw new Error(`Invalid JSON in config file ${p}: ${message}`);
      }
    }
  }

  return {};
}
