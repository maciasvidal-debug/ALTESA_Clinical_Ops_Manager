/**
 * tests/__helpers__/SyntheticPatientFactory.ts
 *
 * Generates synthetic Patient arrays for CRYPTO-008 performance tests.
 * Each patient is ~3 KB serialized (realistic for a real trial record).
 */

import type { Patient } from '@/lib/data';

function makeTask(code: string, opts = {}) {
  return {
    code,
    label: `Task ${code}`,
    icon: '📋',
    done: false,
    critical: false,
    regulatory: false,
    periodic: false,
    ...opts,
  };
}

/**
 * Generates `count` synthetic patients, each with:
 * - 10 q-tasks, 5 pr-tasks
 * - 1 KB labNote
 * Total payload ~3 KB/patient → 600 KB for N=200
 */
export function generatePatients(count: number): Patient[] {
  return Array.from({ length: count }, (_, i) => {
    const id = `SYN-${String(i).padStart(4, '0')}`;
    return {
      id,
      siteId:             `SITE-${(i % 3) + 1}`,
      name:               `Synthetic Patient ${i}`,
      lang:               i % 2 === 0 ? 'English' : 'Spanish',
      phase:              'PSB',
      phaseCode:          'psb' as const,
      phaseLabel:         'Pre-Screening Baseline',
      screeningDate:      new Date(Date.now() - i * 86_400_000),
      studyDay:           i,
      alert:              null,
      dtqPos:             false,
      randomizationDate:  null,
      rvInfectionDate:    null,
      psbStartDate:       null,
      protocolVersion:    'v1.0',
      tasks: {
        q:  Array.from({ length: 10 }, (_, j) => makeTask(`Q${j}`, { done: j % 2 === 0 })),
        pr: Array.from({ length: 5  }, (_, j) => makeTask(`PR${j}`, { critical: j === 0 })),
        l:  [],
        ad: [],
      },
      // ~1 KB note to bring each patient to ~3 KB serialized
      labNote:    `Patient ${id} enrolled. `.repeat(40).slice(0, 1024),
      documents:  [],
      queries:    [],
    } as unknown as Patient;
  });
}
