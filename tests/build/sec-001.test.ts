/**
 * tests/build/sec-001.test.ts
 *
 * Validates SEC-001: no forbidden strings appear in the compiled JS bundle.
 *
 * Runs as a post-build Node.js Vitest test (environment: 'node').
 * Skips gracefully when .next/static doesn't exist (pre-build environments).
 * Exit code 1 blocks the CI pipeline when violations are found.
 *
 * Permitted strings: Firebase config (public by design), IDB key names.
 * Forbidden strings: NEXT_PUBLIC_MASTER_PASSWORD, hardcoded passphrases.
 */

import { describe, it, expect } from 'vitest';
import fs   from 'node:fs';
import path from 'node:path';
import { globSync } from 'glob';

// ── Project root relative to this file ────────────────────────────────────────
const PROJECT_ROOT = path.resolve(import.meta.dirname, '../..');
const NEXT_CHUNKS  = path.join(PROJECT_ROOT, '.next', 'static', 'chunks');
const BUILD_EXISTS = fs.existsSync(NEXT_CHUNKS);

// ── Forbidden patterns ─────────────────────────────────────────────────────────
interface ForbiddenRule {
  id:      string;
  pattern: RegExp;
  reason:  string;
}

const FORBIDDEN: ForbiddenRule[] = [
  {
    id:      'BUN-01',
    pattern: /NEXT_PUBLIC_MASTER_PASSWORD/,
    reason:  'Env var eliminated in C-002 — must not appear in any bundle chunk',
  },
  {
    id:      'BUN-02',
    pattern: /my-master-password/i,
    reason:  'Default placeholder from .env.example — must not be compiled into bundle',
  },
  {
    id:      'BUN-03',
    pattern: /master[\-_]?password/i,
    reason:  'Master password concept must not appear as a value or identifier',
  },
];

// ── Allowed patterns (presence is asserted as a sanity check) ──────────────────
interface AllowedRule {
  id:          string;
  pattern:     RegExp;
  description: string;
}

const EXPECTED_PRESENT: AllowedRule[] = [
  {
    id:          'BUN-10',
    pattern:     /altesa-clinical-ops/,
    description: 'Firebase projectId — intentionally public, must be present',
  },
  {
    id:          'BUN-11',
    pattern:     /AIzaSy[A-Za-z0-9_\-]{33,}/,
    description: 'Firebase apiKey — intentionally public by Google design',
  },
];

// ── Scanner ────────────────────────────────────────────────────────────────────
interface Violation {
  file:     string;
  ruleId:   string;
  reason:   string;
  excerpt:  string;
}

function scanChunks(chunks: string[]): Violation[] {
  const violations: Violation[] = [];

  for (const file of chunks) {
    const content = fs.readFileSync(file, 'utf8');
    const relFile = path.relative(PROJECT_ROOT, file);

    for (const rule of FORBIDDEN) {
      const match = rule.pattern.exec(content);
      if (match) {
        violations.push({
          file:    relFile,
          ruleId:  rule.id,
          reason:  rule.reason,
          excerpt: content.slice(
            Math.max(0, match.index - 40),
            match.index + 80
          ).replace(/\n/g, '↵'),
        });
      }
    }
  }

  return violations;
}

// ── Test suite (skips when build doesn't exist) ────────────────────────────────
describe.skipIf(!BUILD_EXISTS)(
  'SEC-001 — Bundle integrity: no forbidden strings in compiled output',
  () => {
    let chunks: string[];

    // Collect all JS chunk files
    chunks = globSync(`${NEXT_CHUNKS}/**/*.js`);

    it('build output contains at least one chunk', () => {
      expect(chunks.length).toBeGreaterThan(0);
    });

    it('BUN-01/02/03 — no forbidden patterns in any chunk', () => {
      const violations = scanChunks(chunks);

      if (violations.length > 0) {
        const report = violations
          .map(v => `  [${v.ruleId}] ${v.file}\n    ${v.reason}\n    ...${v.excerpt}...`)
          .join('\n\n');
        expect.fail(`SEC-001 VIOLATIONS FOUND:\n\n${report}`);
      }

      expect(violations).toHaveLength(0);
    });

    it('BUN-10/11 — Firebase config is present (sanity: firebase.ts was compiled)', () => {
      const allContent = chunks.map(f => fs.readFileSync(f, 'utf8')).join('\n');

      for (const rule of EXPECTED_PRESENT) {
        expect(
          rule.pattern.test(allContent),
          `${rule.id}: Expected to find "${rule.description}" in bundle`
        ).toBe(true);
      }
    });

    it('BUN-13 — altesa_master_password appears only as IDB key string literal', () => {
      const allContent = chunks.map(f => fs.readFileSync(f, 'utf8')).join('\n');
      const matches    = [...allContent.matchAll(/altesa_master_password/g)];

      // It MAY appear as a key name (string in setItem/getItem calls)
      // but must NOT appear as a standalone identifier (no quotes)
      for (const match of matches) {
        const ctx = allContent.slice(
          Math.max(0, match.index! - 1),
          match.index! + 'altesa_master_password'.length + 1
        );
        const isStringLiteral = ctx.startsWith("'") || ctx.startsWith('"') || ctx.startsWith('`');
        expect(isStringLiteral,
          `altesa_master_password found outside string literal context: ...${ctx}...`
        ).toBe(true);
      }
    });
  }
);

// When build doesn't exist, emit a skip notice (not a failure)
if (!BUILD_EXISTS) {
  describe('SEC-001 — Bundle inspection', () => {
    it.skip('Skipped: run `next build` first, then re-execute this suite', () => {});
  });
}
