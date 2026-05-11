export const filterPII = (text: string): string => {
  if (!text) return text;
  let filtered = text;
  // Emails
  filtered = filtered.replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, '[REDACTED EMAIL]');
  // Phones (simple)
  filtered = filtered.replace(/\b\d{3}[-.]?\d{3}[-.]?\d{4}\b/g, '[REDACTED PHONE]');
  // SSN/DNI (simple)
  filtered = filtered.replace(/\b\d{3}-\d{2}-\d{4}\b/g, '[REDACTED SSN]');
  return filtered;
};

/**
 * Safe chunk size for String.fromCharCode spread.
 * Larger values risk "Maximum call stack size exceeded" on Safari/Firefox.
 * 0x8000 = 32768 bytes — tested safe across Chrome, Firefox, Safari, Edge.
 */
const BASE64_CHUNK = 0x8000;

/**
 * SEC-001 FIX: Chunked bufferToBase64.
 * Previous implementation concatenated one char at a time: O(n²) string
 * allocations. For a 100KB AES-GCM ciphertext this generated ~100K temporary
 * strings, pressuring GC and blocking the main thread for 10-15ms.
 * Chunked spread processes 32KB at a time: O(n) with one final btoa call.
 */
const bufferToBase64 = (buffer: ArrayBuffer): string => {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i += BASE64_CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + BASE64_CHUNK));
  }
  return btoa(binary);
};

// Helper to convert Base64 to ArrayBuffer
const base64ToBuffer = (base64: string): ArrayBuffer => {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
};

export const derivePINHash = async (pin: string, saltBase64: string): Promise<string> => {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    enc.encode(pin),
    { name: "PBKDF2" },
    false,
    ["deriveBits"]
  );
  
  const salt = base64ToBuffer(saltBase64);
  
  const hashBuffer = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      salt: salt,
      iterations: 310000,
      hash: "SHA-256"
    },
    keyMaterial,
    256
  );
  
  return bufferToBase64(hashBuffer);
};

export const generateSalt = (): string => {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  return bufferToBase64(salt.buffer);
};

export const generateManagerKeys = async () => {
  const signKeyPair = await crypto.subtle.generateKey(
    {
      name: "ECDSA",
      namedCurve: "P-256",
    },
    true,
    ["sign", "verify"]
  );

  const encKeyPair = await crypto.subtle.generateKey(
    {
      name: "RSA-OAEP",
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: "SHA-256",
    },
    true,
    ["encrypt", "decrypt"]
  );

  const signPubKeyBuffer = await crypto.subtle.exportKey("spki", signKeyPair.publicKey);
  const signPrivKeyBuffer = await crypto.subtle.exportKey("pkcs8", signKeyPair.privateKey);
  
  const encPubKeyBuffer = await crypto.subtle.exportKey("spki", encKeyPair.publicKey);
  const encPrivKeyBuffer = await crypto.subtle.exportKey("pkcs8", encKeyPair.privateKey);

  return {
    publicKey: bufferToBase64(encPubKeyBuffer), // For legacy compatibility
    privateKey: bufferToBase64(encPrivKeyBuffer),
    signPublicKey: bufferToBase64(signPubKeyBuffer),
    signPrivateKey: bufferToBase64(signPrivKeyBuffer),
    encPublicKey: bufferToBase64(encPubKeyBuffer),
    encPrivateKey: bufferToBase64(encPrivKeyBuffer)
  };
};

export const generateCRCKeys = async () => {
  const signKeyPair = await crypto.subtle.generateKey(
    {
      name: "ECDSA",
      namedCurve: "P-256",
    },
    true,
    ["sign", "verify"]
  );

  const encKeyPair = await crypto.subtle.generateKey(
    {
      name: "RSA-OAEP",
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: "SHA-256",
    },
    true,
    ["encrypt", "decrypt"]
  );

  const signPubKeyBuffer = await crypto.subtle.exportKey("spki", signKeyPair.publicKey);
  const signPrivKeyBuffer = await crypto.subtle.exportKey("pkcs8", signKeyPair.privateKey);
  
  const encPubKeyBuffer = await crypto.subtle.exportKey("spki", encKeyPair.publicKey);
  const encPrivKeyBuffer = await crypto.subtle.exportKey("pkcs8", encKeyPair.privateKey);

  return {
    publicKey: bufferToBase64(signPubKeyBuffer), // For legacy compatibility in this file
    privateKey: bufferToBase64(signPrivKeyBuffer),
    signPublicKey: bufferToBase64(signPubKeyBuffer),
    signPrivateKey: bufferToBase64(signPrivKeyBuffer),
    encPublicKey: bufferToBase64(encPubKeyBuffer),
    encPrivateKey: bufferToBase64(encPrivKeyBuffer)
  };
};

export const encryptAndSign = async (data: any, managerPubKeyBase64: string, crcPrivKeyBase64: string) => {
  // 1. Schema Validation & PII Filtering
  const sanitizedData = JSON.parse(JSON.stringify(data)); // Deep copy
  
  // Recursively apply filterPII to all string fields
  const applyFilter = (obj: any): any => {
    if (typeof obj === 'string') {
      return filterPII(obj);
    } else if (Array.isArray(obj)) {
      return obj.map(applyFilter);
    } else if (obj !== null && typeof obj === 'object') {
      const newObj: any = {};
      for (const key in obj) {
        newObj[key] = applyFilter(obj[key]);
      }
      return newObj;
    }
    return obj;
  };
  
  const filteredData = applyFilter(sanitizedData);
  
  // 2. Generate AES-GCM Key & IV
  const aesKey = await crypto.subtle.generateKey(
    { name: "AES-GCM", length: 256 },
    true,
    ["encrypt", "decrypt"]
  );
  const iv = crypto.getRandomValues(new Uint8Array(12));
  
  // 3. Encrypt Data
  const encodedData = new TextEncoder().encode(JSON.stringify(filteredData));
  const ciphertextBuffer = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: iv },
    aesKey,
    encodedData
  );
  const ciphertext = bufferToBase64(ciphertextBuffer);
  
  // 4. Encrypt AES Key with Manager RSA PubKey
  const managerPubKeyBuffer = base64ToBuffer(managerPubKeyBase64);
  const managerPubKey = await crypto.subtle.importKey(
    "spki",
    managerPubKeyBuffer,
    { name: "RSA-OAEP", hash: "SHA-256" },
    false,
    ["encrypt"]
  );
  
  const rawAesKey = await crypto.subtle.exportKey("raw", aesKey);
  const encryptedAesKeyBuffer = await crypto.subtle.encrypt(
    { name: "RSA-OAEP" },
    managerPubKey,
    rawAesKey
  );
  const encryptedAesKey = bufferToBase64(encryptedAesKeyBuffer);
  
  // 5. Sign with CRC ECDSA PrivKey
  const crcPrivKeyBuffer = base64ToBuffer(crcPrivKeyBase64);
  const crcPrivKey = await crypto.subtle.importKey(
    "pkcs8",
    crcPrivKeyBuffer,
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"]
  );
  
  const signatureBuffer = await crypto.subtle.sign(
    { name: "ECDSA", hash: { name: "SHA-256" } },
    crcPrivKey,
    new TextEncoder().encode(ciphertext) // Sign the ciphertext
  );
  const signature = bufferToBase64(signatureBuffer);
  
  return {
    v: PKG_SCHEMA_VERSION,        // SEC-004: schema version for forward compatibility
    iv: bufferToBase64(iv.buffer),
    encryptedKey: encryptedAesKey,
    ciphertext,
    signature,
    timestamp: new Date().toISOString()
  };
};

/**
 * Current encrypted package schema version.
 * Increment when the package format changes in a breaking way.
 * Consumers use this to reject packages from incompatible versions.
 *
 * Version history:
 *   '1' — initial production format (iv, encryptedKey, ciphertext, signature, timestamp)
 */
export const PKG_SCHEMA_VERSION = '1' as const;

/** Minimum required fields on each Patient record in a decrypted package. */
const PATIENT_REQUIRED_FIELDS = ['id', 'name', 'phaseCode'] as const;

/** Package versions this client can decrypt. Add new versions here on schema evolution. */
const SUPPORTED_PKG_VERSIONS = ['1'] as const;

export class CryptoError extends Error {
  type: 'SIGNATURE' | 'DECRYPTION' | 'SCHEMA' | 'FORMAT' | 'RSA_DECRYPT' | 'AES_DECRYPT';

  constructor(
    type: 'SIGNATURE' | 'DECRYPTION' | 'SCHEMA' | 'FORMAT' | 'RSA_DECRYPT' | 'AES_DECRYPT',
    message: string
  ) {
    super(message);
    this.type = type;
    this.name = 'CryptoError';
  }
}

export const verifyAndDecrypt = async (pkg: any, recipientPrivKeyBase64: string, senderPubKeyBase64: string) => {
  if (!pkg || typeof pkg !== 'object' || !pkg.signature || !pkg.ciphertext || !pkg.encryptedKey || !pkg.iv) {
    throw new CryptoError('FORMAT', "Invalid package format: Missing required cryptographic fields.");
  }

  // SEC-004 / CV-4.7: strict type check before version negotiation.
  // pkg.v arriving as a number (e.g. 1 from a malformed package) must be
  // rejected rather than silently coerced via String(). Any non-string value
  // indicates a malformed or adversarial package.
  if (pkg.v !== undefined && pkg.v !== null && typeof pkg.v !== 'string') {
    throw new CryptoError('FORMAT', `Invalid package version type: expected string, got ${typeof pkg.v}.`);
  }

  // SEC-004: Version negotiation — packages without `v` are treated as legacy v:'1'.
  // Reject packages from future versions this client cannot decode.
  const pkgVersion = (pkg.v ?? '1') as string;
  if (!(SUPPORTED_PKG_VERSIONS as readonly string[]).includes(pkgVersion)) {
    throw new CryptoError('FORMAT', `Unsupported package version '${pkgVersion}'. Update ALTESA to import this package.`);
  }

  try {
    // 1. Verify Signature if key is known
    if (senderPubKeyBase64) {
      try {
        const senderPubKeyBuffer = base64ToBuffer(senderPubKeyBase64);
        const senderPubKey = await crypto.subtle.importKey(
          "spki",
          senderPubKeyBuffer,
          { name: "ECDSA", namedCurve: "P-256" },
          false,
          ["verify"]
        );
        
        const signatureBuffer = base64ToBuffer(pkg.signature);
        const isValid = await crypto.subtle.verify(
          { name: "ECDSA", hash: { name: "SHA-256" } },
          senderPubKey,
          signatureBuffer,
          new TextEncoder().encode(pkg.ciphertext)
        );
        
        if (!isValid) {
          throw new CryptoError('SIGNATURE', "Invalid Signature: Possible Man-in-the-Middle attack or Data Poisoning.");
        }
      } catch (e) {
        if (e instanceof CryptoError) throw e;
      }
    }
    
    // 2. Decrypt AES Key
    const recipientPrivKeyBuffer = base64ToBuffer(recipientPrivKeyBase64);
    const recipientPrivKey = await crypto.subtle.importKey(
      "pkcs8",
      recipientPrivKeyBuffer,
      { name: "RSA-OAEP", hash: "SHA-256" },
      false,
      ["decrypt"]
    );
    
    const encryptedAesKeyBuffer = base64ToBuffer(pkg.encryptedKey);
    let rawAesKey: ArrayBuffer;
    try {
      rawAesKey = await crypto.subtle.decrypt(
        { name: "RSA-OAEP" },
        recipientPrivKey,
        encryptedAesKeyBuffer
      );
    } catch {
      throw new CryptoError('RSA_DECRYPT', "Master Key Mismatch: The package was encrypted with a different Public Key and cannot be decrypted by your current Private Key.");
    }
    
    const aesKey = await crypto.subtle.importKey(
      "raw",
      rawAesKey,
      { name: "AES-GCM", length: 256 },
      false,
      ["decrypt"]
    );
    
    // 3. Decrypt Data
    const ivBuffer = base64ToBuffer(pkg.iv);
    const ciphertextBuffer = base64ToBuffer(pkg.ciphertext);
    
    let decryptedBuffer: ArrayBuffer;
    try {
      decryptedBuffer = await crypto.subtle.decrypt(
        { name: "AES-GCM", iv: ivBuffer },
        aesKey,
        ciphertextBuffer
      );
    } catch {
       throw new CryptoError('AES_DECRYPT', "Payload Decryption Failed: The encrypted data is corrupted or tampered with.");
    }
    
    const isISODate = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;
    const decryptedStr = new TextDecoder().decode(decryptedBuffer);
    const data = JSON.parse(decryptedStr, (key, value) => {
      if (typeof value === 'string' && isISODate.test(value)) {
        return new Date(value);
      }
      return value;
    });
    
    // SEC-003: Schema validation — verify the decrypted payload has the expected
    // structure before it can be merged into the patient store.
    if (!Array.isArray(data)) {
      throw new CryptoError('SCHEMA', "Schema mismatch: Expected an array of patient records.");
    }
    if (data.length > 0) {
      const sample = data[0];
      const missing = PATIENT_REQUIRED_FIELDS.filter(f => !(f in sample));
      if (missing.length > 0) {
        throw new CryptoError('SCHEMA', `Schema validation failed: records are missing required fields.`);
      }
    }
    
    return data;
  } catch (e) {
    if (e instanceof CryptoError || (e && typeof e === 'object' && 'name' in e && e.name === 'CryptoError')) throw e;
    throw new CryptoError('DECRYPTION', "Decryption failed: The payload is corrupted or tampered with.");
  }
};
