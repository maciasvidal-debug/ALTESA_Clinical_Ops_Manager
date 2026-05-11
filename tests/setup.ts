/**
 * tests/setup.ts
 * Global test setup executed before every test file.
 * Provides an in-memory IndexedDB implementation so tests run without
 * a real browser and without persisting state to disk between runs.
 */
import 'fake-indexeddb/auto';
import localforage from 'localforage';
import { beforeAll } from 'vitest';

beforeAll(async () => {
  // Force localforage to use IndexedDB (backed by fake-indexeddb)
  // across all instances. Must run before any store interaction.
  await localforage.setDriver(localforage.INDEXEDDB);
});
