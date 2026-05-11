/**
 * tests/__helpers__/TemporalHarness.ts
 *
 * Clock manipulation harness for collision-testing LogEntry ID generation.
 *
 * Wraps Vitest's fake timer API with a stricter lifecycle contract:
 * install() must be paired with restore() (enforced via installed flag).
 *
 * ConcurrencyHarness provides Promise.allSettled-based batch submission
 * so that all operations in a batch start within the same microtask tick,
 * maximising the probability of timestamp collision with the old Date.now()
 * ID generation strategy.
 */

import { vi } from 'vitest';

export const COLLISION_TIMESTAMP = 1_746_789_000_000; // 2025-05-09T10:30:00Z

export class TemporalHarness {
  private installed = false;

  /**
   * Pins the system clock to fixedTime.
   * All Date.now() calls return fixedTime until restore() is called.
   */
  install(fixedTime: number = COLLISION_TIMESTAMP): void {
    if (this.installed) {
      throw new Error('TemporalHarness: already installed. Call restore() first.');
    }
    vi.useFakeTimers();
    vi.setSystemTime(new Date(fixedTime));
    this.installed = true;
  }

  /** Advance the pinned clock by ms milliseconds. */
  advance(ms: number): void {
    if (!this.installed) throw new Error('TemporalHarness: not installed.');
    vi.advanceTimersByTime(ms);
  }

  /** Restores real timers. Must be called in afterEach. */
  restore(): void {
    vi.useRealTimers();
    vi.restoreAllMocks();
    this.installed = false;
  }
}

/**
 * Submits a batch of async operations concurrently within the same microtask
 * tick. Using Promise.allSettled ensures all operations START before any
 * resolves, maximising temporal overlap.
 */
export async function submitConcurrent<T>(
  operations: Array<() => Promise<T>>
): Promise<PromiseSettledResult<T>[]> {
  return Promise.allSettled(operations.map(op => op()));
}
