/**
 * lib/auth-utils.ts
 *
 * Pure functions extracted from page.tsx's Firebase authentication handling.
 * Isolating these from the React component enables deterministic unit testing
 * of AUTH-001 without mounting the component or mocking React hooks.
 */

/**
 * Maps a Firebase Auth error code to a safe, user-facing message.
 * Never exposes internal codes, stack traces, or implementation details (SbD).
 */
export function classifyFirebaseError(code: string): string {
  if (
    code.includes('invalid-credential') ||
    code.includes('wrong-password') ||
    code.includes('user-not-found')
  ) {
    return 'Invalid email or password.';
  }
  if (
    code.includes('network-request-failed') ||
    code.includes('unavailable')
  ) {
    return 'No internet connection. Firebase login requires network.';
  }
  if (code.includes('too-many-requests')) {
    return 'Too many attempts. Try again later.';
  }
  return 'Authentication failed. Check credentials.';
}

/**
 * Determines whether a Firebase auth-state change should clear the local
 * session (isStudyInit → false, isActivated → false).
 *
 * Design rule (online-first for activation only):
 *   - Revocation is only enforced when the user is ON the auth screen.
 *   - Active PIN sessions on the dashboard are NOT interrupted mid-visit.
 *   - This is an intentional trade-off between security and clinical continuity.
 */
export function shouldClearOnRevocation(
  user:        null | object,
  isStudyInit: boolean,
  screen:      string
): boolean {
  return !user && isStudyInit && screen === 'auth';
}
