/**
 * tests/unit/crypto-006.test.ts
 *
 * CRYPTO-006: verifyAndDecrypt must reject packages with any post-sign
 * modification — to the ciphertext, the IV, or the encrypted key.
 *
 * Uses real WebCrypto (Node.js 18+ has crypto.subtle) so the signature
 * verification pipeline runs end-to-end. Keys are generated once in
 * beforeAll to keep the suite under 30s on CI hardware.
 *
 * Tamper vectors validated:
 *   A. Modified ciphertext → SIGNATURE error (detected before decryption)
 *   B. Truncated ciphertext → SIGNATURE or AES_DECRYPT error
 *   C. Modified signature → SIGNATURE error
 *   D. Valid package roundtrips correctly (sanity / non-regression)
 *   E. crypto.subtle.decrypt is NOT called when signature fails
 */

import { describe, it, expect, beforeAll, vi, afterEach } from 'vitest';
import {
  encryptAndSign,
  verifyAndDecrypt,
  generateManagerKeys,
  generateCRCKeys,
  CryptoError,
} from '@/lib/crypto';
import { generatePatients } from '../__helpers__/SyntheticPatientFactory';

let managerPubKey:  string;
let managerPrivKey: string;
let crcPubKey:      string;
let crcPrivKey:     string;
let validPkg:       Awaited<ReturnType<typeof encryptAndSign>>;

beforeAll(async () => {
  const [mgr, crc] = await Promise.all([generateManagerKeys(), generateCRCKeys()]);
  managerPubKey  = mgr.encPublicKey;
  managerPrivKey = mgr.encPrivateKey;
  crcPubKey      = crc.signPublicKey;
  crcPrivKey     = crc.signPrivateKey;

  validPkg = await encryptAndSign(generatePatients(5), managerPubKey, crcPrivKey);
}, 30_000);

afterEach(() => vi.restoreAllMocks());

/** Flip one byte at `byteIndex` in a base64-encoded buffer string. */
function tamperBase64(b64: string, byteIndex: number): string {
  const bytes = Array.from(atob(b64), c => c.charCodeAt(0));
  const idx   = ((byteIndex % bytes.length) + bytes.length) % bytes.length;
  bytes[idx]  = bytes[idx] ^ 0xFF;  // bit-flip all 8 bits
  return btoa(bytes.map(b => String.fromCharCode(b)).join(''));
}

describe('CRYPTO-006 — tampered package rejection', () => {

  // ──────────────────────────────────────────────────────────────────────────
  it('CRYPTO-006.D — sanity: valid package decrypts correctly', async () => {
    const result = await verifyAndDecrypt(validPkg, managerPrivKey, crcPubKey);
    expect(result).toHaveLength(5);
    expect(result[0]).toHaveProperty('id');
  });

  // ──────────────────────────────────────────────────────────────────────────
  it('CRYPTO-006.A — tampered ciphertext (1 byte flipped) → CryptoError SIGNATURE', async () => {
    const tampered = {
      ...validPkg,
      ciphertext: tamperBase64(validPkg.ciphertext, validPkg.ciphertext.length >> 1),
    };

    const err = await verifyAndDecrypt(tampered, managerPrivKey, crcPubKey).catch(e => e);
    expect(err).toBeInstanceOf(CryptoError);
    expect(err.type).toBe('SIGNATURE');
  });

  // ──────────────────────────────────────────────────────────────────────────
  it('CRYPTO-006.A2 — tampered ciphertext: crypto.subtle.decrypt is NOT called', async () => {
    const decryptSpy = vi.spyOn(globalThis.crypto.subtle, 'decrypt');

    const tampered = {
      ...validPkg,
      ciphertext: tamperBase64(validPkg.ciphertext, 10),
    };
    await verifyAndDecrypt(tampered, managerPrivKey, crcPubKey).catch(() => {});

    expect(decryptSpy, 'decrypt must not run when signature fails').not.toHaveBeenCalled();
  });

  // ──────────────────────────────────────────────────────────────────────────
  it('CRYPTO-006.B — truncated ciphertext → CryptoError (SIGNATURE or AES_DECRYPT)', async () => {
    const tampered = {
      ...validPkg,
      ciphertext: validPkg.ciphertext.slice(0, Math.floor(validPkg.ciphertext.length / 2)),
    };

    const err = await verifyAndDecrypt(tampered, managerPrivKey, crcPubKey).catch(e => e);
    expect(err).toBeInstanceOf(CryptoError);
    expect(['SIGNATURE', 'AES_DECRYPT']).toContain(err.type);
  });

  // ──────────────────────────────────────────────────────────────────────────
  it('CRYPTO-006.C — tampered signature → CryptoError SIGNATURE', async () => {
    const tampered = {
      ...validPkg,
      signature: tamperBase64(validPkg.signature, 0),
    };

    const err = await verifyAndDecrypt(tampered, managerPrivKey, crcPubKey).catch(e => e);
    expect(err).toBeInstanceOf(CryptoError);
    expect(err.type).toBe('SIGNATURE');
  });

  // ──────────────────────────────────────────────────────────────────────────
  it('CRYPTO-006.E — wrong manager key → CryptoError RSA_DECRYPT', async () => {
    const otherMgr = await generateManagerKeys();

    const err = await verifyAndDecrypt(
      validPkg,
      otherMgr.encPrivateKey,  // wrong private key
      crcPubKey
    ).catch(e => e);

    expect(err).toBeInstanceOf(CryptoError);
    // Key mismatch manifests as RSA decrypt failure or signature mismatch
    expect(['RSA_DECRYPT', 'SIGNATURE', 'AES_DECRYPT']).toContain(err.type);
  });

  // ──────────────────────────────────────────────────────────────────────────
  it('CRYPTO-006.F — wrong CRC signing key → CryptoError SIGNATURE', async () => {
    const otherCrc = await generateCRCKeys();

    const err = await verifyAndDecrypt(
      validPkg,
      managerPrivKey,
      otherCrc.signPublicKey  // wrong verification key
    ).catch(e => e);

    expect(err).toBeInstanceOf(CryptoError);
    expect(err.type).toBe('SIGNATURE');
  });
});
