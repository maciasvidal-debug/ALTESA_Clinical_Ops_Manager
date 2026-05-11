/**
 * tests/__helpers__/FakeStore.ts
 *
 * A minimal, fully controlled in-memory implementation of the LocalForage
 * interface. Used in DB-001 and DB-003 tests where localforage's actual
 * implementation does not allow reliable method interception.
 *
 * Provides deterministic fault injection via `failOnNthCall()`.
 */

import type { LocalForage } from 'localforage';

type FaultErrorType = 'QuotaExceededError' | 'UnknownError' | 'AbortError';

interface FaultRule {
  operation: 'setItem' | 'clear' | 'getItem' | 'removeItem';
  triggerOnCall: number;
  errorType: FaultErrorType;
}

export class FakeStore implements LocalForage {
  private storage = new Map<string, unknown>();
  private callCounts = new Map<string, number>();
  private faultRules: FaultRule[] = [];

  // ── Fault injection ────────────────────────────────────────────────────────

  addFault(rule: FaultRule): void {
    this.faultRules.push(rule);
  }

  clearFaults(): void {
    this.faultRules = [];
    this.callCounts.clear();
  }

  private checkFault(operation: FaultRule['operation']): void {
    const count = (this.callCounts.get(operation) ?? 0) + 1;
    this.callCounts.set(operation, count);

    const rule = this.faultRules.find(
      r => r.operation === operation && r.triggerOnCall === count
    );
    if (rule) {
      throw new DOMException(`[FakeStore] Simulated ${rule.errorType}`, rule.errorType);
    }
  }

  // ── LocalForage interface ──────────────────────────────────────────────────

  async setItem<T>(key: string, value: T): Promise<T> {
    this.checkFault('setItem');
    this.storage.set(key, value);
    return value;
  }

  async getItem<T>(key: string): Promise<T | null> {
    this.checkFault('getItem');
    return (this.storage.get(key) as T) ?? null;
  }

  async removeItem(key: string): Promise<void> {
    this.checkFault('removeItem');
    this.storage.delete(key);
  }

  async clear(): Promise<void> {
    this.checkFault('clear');
    this.storage.clear();
  }

  async length(): Promise<number> {
    return this.storage.size;
  }

  async key(keyIndex: number): Promise<string | null> {
    return [...this.storage.keys()][keyIndex] ?? null;
  }

  async keys(): Promise<string[]> {
    return [...this.storage.keys()];
  }

  async iterate<T, U>(
    iteratee: (value: T, key: string, iterationNumber: number) => U
  ): Promise<U | undefined> {
    let i = 0;
    for (const [k, v] of this.storage) {
      const result = iteratee(v as T, k, ++i);
      if (result !== undefined) return result;
    }
    return undefined;
  }

  // ── Required LocalForage interface stubs ───────────────────────────────────

  INDEXEDDB  = 'asyncStorage';
  LOCALSTORAGE = 'localStorageWrapper';
  WEBSQL     = 'webSQLStorage';

  driver()                     { return 'FAKEMEMORY'; }
  supports(_driver: string)    { return true; }
  ready()                      { return Promise.resolve(); }

  async setDriver(_driver: string | string[]): Promise<void> {}
  async defineDriver(_driver: object): Promise<void> {}
  async dropInstance(_config?: object): Promise<void> { this.storage.clear(); }

  config(_options: any): any   { return this; }
  createInstance(_config?: any): LocalForage { return new FakeStore(); }
}
