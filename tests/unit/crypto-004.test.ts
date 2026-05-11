/**
 * tests/unit/crypto-004.test.ts
 *
 * Validates CRYPTO-004: verifyAndDecrypt rejects packages with unsupported,
 * missing, or malformed version fields deterministically.
 *
 * All tests use forged packages (no real WebCrypto) because the version check
 * fires BEFORE any crypto.subtle call. Spy assertions confirm no key material
 * was accessed in rejection cases.
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { verifyAndDecrypt, CryptoError } from '@/lib/crypto';
import { PackageForgeFactory }           from '../__helpers__/PackageForgeFactory';

// Stub keys — values don't matter; the version check fires first
const STUB_PRIV_KEY = btoa('privkey');
const STUB_PUB_KEY  = btoa('pubkey');

afterEach(() => vi.restoreAllMocks());

describe('CRYPTO-004 — Package version rejection (deterministic)', () => {

  // ─────────────────────────────────────────────────────────────────────
  // Rejection cases: verify error type AND that crypto.subtle was NOT invoked
  // ─────────────────────────────────────────────────────────────────────

  it.each([
    ['CV-4.1 future version string "2"', PackageForgeFactory.futureV('2')],
    ['CV-4.2 absurd version string "99"', PackageForgeFactory.futureV('99')],
    ['CV-4.5 empty string version ""',   PackageForgeFactory.emptyV()],
    ['CV-4.8 non-numeric string "one"',  PackageForgeFactory.stringV('one')],
    ['CV-4.7 number version 1 (strict)', PackageForgeFactory.numericV(1)],
    ['CV-4.7b boolean version true',     PackageForgeFactory.numericV(true as any)],
    ['CV-4.7c object version {}',        PackageForgeFactory.numericV({} as any)],
  ])('%s → rejects before any WebCrypto call', async (_label, pkg) => {
    const importKeySpy = vi.spyOn(globalThis.crypto.subtle, 'importKey');

    await expect(
      verifyAndDecrypt(pkg, STUB_PRIV_KEY, STUB_PUB_KEY)
    ).rejects.toBeInstanceOf(CryptoError);

    expect(importKeySpy, 'crypto.subtle.importKey must NOT be called on version rejection')
      .not.toHaveBeenCalled();
  });

  // ─────────────────────────────────────────────────────────────────────
  // Version rejection carries correct CryptoError type
  // ─────────────────────────────────────────────────────────────────────

  it('CV-4.1 — CryptoError type is FORMAT for unsupported version', async () => {
    const err = await verifyAndDecrypt(
      PackageForgeFactory.futureV('2'), STUB_PRIV_KEY, STUB_PUB_KEY
    ).catch(e => e);

    expect(err).toBeInstanceOf(CryptoError);
    expect(err.type).toBe('FORMAT');
    // Error message must not leak the raw version value (SbD)
    expect(err.message).toContain("Unsupported package version");
  });

  it('CV-4.7 — CryptoError type is FORMAT for non-string version', async () => {
    const err = await verifyAndDecrypt(
      PackageForgeFactory.numericV(1), STUB_PRIV_KEY, STUB_PUB_KEY
    ).catch(e => e);

    expect(err).toBeInstanceOf(CryptoError);
    expect(err.type).toBe('FORMAT');
    expect(err.message).toContain('expected string');
  });

  // ─────────────────────────────────────────────────────────────────────
  // Pass-through cases: version check passes, crypto proceeds
  // (Will fail later due to synthetic key material — that's expected)
  // ─────────────────────────────────────────────────────────────────────

  it.each([
    ['CV-4.3 explicit v:"1"',  PackageForgeFactory.validV1()],
    ['CV-4.4 no v field',      PackageForgeFactory.legacy()],
    ['CV-4.6 v:null',          PackageForgeFactory.nullV()],
  ])('%s → version check passes, proceeds to crypto phase', async (_label, pkg) => {
    const importKeySpy = vi.spyOn(globalThis.crypto.subtle, 'importKey');

    const err = await verifyAndDecrypt(pkg, STUB_PRIV_KEY, STUB_PUB_KEY).catch(e => e);

    // Must NOT be a FORMAT/version error
    expect(err).toBeInstanceOf(CryptoError);
    expect(err.type).not.toBe('FORMAT');
    // importKey SHOULD have been attempted (version passed → crypto ran)
    expect(importKeySpy).toHaveBeenCalled();
  });

  // ─────────────────────────────────────────────────────────────────────
  // FORMAT check: missing required fields (fires before version check)
  // ─────────────────────────────────────────────────────────────────────

  it.each([
    ['missing iv',           'iv'],
    ['missing ciphertext',   'ciphertext'],
    ['missing encryptedKey', 'encryptedKey'],
    ['missing signature',    'signature'],
  ] as const)('FORMAT — %s → CryptoError FORMAT', async (_label, field) => {
    const pkg = PackageForgeFactory.missingField(field);
    const err  = await verifyAndDecrypt(pkg, STUB_PRIV_KEY, STUB_PUB_KEY).catch(e => e);
    expect(err).toBeInstanceOf(CryptoError);
    expect(err.type).toBe('FORMAT');
  });

  // ─────────────────────────────────────────────────────────────────────
  // Edge: null package → FORMAT
  // ─────────────────────────────────────────────────────────────────────

  it('null package → FORMAT error', async () => {
    const err = await verifyAndDecrypt(null, STUB_PRIV_KEY, STUB_PUB_KEY).catch(e => e);
    expect(err).toBeInstanceOf(CryptoError);
    expect(err.type).toBe('FORMAT');
  });
});
