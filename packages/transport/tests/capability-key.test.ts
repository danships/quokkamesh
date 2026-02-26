import { describe, it, expect } from 'vitest';
import {
  capabilityKey,
  capabilityDescriptor,
} from '../src/capability-key.js';

describe('capability-key', () => {
  const defaultNamespace = 'quokkamesh/capability';

  describe('capabilityDescriptor', () => {
    it('builds full descriptor with default namespace', () => {
      expect(capabilityDescriptor('translate')).toBe(
        'quokkamesh/capability/translate',
      );
      expect(capabilityDescriptor('echo')).toBe('quokkamesh/capability/echo');
    });

    it('uses custom namespace when provided', () => {
      expect(capabilityDescriptor('summarize', 'my/app')).toBe(
        'my/app/summarize',
      );
    });

    it('handles namespace ending with slash', () => {
      expect(capabilityDescriptor('x', 'ns/')).toBe('ns/x');
    });

    it('trims descriptor', () => {
      expect(capabilityDescriptor('  translate  ')).toBe(
        'quokkamesh/capability/translate',
      );
    });
  });

  describe('capabilityKey', () => {
    it('returns same CID for same descriptor and namespace', () => {
      const cid1 = capabilityKey('translate');
      const cid2 = capabilityKey('translate');
      expect(cid1.toString()).toBe(cid2.toString());
    });

    it('returns different CIDs for different descriptors', () => {
      const cidTranslate = capabilityKey('translate');
      const cidSummarize = capabilityKey('summarize');
      expect(cidTranslate.toString()).not.toBe(cidSummarize.toString());
    });

    it('returns different CIDs for same descriptor in different namespaces', () => {
      const cid1 = capabilityKey('echo', defaultNamespace);
      const cid2 = capabilityKey('echo', 'other/ns');
      expect(cid1.toString()).not.toBe(cid2.toString());
    });

    it('returns a valid CID (version 1)', () => {
      const cid = capabilityKey('translate');
      expect(cid.version).toBe(1);
      expect(cid.toString()).toBeDefined();
      expect(cid.toString().length).toBeGreaterThan(10);
    });

    it('accepts arbitrary descriptor strings (no allowlist)', () => {
      const cid1 = capabilityKey('agent:translate:en→fr');
      const cid2 = capabilityKey('compute.gpu.cuda.12');
      expect(cid1.toString()).toBeDefined();
      expect(cid2.toString()).toBeDefined();
      expect(cid1.toString()).not.toBe(cid2.toString());
    });
  });
});
