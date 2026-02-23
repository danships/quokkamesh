import { describe, it, expect } from 'vitest';
import {
  LLM_MESSAGE_TOOL,
  LLM_MESSAGE_TOOL_NAME,
  validatePayload,
  getStandardTool,
  getStandardTools,
} from '../src/protocol/standard-tools.js';

describe('standard tools', () => {
  it('LLM_MESSAGE_TOOL_NAME is agentmesh/llm-message', () => {
    expect(LLM_MESSAGE_TOOL_NAME).toBe('agentmesh/llm-message');
  });

  it('LLM_MESSAGE_TOOL has name, description, parameters', () => {
    expect(LLM_MESSAGE_TOOL.name).toBe('agentmesh/llm-message');
    expect(LLM_MESSAGE_TOOL.description).toContain('Free-form');
    expect(LLM_MESSAGE_TOOL.parameters).toBeDefined();
    expect((LLM_MESSAGE_TOOL.parameters as { required?: string[] }).required).toEqual(['text']);
  });

  it('getStandardTool returns LLM_MESSAGE_TOOL for agentmesh/llm-message', () => {
    expect(getStandardTool('agentmesh/llm-message')).toEqual(LLM_MESSAGE_TOOL);
    expect(getStandardTool('other')).toBeUndefined();
  });

  it('getStandardTools returns at least LLM_MESSAGE_TOOL', () => {
    const tools = getStandardTools();
    expect(tools).toContainEqual(LLM_MESSAGE_TOOL);
    expect(tools.length).toBeGreaterThanOrEqual(1);
  });
});

describe('validatePayload', () => {
  it('accepts valid LLM message payload', () => {
    expect(validatePayload(LLM_MESSAGE_TOOL, { text: 'hello' })).toEqual({ valid: true });
    expect(validatePayload(LLM_MESSAGE_TOOL, { text: '' })).toEqual({ valid: true });
  });

  it('rejects non-object for agentmesh/llm-message', () => {
    const r1 = validatePayload(LLM_MESSAGE_TOOL, null);
    expect(r1.valid).toBe(false);
    if (!r1.valid) {
      expect(r1.error).toContain('object');
    }

    expect(validatePayload(LLM_MESSAGE_TOOL, 'hello').valid).toBe(false);
    expect(validatePayload(LLM_MESSAGE_TOOL, 123).valid).toBe(false);
    expect(validatePayload(LLM_MESSAGE_TOOL, []).valid).toBe(false);
  });

  it('rejects missing or non-string text for agentmesh/llm-message', () => {
    const r1 = validatePayload(LLM_MESSAGE_TOOL, {});
    expect(r1.valid).toBe(false);
    if (!r1.valid) {
      expect(r1.error).toContain('text');
    }

    expect(validatePayload(LLM_MESSAGE_TOOL, { text: 42 }).valid).toBe(false);
  });

  it('accepts unknown tool with object payload', () => {
    const tool = { name: 'custom', description: 'Custom tool' };
    expect(validatePayload(tool, { foo: 1 })).toEqual({ valid: true });
  });

  it('rejects unknown tool with non-object payload', () => {
    const tool = { name: 'custom', description: 'Custom tool' };
    const r1 = validatePayload(tool, null);
    expect(r1.valid).toBe(false);
    if (!r1.valid) {
      expect(r1.error).toBeDefined();
    }
    const r2 = validatePayload(tool, 'string');
    expect(r2.valid).toBe(false);
  });
});
