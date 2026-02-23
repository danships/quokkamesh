import { describe, it, expect } from 'vitest';
import { ToolRegistry } from '../src/protocol/tools.js';
import type { Tool } from '../src/protocol/types.js';

const echoTool: Tool = { name: 'echo', description: 'Echoes back the message it receives' };
const echoHandler = async (payload: unknown) => {
  return { echo: (payload as { message: string }).message };
};

describe('ToolRegistry', () => {
  it('register and lookup', () => {
    const registry = new ToolRegistry();
    registry.register(echoTool, echoHandler);

    expect(registry.has('echo')).toBe(true);
  });

  it('handler is callable', async () => {
    const registry = new ToolRegistry();
    registry.register(echoTool, echoHandler);

    const handler = registry.getHandler('echo');
    expect(handler).toBeDefined();
    const result = await handler!({ message: 'hello' });
    expect(result).toEqual({ echo: 'hello' });
  });

  it('unknown tool', () => {
    const registry = new ToolRegistry();

    expect(registry.has('nonexistent')).toBe(false);
    expect(registry.getHandler('nonexistent')).toBeUndefined();
  });

  it('list returns all', () => {
    const registry = new ToolRegistry();
    const summarizeTool: Tool = { name: 'summarize', description: 'Summarizes text' };
    registry.register(echoTool, echoHandler);
    registry.register(summarizeTool, async () => ({}));

    const tools = registry.list();
    expect(tools).toHaveLength(2);
    expect(tools).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'echo' }),
        expect.objectContaining({ name: 'summarize' }),
      ]),
    );
  });
});
