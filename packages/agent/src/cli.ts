#!/usr/bin/env node
import { program } from 'commander';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { runAgent } from './runner.js';
import { loadConfig, resolveDataDir } from './config.js';
import { loadOrCreateAgentKey, loadOwnerKey, loadAgentKey, createOwnerKey } from './keys.js';

program.name('agentmesh-agent').description('Run an AgentMesh agent').version('0.1.0');

program
  .command('start')
  .description('Start the agent (load config, keys, and run)')
  .option('-c, --config <path>', 'Path to config file')
  .action(async (opts: { config?: string }) => {
    try {
      const agent = await runAgent(opts.config);
      console.error('Agent started. Peer ID:', agent.peerId);
      console.error('Press Ctrl+C to stop.');
      let shuttingDown = false;
      let resolveWait: () => void;
      const waitPromise = new Promise<void>((r) => {
        resolveWait = r;
      });
      const shutdown = async () => {
        if (shuttingDown) {
          return;
        }
        shuttingDown = true;
        try {
          await agent.stop();
        } catch (error) {
          console.error('Error stopping agent:', error);
        }
        resolveWait();
        process.exit(0);
      };
      process.on('SIGINT', shutdown);
      process.on('SIGTERM', shutdown);
      await waitPromise;
    } catch (error) {
      console.error('Failed to start agent:', error);
      process.exit(1);
    }
  });

program
  .command('init')
  .description('Scaffold config and generate keys in the data directory')
  .option('-c, --config <path>', 'Path to write config file (default: ./agentmesh.config.json)')
  .option('-d, --data-dir <path>', 'Data directory for keys (default: ./.agentmesh)')
  .action(async (opts: { config?: string; dataDir?: string }) => {
    try {
      const dataDir = path.resolve(opts.dataDir ?? './.agentmesh');
      const configPath = path.resolve(opts.config ?? './agentmesh.config.json');
      mkdirSync(dataDir, { recursive: true });
      loadOrCreateAgentKey(dataDir);
      if (!loadOwnerKey(dataDir)) {
        createOwnerKey(dataDir);
      }
      const config = {
        name: 'my-agent',
        dataDir: path.resolve(dataDir),
        transport: { network: 'public', listenPort: 0, bootstrapAddrs: [] },
        tools: [],
      };
      if (existsSync(configPath)) {
        console.error(
          'Config already exists at',
          configPath,
          '— skipping write to avoid overwriting.',
        );
      } else {
        writeFileSync(configPath, JSON.stringify(config, null, 2));
        console.error('Created', configPath, 'and keys in', dataDir);
      }
    } catch (error) {
      console.error('Init failed:', error);
      process.exit(1);
    }
  });

const keysCmd = program.command('keys').description('Key management');
keysCmd
  .command('show')
  .description('Show agent ID (public key hex) and multiaddrs if agent is running')
  .option('-d, --data-dir <path>', 'Data directory (default: from config or ~/.agentmesh)')
  .action(async (opts: { dataDir?: string }) => {
    const config = loadConfig();
    const dataDir = opts.dataDir ?? resolveDataDir(config);
    const identity = loadAgentKey(dataDir);
    if (!identity) {
      console.error('No agent key found. Run `agentmesh-agent init` first.');
      process.exit(1);
    }
    const hex = Buffer.from(identity.publicKey).toString('hex');
    console.log('Agent public key (hex):', hex);
    console.log('Agent URI: agent://' + hex);
  });

program.parse();
