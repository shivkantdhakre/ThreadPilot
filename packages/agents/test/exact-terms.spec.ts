/// <reference types="node" />
import { describe, it } from 'node:test';
import assert from 'node:assert';
import { extractExactTerms } from '../dist/content/exact-terms.js';

describe('extractExactTerms()', () => {
  // ── Quoted phrases ─────────────────────────────────────────────────────────

  it('extracts a straight-quoted phrase', () => {
    const terms = extractExactTerms('Write about "Nike Air Max" launch');
    assert(terms.includes('Nike Air Max'), `expected "Nike Air Max" in [${terms}]`);
  });

  it('extracts a curly-quoted phrase', () => {
    const terms = extractExactTerms('\u201cReact Native\u201d tutorial');
    assert(terms.includes('React Native'), `expected "React Native" in [${terms}]`);
  });

  it('extracts multiple quoted phrases from one string', () => {
    const terms = extractExactTerms('"Product Hunt" launch and "Build In Public" series');
    assert(terms.includes('Product Hunt'));
    assert(terms.includes('Build In Public'));
  });

  // ── ALL_CAPS tokens ────────────────────────────────────────────────────────

  it('extracts ALL_CAPS abbreviations of 3+ chars', () => {
    const terms = extractExactTerms('Promote the LLAMA and GPT4 campaign');
    assert(terms.includes('LLAMA'), `expected LLAMA in [${terms}]`);
  });

  it('does NOT extract 1-2 char all-caps tokens (I, OK)', () => {
    const terms = extractExactTerms('OK I will write it');
    assert(!terms.includes('OK'), 'OK (2 chars) should be filtered');
    assert(!terms.includes('I'),  'I (1 char) should be filtered');
  });

  // ── Title Case runs ────────────────────────────────────────────────────────

  it('extracts a 2-word Title Case product name', () => {
    const terms = extractExactTerms('Our new React Native app is live');
    assert(terms.includes('React Native'), `expected "React Native" in [${terms}]`);
  });

  it('extracts a 3-word Title Case brand name', () => {
    const terms = extractExactTerms('we use Google Cloud Platform for hosting');
    assert(terms.includes('Google Cloud Platform'), `expected "Google Cloud Platform" in [${terms}]`);
  });

  // ── Hashtags and mentions ──────────────────────────────────────────────────

  it('extracts hashtags (without #)', () => {
    const terms = extractExactTerms('Post about #BuildInPublic today');
    assert(terms.includes('BuildInPublic'), `expected BuildInPublic in [${terms}]`);
  });

  it('extracts @mentions (without @)', () => {
    const terms = extractExactTerms('Mention @anthropic and @openai');
    assert(terms.includes('anthropic'), `expected anthropic in [${terms}]`);
    assert(terms.includes('openai'),    `expected openai in [${terms}]`);
  });

  // ── Deduplication ──────────────────────────────────────────────────────────

  it('deduplicates when the same term appears in multiple signal classes', () => {
    // "Nike" appears as a quoted phrase AND would be caught by other rules
    const terms = extractExactTerms('"Nike" is a great brand — Nike shoes');
    const nikeCount = terms.filter((t) => t === 'Nike').length;
    assert.strictEqual(nikeCount, 1, 'Nike should appear exactly once');
  });

  // ── Empty / plain prose ────────────────────────────────────────────────────

  it('returns empty array for all-lowercase plain prose', () => {
    const terms = extractExactTerms('write something about productivity tips');
    assert.strictEqual(terms.length, 0, `expected [], got [${terms}]`);
  });

  it('returns empty array for an empty string', () => {
    const terms = extractExactTerms('');
    assert.strictEqual(terms.length, 0);
  });
});
