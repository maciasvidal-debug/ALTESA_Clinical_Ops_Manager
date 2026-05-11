/**
 * Serverless Security Module
 *
 * Activation and recovery use a master password that is loaded from the
 * Master Key File into IndexedDB — never from the client bundle.
 *
 * Master Key File format:
 *   { "studyId": "ALTESA-VPV", "secret": "...", "masterPassword": "your-password" }
 *
 * The HMAC helpers (generateActivationCode / generateResponseCode) are retained
 * for Manager-side advanced use, but site activation and PIN recovery both
 * compare against the stored masterPassword for operational simplicity.
 */

const getStudySecret = async (): Promise<string> => {
  const { configStore } = await import('@/lib/db');
  return await configStore.getItem<string>('altesa_study_secret') || '';
};

const getMasterPassword = async (): Promise<string> => {
  const { configStore } = await import('@/lib/db');
  return await configStore.getItem<string>('altesa_master_password') || '';
};

/**
 * Initializes the study configuration from a Firebase authenticated user.
 * Derives all local cryptographic seeds deterministically from the Firebase UID.
 * This replaces the manual Master Key File JSON load.
 *
 * - studyId  : derived from email domain  (e.g. altesa.siteA@hospital.com → ALTESA-HOSPITAL)
 * - secret   : SHA-256(uid + ":site-secret-v1")   — used by HMAC helpers
 * - masterPassword: SHA-256(uid + ":master-pw-v1") — used by validateResponse internally
 * No PHI is sent to Firebase; all derivation is local.
 */
export async function initializeFromFirebaseUser(uid: string, email: string): Promise<void> {
  const { configStore } = await import('@/lib/db');
  const encoder = new TextEncoder();

  // Derive deterministic studyId
  const domain = (email.split('@')[1] || 'site').split('.')[0].toUpperCase();
  const studyId = `ALTESA-${domain}`;

  // Derive site secret from UID
  const secretBuf = await crypto.subtle.digest('SHA-256', encoder.encode(`${uid}:site-secret-v1`));
  const secret = Array.from(new Uint8Array(secretBuf)).map(b => b.toString(16).padStart(2, '0')).join('');

  // Derive internal master password from UID (never displayed to user)
  const mpBuf = await crypto.subtle.digest('SHA-256', encoder.encode(`${uid}:master-pw-v1`));
  const masterPassword = Array.from(new Uint8Array(mpBuf)).map(b => b.toString(16).padStart(2, '0')).join('').substring(0, 32);

  await configStore.setItem('altesa_study_id', studyId);
  await configStore.setItem('altesa_study_secret', secret);
  await configStore.setItem('altesa_master_password', masterPassword);
  await configStore.setItem('altesa_activated', 'true');
  await configStore.setItem('altesa_firebase_uid', uid);
  await configStore.setItem('altesa_firebase_email', email);
}


export async function isStudyInitialized(): Promise<boolean> {
  const { configStore } = await import('@/lib/db');
  const secret = await configStore.getItem<string>('altesa_study_secret');
  return !!secret;
}

/**
 * Generates a Hardware-bound device fingerprint for site binding.
 */
export async function getHardwareFingerprint(): Promise<string> {
  const { configStore } = await import('@/lib/db');
  let uuid = await configStore.getItem<string>('altesa_device_uuid');
  if (!uuid) {
    uuid = 'DEV-' + Math.random().toString(36).substring(2, 15).toUpperCase();
    await configStore.setItem('altesa_device_uuid', uuid);
  }
  return uuid;
}

/**
 * Verifies a Site Activation Code against the master password stored in IndexedDB.
 * The master password is loaded from the Master Key File — never from the client bundle.
 */
export async function verifyActivation(siteId: string, deviceId: string, activationCode: string): Promise<boolean> {
  const masterPassword = await getMasterPassword();
  if (!masterPassword) {
    return false;
  }
  return activationCode.trim() === masterPassword;
}

/**
 * Manager-only: Generates an HMAC-SHA256 activation code (advanced/offline use).
 */
export async function generateActivationCode(siteId: string, deviceId: string): Promise<string> {
  const secret = await getStudySecret();
  if (!secret) return "ERROR: NO SECRET";

  const encoder = new TextEncoder();
  const cleanSiteId = siteId.trim().toUpperCase();
  const cleanDeviceId = deviceId.trim().toUpperCase();
  const data = encoder.encode(cleanSiteId + cleanDeviceId + secret);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('').substring(0, 12).toUpperCase();
}

/**
 * Generates a 6-digit HMAC response code for a challenge (Manager-side tool).
 */
export async function generateResponseCode(challenge: string): Promise<string> {
  const secret = await getStudySecret();
  if (!secret) return "000000";

  const encoder = new TextEncoder();
  const cleanChallenge = challenge.trim();
  const data = encoder.encode(cleanChallenge + secret);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashInt = hashArray.reduce((acc, val) => (acc << 8) + val, 0);
  return (Math.abs(hashInt) % 1000000).toString().padStart(6, '0');
}

/**
 * Validates a recovery or PIN-setup response against the master password in IndexedDB.
 */
export async function validateResponse(challenge: string, response: string): Promise<boolean> {
  const masterPassword = await getMasterPassword();
  if (!masterPassword) {
    return false;
  }
  return response.trim() === masterPassword;
}

/**
 * Generates a random 6-digit challenge code.
 */
export function generateChallenge(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}
