import { describe, it, expect } from 'vitest';
import { loadConfig, resolveDataDir } from '../src/config.js';

describe('config', () => {
  it('loadConfig with no file returns empty object', () => {
    const config = loadConfig('/nonexistent/path/agentmesh.config.json');
    expect(config).toEqual({});
  });

  it('resolveDataDir uses config.dataDir when set', () => {
    const orig = process.env['AGENTMESH_DATA_DIR'];
    try {
      delete process.env['AGENTMESH_DATA_DIR'];
      const dir = resolveDataDir({ dataDir: '/custom/path' });
      expect(dir).toContain('custom');
      expect(dir).toContain('path');
    } finally {
      if (orig !== undefined) {
        process.env['AGENTMESH_DATA_DIR'] = orig;
      }
    }
  });

  it('resolveDataDir returns path without config', () => {
    const dir = resolveDataDir();
    expect(dir).toBeDefined();
    expect(dir.length).toBeGreaterThan(0);
  });
});
