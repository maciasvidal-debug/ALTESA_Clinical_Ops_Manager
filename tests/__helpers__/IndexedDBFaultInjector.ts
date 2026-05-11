/**
 * tests/__helpers__/IndexedDBFaultInjector.ts
 *
 * Direct method-override based fault injector for localforage instances.
 * Uses property assignment rather than vi.spyOn to guarantee interception
 * regardless of how localforage defines its methods (own vs prototype).
 */
import type { LocalForage } from 'localforage';

export type FaultOperation = 'setItem' | 'clear' | 'getItem' | 'removeItem';
export type FaultErrorType =
  | 'QuotaExceededError'
  | 'UnknownError'
  | 'AbortError'
  | 'ConstraintError';

export interface FaultRule {
  operation: FaultOperation;
  /** 1-based: the call number on which to inject the fault. */
  triggerOnCall: number;
  errorType: FaultErrorType;
}

export class IndexedDBFaultInjector {
  private installed: Array<{ store: any; method: string; original: Function }> = [];

  install(store: LocalForage, rules: FaultRule[]): void {
    for (const rule of rules) {
      const original = (store as any)[rule.operation] as Function;
      let callCount = 0;

      // Direct property assignment — overrides the method on this specific instance
      // regardless of whether it was an own property or inherited.
      (store as any)[rule.operation] = function (...args: unknown[]) {
        callCount++;
        if (callCount === rule.triggerOnCall) {
          return Promise.reject(
            new DOMException(`[FaultInjector] Simulated ${rule.errorType}`, rule.errorType)
          );
        }
        return original.apply(this, args);
      };

      this.installed.push({ store, method: rule.operation, original });
    }
  }

  restore(): void {
    for (const { store, method, original } of this.installed) {
      (store as any)[method] = original;
    }
    this.installed = [];
  }
}
