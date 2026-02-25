import { readFileSync, existsSync, statSync } from 'node:fs';
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

/** QuokkaMesh configuration file shape. */
export interface QuokkaMeshConfig {
  /** Optional display name for the agent. */
  name?: string;
  /** Data directory for keys and certs (default: ~/.qmesh or ./.qmesh). */
  dataDir?: string;
  /** Transport options. */
  transport?: TransportConfig;
  /** Tools to register (besides the standard quokkamesh/llm-message). */
  tools?: ToolConfig[];
  /** Optional paths to skills/prompts/commands (reserved for future use). */
  skills?: string[];
  prompts?: string[];
  commands?: string[];
}

const DEFAULT_CONFIG_PATHS = ['qmesh.config.json', '.qmesh.json'];

/**
 * Resolve data directory: QMESH_DATA_DIR env (first), then config.dataDir, then ~/.qmesh, then ./.qmesh.
 */
export function resolveDataDir(config?: QuokkaMeshConfig): string {
  const env = process.env['QMESH_DATA_DIR'];
  if (env) {
    return path.resolve(env);
  }
  if (config?.dataDir) {
    return path.resolve(config.dataDir);
  }
  const home = process.env['HOME'] ?? process.env['USERPROFILE'];
  if (home) {
    return path.resolve(home, '.qmesh');
  }
  return path.resolve(process.cwd(), '.qmesh');
}

/**
 * Load config from file. If QMESH_CONFIG_PATH is set: when it is a file path, that file is used;
 * when it is a directory, qmesh.config.json / .qmesh.json are searched there. Otherwise searches cwd.
 */
export function loadConfig(explicitPath?: string): QuokkaMeshConfig {
  const envPath = process.env['QMESH_CONFIG_PATH'];
  const resolvedEnv = envPath ? path.resolve(envPath) : undefined;
  let paths: string[];
  if (explicitPath) {
    paths = [path.resolve(explicitPath)];
  } else if (resolvedEnv !== undefined && existsSync(resolvedEnv)) {
    paths = statSync(resolvedEnv).isFile()
      ? [resolvedEnv]
      : DEFAULT_CONFIG_PATHS.map((p) => path.resolve(resolvedEnv, p));
  } else {
    paths = DEFAULT_CONFIG_PATHS.map((p) => path.resolve(process.cwd(), p));
  }

  for (const p of paths) {
    if (existsSync(p)) {
      const raw = readFileSync(p, 'utf8');
      try {
        return JSON.parse(raw) as QuokkaMeshConfig;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        throw new Error(`Invalid JSON in config file ${p}: ${message}`);
      }
    }
  }

  return {};
}
