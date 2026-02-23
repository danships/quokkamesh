import type { Tool } from '../../src/protocol/types.js';
import type { TaskHandler } from '../../src/protocol/tools.js';

export const echoTool: Tool = { name: 'echo', description: 'Echoes back the message it receives' };

export const echoHandler: TaskHandler = async (payload) => {
  return { echo: (payload as { message: string }).message };
};
