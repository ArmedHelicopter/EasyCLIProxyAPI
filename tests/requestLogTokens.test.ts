import { describe, expect, it } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import postcss from 'postcss';

const componentsCss = readFileSync(join(import.meta.dir, '../src/styles/tokens/components.css'), 'utf8');
const baseCss = readFileSync(join(import.meta.dir, '../src/styles/tokens/base.css'), 'utf8');

function getRootDeclarations(css: string): Record<string, string> {
  const root = postcss.parse(css);
  const decls: Record<string, string> = {};
  root.walkRules((rule) => {
    if (rule.selector === ':root') {
      rule.walkDecls((decl) => {
        decls[decl.prop] = decl.value;
      });
    }
  });
  return decls;
}

describe('request log semantic tokens regression', () => {
  it('maps request log metric, duration, and subpage colors to expected tokens and palette', () => {
    const baseDecls = getRootDeclarations(baseCss);
    const compDecls = getRootDeclarations(componentsCss);

    expect(baseDecls['--palette-blue-600']).toBe('#2563eb');

    expect(compDecls['--request-log-input']).toBe('var(--palette-blue-600)');
    expect(compDecls['--request-log-output']).toBe('var(--color-info-text)');
    expect(compDecls['--request-log-cache-read']).toBe('var(--color-info-text)');
    expect(compDecls['--request-log-reasoning']).toBe('var(--color-warning-text)');
    expect(compDecls['--request-log-cache-write']).toBe('var(--color-warning-text)');
    expect(compDecls['--request-log-response-model']).toBe('var(--color-warning-text)');
    expect(compDecls['--request-log-duration-good']).toBe('var(--color-success-text)');
    expect(compDecls['--request-log-duration-warn']).toBe('var(--color-warning-text)');
    expect(compDecls['--request-log-duration-bad']).toBe('var(--color-danger-text)');

    expect(compDecls['--usage-subpage-text']).toBe('var(--theme-text-primary, var(--color-text-primary))');
    expect(compDecls['--usage-subpage-muted']).toBe('var(--theme-text-muted, var(--color-text-muted))');

    expect(compDecls['--request-log-input']).not.toBe(compDecls['--request-log-output']);
    expect(compDecls['--request-log-input']).not.toBe(compDecls['--request-log-cache-read']);

    const validatedTokens = [
      '--request-log-input',
      '--request-log-output',
      '--request-log-reasoning',
      '--request-log-cache-read',
      '--request-log-cache-write',
      '--request-log-response-model',
      '--request-log-duration-good',
      '--request-log-duration-warn',
      '--request-log-duration-bad',
      '--usage-subpage-text',
      '--usage-subpage-muted',
    ];

    for (const token of validatedTokens) {
      expect(compDecls[token]).not.toContain('border');
      expect(compDecls[token]).not.toContain('surface');
    }
  });
});
