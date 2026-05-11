/**
 * tests/unit/auth-001.test.ts
 *
 * AUTH-001: Firebase session management contracts.
 *
 * Tests the two pure functions extracted from page.tsx's auth handling:
 *   A. classifyFirebaseError — safe user-facing message mapping
 *   B. shouldClearOnRevocation — session-state logic for token expiry
 *
 * Design invariants:
 *   - No raw Firebase error codes ever reach the user (SbD)
 *   - Active dashboard sessions are NOT interrupted by revocation
 *   - The auth screen IS cleared on revocation (online-first for activation)
 */

import { describe, it, expect } from 'vitest';
import { classifyFirebaseError, shouldClearOnRevocation } from '@/lib/auth-utils';

// ── A: classifyFirebaseError ──────────────────────────────────────────────────

describe('AUTH-001.A — classifyFirebaseError: safe error message mapping', () => {

  it.each([
    // Credential errors → same safe message (no hint about which is wrong)
    ['auth/invalid-credential',  'Invalid email or password.'],
    ['auth/wrong-password',      'Invalid email or password.'],
    ['auth/user-not-found',      'Invalid email or password.'],
    ['auth/invalid-credential+extra', 'Invalid email or password.'],  // prefix match
    // Network errors
    ['auth/network-request-failed', 'No internet connection. Firebase login requires network.'],
    ['auth/unavailable',            'No internet connection. Firebase login requires network.'],
    // Rate limiting
    ['auth/too-many-requests', 'Too many attempts. Try again later.'],
    // Unknown / future codes → safe generic fallback
    ['auth/unknown-future-error', 'Authentication failed. Check credentials.'],
    ['',                          'Authentication failed. Check credentials.'],
  ])('code "%s" → "%s"', (code, expected) => {
    expect(classifyFirebaseError(code)).toBe(expected);
  });

  it('never exposes the raw Firebase error code in the returned message', () => {
    const codes = [
      'auth/invalid-credential',
      'auth/network-request-failed',
      'auth/too-many-requests',
      'auth/internal-error',
    ];
    for (const code of codes) {
      const msg = classifyFirebaseError(code);
      // Must not leak the internal code identifier
      expect(msg).not.toContain(code);
      expect(msg).not.toContain('auth/');
    }
  });

  it('returns a non-empty string for every input', () => {
    ['', 'auth/foo', 'completely-invalid', '   '].forEach(code => {
      expect(classifyFirebaseError(code).trim().length).toBeGreaterThan(0);
    });
  });
});

// ── B: shouldClearOnRevocation ────────────────────────────────────────────────

describe('AUTH-001.B — shouldClearOnRevocation: session management rules', () => {

  // ── Positive cases: session SHOULD be cleared ─────────────────────────────
  it.each([
    ['auth screen + user null + studyInit true',  null,   true,  'auth',      true],
  ] as const)('%s → %s', (_label, user, isStudyInit, screen, expected) => {
    expect(shouldClearOnRevocation(user, isStudyInit, screen)).toBe(expected);
  });

  // ── Negative cases: session must NOT be cleared ────────────────────────────
  it.each([
    ['dashboard screen — active session not interrupted',
      null, true, 'dashboard', false],
    ['patient screen — coordinator not kicked out mid-visit',
      null, true, 'patient',   false],
    ['settings screen',
      null, true, 'settings',  false],
    ['manager dashboard',
      null, true, 'manager_dashboard', false],
    ['user present (normal session)',
      {}, true, 'auth', false],
    ['studyInit false — nothing to clear',
      null, false, 'auth', false],
    ['all false',
      {}, false, 'dashboard', false],
  ] as const)('%s → false', (_label, user, isStudyInit, screen, expected) => {
    expect(shouldClearOnRevocation(user as any, isStudyInit, screen)).toBe(expected);
  });

  // ── Design invariant: dashboard sessions are never interrupted ─────────────
  it('INVARIANT: user=null on any non-auth screen never clears session', () => {
    const nonAuthScreens = ['dashboard', 'patient', 'settings', 'manager_dashboard'];
    for (const screen of nonAuthScreens) {
      expect(
        shouldClearOnRevocation(null, true, screen),
        `Screen "${screen}" should not trigger session clear`
      ).toBe(false);
    }
  });
});

// ── C: Race condition — cancelled flag prevents stale auth state update ───────

describe('AUTH-001.C — cancelled flag: prevents state update after unmount', () => {

  it('cancelled flag set before callback fires prevents stale state mutation', async () => {
    // Simulate the async import chain in page.tsx
    let callbackRegistered = false;
    let sessionCleared     = false;

    const simulateWatcher = async (cancelled: { value: boolean }) => {
      // Async import delay
      await new Promise(r => setTimeout(r, 5));
      if (cancelled.value) return; // ← the guard

      callbackRegistered = true;
      // Simulate onAuthStateChanged firing with null user
      const user = null;
      if (shouldClearOnRevocation(user, true, 'auth')) {
        sessionCleared = true;
      }
    };

    const cancelled = { value: false };
    const watcherPromise = simulateWatcher(cancelled);

    // Unmount before the async chain completes
    cancelled.value = true;
    await watcherPromise;

    expect(callbackRegistered).toBe(false);
    expect(sessionCleared).toBe(false);
  });

  it('without cancellation, callback fires and clears session normally', async () => {
    let sessionCleared = false;

    const simulateWatcher = async (cancelled: { value: boolean }) => {
      await new Promise(r => setTimeout(r, 5));
      if (cancelled.value) return;

      const user = null;
      if (shouldClearOnRevocation(user, true, 'auth')) {
        sessionCleared = true;
      }
    };

    await simulateWatcher({ value: false });
    expect(sessionCleared).toBe(true);
  });
});
