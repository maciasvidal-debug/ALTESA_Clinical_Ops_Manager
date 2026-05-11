/**
 * tests/__helpers__/PackageForgeFactory.ts
 *
 * Generates synthetic encrypted package objects for CRYPTO-004 version
 * rejection tests. The forged packages have structurally valid fields
 * (iv, ciphertext, encryptedKey, signature all present and non-empty)
 * so that the FORMAT check passes and the VERSION check is the first
 * rejection point. No real WebCrypto operations are performed.
 */

// Minimal valid base64 values — syntactically correct, cryptographically meaningless
const S_IV          = btoa('a'.repeat(12));
const S_CIPHERTEXT  = btoa('x'.repeat(48));
const S_ENC_KEY     = btoa('k'.repeat(256));
const S_SIGNATURE   = btoa('s'.repeat(64));

function base(): Record<string, unknown> {
  return {
    iv:           S_IV,
    ciphertext:   S_CIPHERTEXT,
    encryptedKey: S_ENC_KEY,
    signature:    S_SIGNATURE,
    timestamp:    new Date().toISOString(),
  };
}

export const PackageForgeFactory = {
  /** Fully valid v:'1' package — the happy path. */
  validV1:    (): object => ({ ...base(), v: '1' }),

  /** Legacy package without v field — should be treated as v:'1'. */
  legacy:     (): object => base(),

  /** Package with a future version string — must be rejected. */
  futureV:    (v = '2'): object => ({ ...base(), v }),

  /** Package with v as a number — must be rejected (CV-4.7 strict check). */
  numericV:   (v = 1): object => ({ ...base(), v }),

  /** Package with v as empty string — must be rejected. */
  emptyV:     (): object => ({ ...base(), v: '' }),

  /** Package with v as null — null ?? '1' fallback → treated as v:'1'. */
  nullV:      (): object => ({ ...base(), v: null }),

  /** Package with v as undefined — undefined ?? '1' → treated as v:'1'. */
  undefinedV: (): object => base(),   // same as legacy (no v field)

  /** Package with v as a non-version string — must be rejected. */
  stringV:    (v: string): object => ({ ...base(), v }),

  /** Package missing a required field. */
  missingField(field: 'iv' | 'ciphertext' | 'encryptedKey' | 'signature'): object {
    const pkg = { ...base(), v: '1' } as Record<string, unknown>;
    delete pkg[field];
    return pkg;
  },
};
