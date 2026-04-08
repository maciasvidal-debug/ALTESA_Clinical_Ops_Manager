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

// Mocking the complex Web Crypto API for the prototype to ensure it runs smoothly in the iframe,
// but structuring it exactly as the real implementation would be.
export const generateManagerKeys = async () => {
  // In a real app: crypto.subtle.generateKey({name: "RSA-OAEP", ...})
  return {
    publicKey: "MGR-PUB-KEY-" + Math.random().toString(36).substring(2),
    privateKey: "MGR-PRIV-KEY-" + Math.random().toString(36).substring(2)
  };
};

export const generateCRCKeys = async () => {
  // In a real app: crypto.subtle.generateKey({name: "ECDSA", ...})
  return {
    publicKey: "CRC-PUB-KEY-" + Math.random().toString(36).substring(2),
    privateKey: "CRC-PRIV-KEY-" + Math.random().toString(36).substring(2)
  };
};

export const encryptAndSign = async (data: any, managerPubKey: string, crcPrivKey: string) => {
  // 1. Schema Validation & PII Filtering
  const sanitizedData = JSON.parse(JSON.stringify(data)); // Deep copy
  // (In a real app, we'd traverse and apply filterPII to all string fields)
  
  // 2. Generate AES-GCM Key & IV
  const iv = crypto.getRandomValues(new Uint8Array(12));
  
  // 3. Encrypt Data (Mocked for prototype)
  // Fix for btoa InvalidCharacterError: Encode to UTF-8 first
  const bytes = new TextEncoder().encode(JSON.stringify(sanitizedData));
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  const ciphertext = btoa(binary);
  
  // 4. Encrypt AES Key with Manager RSA PubKey (Mocked)
  const encryptedAesKey = "ENC-AES-KEY-WITH-" + managerPubKey;
  
  // 5. Sign with CRC ECDSA PrivKey (Mocked)
  const signature = "SIG-" + crcPrivKey + "-" + ciphertext.substring(0, 10);
  
  return {
    iv: Array.from(iv).map(b => b.toString(16).padStart(2, '0')).join(''),
    encryptedKey: encryptedAesKey,
    ciphertext,
    signature,
    timestamp: new Date().toISOString()
  };
};

export class CryptoError extends Error {
  constructor(public type: 'SIGNATURE' | 'DECRYPTION' | 'SCHEMA' | 'FORMAT', message: string) {
    super(message);
    this.name = 'CryptoError';
  }
}

export const verifyAndDecrypt = async (pkg: any, managerPrivKey: string, crcPubKey: string) => {
  // 0. Format Validation
  if (!pkg || typeof pkg !== 'object' || !pkg.signature || !pkg.ciphertext) {
    throw new CryptoError('FORMAT', "Invalid package format: Missing required cryptographic fields.");
  }

  // 1. Verify Signature
  const expectedSigStart = "SIG-"; // Mock check
  if (!pkg.signature.startsWith(expectedSigStart)) {
    throw new CryptoError('SIGNATURE', "Invalid Signature: Possible Man-in-the-Middle attack or Data Poisoning.");
  }
  
  // 2. Decrypt AES Key
  // 3. Decrypt Data
  let data;
  try {
    // Fix for atob InvalidCharacterError: Decode from UTF-8
    const binary = atob(pkg.ciphertext);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    const decryptedStr = new TextDecoder().decode(bytes);
    data = JSON.parse(decryptedStr);
  } catch (e) {
    throw new CryptoError('DECRYPTION', "Decryption failed: The payload is corrupted or tampered with.");
  }
  
  // 4. Schema Validation
  if (!Array.isArray(data)) {
    throw new CryptoError('SCHEMA', "Schema mismatch: Expected an array of records.");
  }
  
  return data;
};
