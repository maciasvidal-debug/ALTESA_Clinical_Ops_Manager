import localforage from 'localforage';
type LocalForage = typeof localforage;
import { Patient, ProtocolAmendment } from './data';

// Initialize instances for different data domains
export const patientsStore = localforage.createInstance({
  name: 'ALTESA_DB',
  storeName: 'patients'
});

export const protocolStore = localforage.createInstance({
  name: 'ALTESA_DB',
  storeName: 'protocols'
});

export const configStore = localforage.createInstance({
  name: 'ALTESA_DB',
  storeName: 'config'
});

export const auditStore = localforage.createInstance({
  name: 'ALTESA_DB',
  storeName: 'audit'
});

export const keysStore = localforage.createInstance({
  name: 'ALTESA_DB',
  storeName: 'keys'
});

export const logsStore = localforage.createInstance({
  name: 'ALTESA_DB',
  storeName: 'navigator_logs'
});

/** Injectable store overrides — used exclusively in tests for fault injection. */
interface InitStoresOverride {
  patientsStore?: LocalForage;
  protocolStore?: LocalForage;
}

// Initialization helpers
/**
 * DB-001 FIX: ID-based idempotency.
 * Previous: `patientsStore.length() === 0` threshold accepted a partial write
 * (5 patients written) as "already initialized", losing patients #6-8 permanently.
 *
 * Now: collects all existing IDs in one iterate pass, writes only the missing
 * ones. A partial failure followed by a second call will write the remainder
 * without duplicating existing records.
 *
 * @param _stores — optional store overrides for fault injection in tests.
 *   Production callers omit this parameter and receive module-level stores.
 */
export async function initializeDbWithDefaults(
  defaultPatients: Patient[],
  defaultProtocols: ProtocolAmendment[],
  _stores: InitStoresOverride = {}
): Promise<void> {
  const ps = _stores.patientsStore ?? patientsStore;
  const pr = _stores.protocolStore ?? protocolStore;

  // Collect existing patient IDs in a single iterate pass (O(n), no per-ID round-trip)
  const existingIds = new Set<string>();
  await ps.iterate((_v, key) => { existingIds.add(key); });

  const missingPatients = defaultPatients.filter(p => !existingIds.has(p.id));
  const protocolCount = await pr.length();

  await Promise.all([
    missingPatients.length > 0
      ? Promise.all(missingPatients.map(p => ps.setItem(p.id, p)))
      : Promise.resolve(),

    protocolCount === 0
      ? Promise.all([
          ...defaultProtocols.map(v => pr.setItem(v.id, v)),
          pr.setItem('__all_versions', defaultProtocols.map(p => p.id)),
        ])
      : Promise.resolve(),
  ]);
}

export async function getAllPatients(
  _store: LocalForage = patientsStore
): Promise<Patient[]> {
  const patients: Patient[] = [];
  await _store.iterate((value: Patient) => {
    // DB-007: defensive null filter — guards against manually-injected null
    // values (e.g. via browser DevTools) that would cause downstream crashes.
    if (value != null) patients.push(value);
  });
  return patients;
}

export async function savePatient(
  patient: Patient,
  _store: LocalForage = patientsStore
): Promise<void> {
  await _store.setItem(patient.id, patient);
}

export async function getAllProtocols(): Promise<ProtocolAmendment[]> {
  const protocols: ProtocolAmendment[] = [];
  await protocolStore.iterate((value: ProtocolAmendment, key: string) => {
    if (key !== '__all_versions') {
      protocols.push(value);
    }
  });
  return protocols;
}

export async function saveProtocol(protocol: ProtocolAmendment): Promise<void> {
  await protocolStore.setItem(protocol.id, protocol);
  // update the list of keys
  const keys = await protocolStore.getItem<string[]>('__all_versions') || [];
  if (!keys.includes(protocol.id)) {
    await protocolStore.setItem('__all_versions', [...keys, protocol.id]);
  }
}

/**
 * Atomically replaces the full protocol version list.
 * Handles deletions: versions absent from the incoming array are removed.
 * Idempotent: calling with the same array produces the same state.
 */
export async function saveAllProtocols(protocols: ProtocolAmendment[]): Promise<void> {
  const currentKeys = (await protocolStore.getItem<string[]>('__all_versions')) ?? [];
  const incomingIds  = new Set(protocols.map(p => p.id));
  const toDelete     = currentKeys.filter(k => !incomingIds.has(k));

  await Promise.all([
    protocolStore.setItem('__all_versions', protocols.map(p => p.id)),
    ...protocols.map(p  => protocolStore.setItem(p.id, p)),
    ...toDelete.map(k   => protocolStore.removeItem(k)),
  ]);
}

/**
 * DB-004 FIX: Parallel clears with idempotent result aggregation.
 * @param confirm — must be 'WIPE_CONFIRMED' to prevent accidental calls.
 * @param _stores — optional store overrides for fault injection in tests.
 */
export async function wipeAllData(
  confirm: 'WIPE_CONFIRMED',
  _stores: {
    patientsStore?: LocalForage; protocolStore?: LocalForage;
    configStore?: LocalForage;  auditStore?: LocalForage;
    keysStore?: LocalForage;    logsStore?: LocalForage;
  } = {}
): Promise<void> {
  if (confirm !== 'WIPE_CONFIRMED') {
    throw new Error('wipeAllData requires explicit confirmation string.');
  }
  await Promise.all([
    (_stores.patientsStore ?? patientsStore).clear(),
    (_stores.protocolStore ?? protocolStore).clear(),
    (_stores.configStore  ?? configStore).clear(),
    (_stores.auditStore   ?? auditStore).clear(),
    (_stores.keysStore    ?? keysStore).clear(),
    (_stores.logsStore    ?? logsStore).clear(),
  ]);
}

/**
 * SRE-001: Storage quota monitoring via the Storage API.
 * Returns used/quota in bytes and a percentage. Returns null if the API
 * is unavailable (non-HTTPS, older browsers, privacy mode).
 *
 * Usage: show in Settings to alert coordinators before quota is reached.
 */
export async function getStorageEstimate(): Promise<{
  used: number;
  quota: number;
  usedPct: number;
  usedMB: string;
  quotaMB: string;
} | null> {
  if (typeof navigator === 'undefined' || !navigator?.storage?.estimate) return null;
  try {
    const { usage = 0, quota = 0 } = await navigator.storage.estimate();
    return {
      used: usage,
      quota,
      usedPct: quota > 0 ? Math.round((usage / quota) * 100) : 0,
      usedMB: (usage / 1_048_576).toFixed(2),
      quotaMB: (quota / 1_048_576).toFixed(0),
    };
  } catch {
    return null;
  }
}
