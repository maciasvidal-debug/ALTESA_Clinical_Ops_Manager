/**
 * Firebase Authentication Module — ALTESA Hybrid-Auth
 *
 * Firebase is used exclusively as an identity gatekeeper (email/password).
 * No PHI or clinical data is stored in Firebase.
 * Cryptographic keys are derived locally from the Firebase UID after auth.
 *
 * Firebase config is intentionally public (client-side SDK).
 * Security is enforced by Firebase Authentication rules, not by keeping
 * these values secret.
 */

import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';

const firebaseConfig = {
  apiKey:            "AIzaSyBGhvGKDof-5N8mZWb0yWUjty4GtYwxl3o",
  authDomain:        "altesa-clinical-ops.firebaseapp.com",
  projectId:         "altesa-clinical-ops",
  storageBucket:     "altesa-clinical-ops.firebasestorage.app",
  messagingSenderId: "235054628165",
  appId:             "1:235054628165:web:7ce00847905f69840a122c",
  measurementId:     "G-H4S73KVPWH",
};

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();

export const auth = getAuth(app);

// Analytics is browser-only — guard against SSR/Node execution.
export const getFirebaseAnalytics = async () => {
  if (typeof window === 'undefined') return null;
  const { getAnalytics } = await import('firebase/analytics');
  return getAnalytics(app);
};

export default app;
