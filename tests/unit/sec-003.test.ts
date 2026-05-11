/**
 * tests/unit/sec-003.test.ts
 *
 * SEC-003: filterPII must not redact clinical strings that are not PII,
 * and must correctly redact strings that are PII.
 *
 * False-positive protection is critical in a clinical context:
 * a patient ID "123-456-7890" format or a protocol date "2026-01-15"
 * must not be silently stripped from exported packages.
 *
 * Coverage:
 *   A. Must NOT redact (false-positive corpus)
 *   B. Must redact (true-positive corpus)
 *   C. Mixed content: one PII item embedded in clinical text
 *   D. Edge cases: empty string, already-clean text, nested objects
 */

import { describe, it, expect } from 'vitest';
import { filterPII } from '@/lib/crypto';

describe('SEC-003 — filterPII: false-positive protection', () => {

  // ── A: Clinical strings that MUST NOT be redacted ─────────────────────────

  it.each([
    // ISO 8601 dates — must not match SSN pattern \b\d{3}-\d{2}-\d{4}\b
    ['ISO date full',         '2026-01-15T09:30:00Z'],
    ['ISO date only',         '2026-01-15'],
    ['ISO date range',        '2026-01-15 to 2026-03-20'],
    // Protocol / study identifiers
    ['Study ID',              'ALTESA-VPV-001'],
    ['Patient ID with prefix','HMC-047'],
    ['Patient ID',            'SYN-0042'],
    ['Site ID',               'FALP-CL'],
    ['Version string',        'v1.0'],
    ['Visit code',            'V03-Day14'],
    // Numbers that are NOT SSN/phone in clinical context
    ['Day number',            'Day 14 of treatment'],
    ['Score value',           'FEV1: 2.45L (85% predicted)'],
    ['Temperature',           '37.5°C'],
    ['Spirometry',            'FVC 3.21L / FEV1 2.87L / ratio 89%'],
    // Codes with digits that don't match PII patterns
    ['Task code',             'PSB-001'],
    ['Amendment version',     'Amendment 2.1'],
    ['Protocol number',       'Protocol 2B'],
  ])('does NOT redact: %s → "%s"', (_label, input) => {
    expect(filterPII(input)).toBe(input);
  });

  // ── B: Strings that MUST be redacted (true positives) ─────────────────────

  it.each([
    // US SSN
    ['SSN dashes',            '123-45-6789',        '[REDACTED SSN]'],
    ['SSN in sentence',
      'Patient SSN: 987-65-4321 enrolled',
      'Patient SSN: [REDACTED SSN] enrolled'],
    // Phone numbers
    ['Phone dashes',          '555-123-4567',        '[REDACTED PHONE]'],
    ['Phone dots',            '555.123.4567',        '[REDACTED PHONE]'],
    ['Phone no separator',    '5551234567',          '[REDACTED PHONE]'],
    // Email
    ['Email basic',           'patient@hospital.com', '[REDACTED EMAIL]'],
    ['Email subdomain',       'crc.user@site.org',   '[REDACTED EMAIL]'],
  ])('redacts: %s', (_label, input, expected) => {
    expect(filterPII(input)).toBe(expected);
  });

  // ── C: Mixed content ───────────────────────────────────────────────────────

  it('redacts only the PII portion of mixed clinical text', () => {
    const input    = 'Patient HMC-047 (DOB: 2026-01-15) email: patient@hospital.com enrolled';
    const filtered = filterPII(input);

    // Clinical identifiers preserved
    expect(filtered).toContain('HMC-047');
    expect(filtered).toContain('2026-01-15');
    expect(filtered).toContain('enrolled');
    // PII redacted
    expect(filtered).not.toContain('patient@hospital.com');
    expect(filtered).toContain('[REDACTED EMAIL]');
  });

  it('redacts all PII occurrences in a string (global replace)', () => {
    const input    = 'Contact: a@b.com and c@d.org';
    const filtered = filterPII(input);
    expect(filtered).toBe('Contact: [REDACTED EMAIL] and [REDACTED EMAIL]');
  });

  // ── D: Edge cases ──────────────────────────────────────────────────────────

  it('returns empty string unchanged', () => {
    expect(filterPII('')).toBe('');
  });

  it('returns already-clean clinical text unchanged', () => {
    const clean = 'Study visit Day 14: spirometry performed per protocol';
    expect(filterPII(clean)).toBe(clean);
  });

  it('handles text with only whitespace unchanged', () => {
    expect(filterPII('   ')).toBe('   ');
  });

  // ── E: Critical false-positive: ISO date must never match SSN ─────────────

  it('ISO date "2026-01-15" does not match SSN pattern \\b\\d{3}-\\d{2}-\\d{4}\\b', () => {
    // "2026-01-15": 2026 is 4 digits (not 3), so \b\d{3}... would NOT match at start
    // "01-15" remaining does not form SSN pattern
    const dates = [
      '2026-01-15', '2025-12-31', '1999-01-01',
      'screened on 2026-01-15', 'visit: 2026-03-20T14:00Z',
    ];
    for (const d of dates) {
      expect(filterPII(d)).toBe(d);
    }
  });
});
