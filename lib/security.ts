/**
 * Serverless Challenge-Response Security Module
 * This module handles mathematical validation of activation and recovery codes
 * without a backend, using a study secret loaded from a Master Key File.
 */

const getStudySecret = (): string => {
  if (typeof window === 'undefined') return '';
  return localStorage.getItem('altesa_study_secret') || '';
};

/**
 * Initializes the study configuration from a Master Key File content.
 */
export function initializeStudyConfig(configJson: string): boolean {
  try {
    const config = JSON.parse(configJson);
    if (config.studyId && config.secret) {
      localStorage.setItem('altesa_study_id', config.studyId);
      localStorage.setItem('altesa_study_secret', config.secret);
      return true;
    }
    return false;
  } catch (e) {
    return false;
  }
}

export function isStudyInitialized(): boolean {
  if (typeof window === 'undefined') return false;
  return !!localStorage.getItem('altesa_study_secret');
}

/**
 * Generates a Hardware-bound Challenge for Site Activation.
 */
export function getHardwareFingerprint(): string {
  // In a real browser, we'd use a combination of screen, navigator, and local storage UUID
  let uuid = localStorage.getItem('altesa_device_uuid');
  if (!uuid) {
    uuid = 'DEV-' + Math.random().toString(36).substring(2, 15).toUpperCase();
    localStorage.setItem('altesa_device_uuid', uuid);
  }
  return uuid;
}

/**
 * Verifies a Site Activation Code using the Manager's Public Key logic.
 */
export async function verifyActivation(siteId: string, deviceId: string, activationCode: string): Promise<boolean> {
  const secret = getStudySecret();
  if (!secret) return false;
  
  const encoder = new TextEncoder();
  const data = encoder.encode(siteId + deviceId + secret);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const expected = hashArray.map(b => b.toString(16).padStart(2, '0')).join('').substring(0, 12).toUpperCase();
  
  return activationCode === expected;
}

/**
 * Manager-only: Generates an activation code.
 * This function should ideally only be accessible to the Manager role.
 */
export async function generateActivationCode(siteId: string, deviceId: string): Promise<string> {
  const secret = getStudySecret();
  if (!secret) return "ERROR: NO SECRET";

  const encoder = new TextEncoder();
  const data = encoder.encode(siteId + deviceId + secret);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('').substring(0, 12).toUpperCase();
}

/**
 * Generates a 6-digit response code for a challenge.
 */
export async function generateResponseCode(challenge: string): Promise<string> {
  const secret = getStudySecret();
  if (!secret) return "000000";

  const encoder = new TextEncoder();
  const data = encoder.encode(challenge + secret);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  // Convert hash to a 6-digit number
  const hashInt = hashArray.reduce((acc, val) => (acc << 8) + val, 0);
  return (Math.abs(hashInt) % 1000000).toString().padStart(6, '0');
}

/**
 * Validates if a response code matches the expected response for a given challenge.
 */
export async function validateResponse(challenge: string, response: string): Promise<boolean> {
  const expected = await generateResponseCode(challenge);
  return expected === response;
}

/**
 * Generates a random 6-digit challenge code.
 */
export function generateChallenge(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}
