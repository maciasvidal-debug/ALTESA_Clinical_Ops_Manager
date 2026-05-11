/**
 * tests/__helpers__/StoreSnapshot.ts
 *
 * Captures the full state of one or more localforage stores and diffs
 * two snapshots. Used in DB-001 and DB-003 to assert precise pre/post
 * conditions without relying on store.length() (which loses key identity).
 */

import type { LocalForage } from 'localforage';
import { expect } from 'vitest';

export interface StoreCapture {
  count: number;
  keys: string[];                       // sorted for deterministic comparison
  values: Record<string, unknown>;
}

export type MultiStoreCapture = Record<string, StoreCapture>;

export interface StoreDiff {
  added:     Array<{ store: string; key: string }>;
  removed:   Array<{ store: string; key: string }>;
  modified:  Array<{ store: string; key: string }>;
  unchanged: Array<{ store: string; key: string }>;
}

export class StoreSnapshot {
  /**
   * Captures the current state of all provided stores.
   * @param stores — map of label → LocalForage instance
   */
  static async capture(stores: Record<string, LocalForage>): Promise<MultiStoreCapture> {
    const snapshot: MultiStoreCapture = {};

    for (const [name, store] of Object.entries(stores)) {
      const keys: string[] = [];
      const values: Record<string, unknown> = {};

      await store.iterate((value, key) => {
        keys.push(key);
        values[key] = value;
      });

      keys.sort();
      snapshot[name] = { count: keys.length, keys, values };
    }

    return snapshot;
  }

  /** Diffs two snapshots, returning a breakdown of changes per store. */
  static diff(before: MultiStoreCapture, after: MultiStoreCapture): StoreDiff {
    const result: StoreDiff = { added: [], removed: [], modified: [], unchanged: [] };
    const allStores = new Set([...Object.keys(before), ...Object.keys(after)]);

    for (const store of allStores) {
      const beforeKeys = new Set(before[store]?.keys ?? []);
      const afterKeys  = new Set(after[store]?.keys  ?? []);

      for (const key of afterKeys) {
        if (!beforeKeys.has(key)) {
          result.added.push({ store, key });
        } else {
          const bVal = JSON.stringify(before[store].values[key]);
          const aVal = JSON.stringify(after[store].values[key]);
          if (bVal !== aVal) result.modified.push({ store, key });
          else               result.unchanged.push({ store, key });
        }
      }
      for (const key of beforeKeys) {
        if (!afterKeys.has(key)) result.removed.push({ store, key });
      }
    }

    return result;
  }

  /**
   * Vitest assertion helper: asserts that a diff contains exactly zero changes.
   * Used to validate idempotency: a second run must not mutate any store.
   */
  static assertNoChange(diff: StoreDiff, context = 'Expected no store changes'): void {
    const totalChanges = diff.added.length + diff.removed.length + diff.modified.length;
    expect(
      totalChanges,
      `${context} — added:${diff.added.length} removed:${diff.removed.length} modified:${diff.modified.length}`
    ).toBe(0);
  }

  /**
   * Returns all keys present in a specific store's snapshot.
   */
  static keysOf(snapshot: MultiStoreCapture, storeName: string): string[] {
    return snapshot[storeName]?.keys ?? [];
  }
}
