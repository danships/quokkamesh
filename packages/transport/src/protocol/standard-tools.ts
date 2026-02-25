import type { Tool } from './types.js';

/** Well-known tool name for free-form text messages between LLM agents. */
export const LLM_MESSAGE_TOOL_NAME = 'quokkamesh/llm-message';

/** Standard tool definition: free-text input for LLM-to-LLM communication. */
export const LLM_MESSAGE_TOOL: Tool = {
  name: LLM_MESSAGE_TOOL_NAME,
  description:
    'Free-form text message for LLM agents. Use this to send arbitrary text to another agent.',
  parameters: {
    type: 'object',
    required: ['text'],
    properties: {
      text: { type: 'string', description: 'The message content' },
    },
  },
};

/** Payload type for the standard LLM message tool. */
export interface LlmMessagePayload {
  text: string;
}

const STANDARD_TOOLS: Record<string, Tool> = {
  [LLM_MESSAGE_TOOL_NAME]: LLM_MESSAGE_TOOL,
};

/**
 * Validates payload against a tool definition.
 * For the standard quokkamesh/llm-message tool, enforces { text: string }.
 * For other tools, returns valid if no parameters schema is defined; otherwise performs minimal checks.
 */
export function validatePayload(
  tool: Tool,
  payload: unknown,
): { valid: true } | { valid: false; error: string } {
  if (tool.name === LLM_MESSAGE_TOOL_NAME) {
    if (payload === null || typeof payload !== 'object' || Array.isArray(payload)) {
      return { valid: false, error: 'Payload must be an object with a text field' };
    }
    const obj = payload as Record<string, unknown>;
    if (typeof obj.text !== 'string') {
      return { valid: false, error: 'Payload must have a string "text" field' };
    }
    return { valid: true };
  }

  // Other tools: payload must be an object
  if (payload === null || typeof payload !== 'object' || Array.isArray(payload)) {
    return { valid: false, error: 'Payload must be an object' };
  }
  const params = tool.parameters as
    | { required?: string[]; properties?: Record<string, { type?: string }> }
    | undefined;
  if (params?.required) {
    const obj = payload as Record<string, unknown>;
    for (const key of params.required) {
      if (!(key in obj)) {
        return { valid: false, error: `Missing required field: ${key}` };
      }
      const props = params.properties;
      if (props?.[key]?.type) {
        const expected = props[key].type;
        const val = obj[key];
        const actual = Array.isArray(val) ? 'array' : typeof val;
        if (expected === 'integer' && typeof val !== 'number') {
          return { valid: false, error: `Field ${key} expected type integer but got ${actual}` };
        }
        if (expected !== 'array' && expected !== 'object' && actual !== expected) {
          return {
            valid: false,
            error: `Field ${key} expected type ${expected} but got ${actual}`,
          };
        }
        if ((expected === 'array' || expected === 'object') && actual !== expected) {
          return {
            valid: false,
            error: `Field ${key} expected type ${expected} but got ${actual}`,
          };
        }
      }
    }
  }
  return { valid: true };
}

/** Returns the standard tool definition by name, if any. */
export function getStandardTool(name: string): Tool | undefined {
  return STANDARD_TOOLS[name];
}

/** List of all standard tool definitions. */
export function getStandardTools(): Tool[] {
  return Object.values(STANDARD_TOOLS);
}
