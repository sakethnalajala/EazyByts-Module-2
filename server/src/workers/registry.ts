/**
 * Worker run tracking, surfaced on the Super Admin system-health panel.
 *
 * Deliberately in-process and unpersisted: it answers "is this instance's
 * scheduler alive right now?", which is exactly the question that matters when
 * a free-tier host may have slept the process.
 */

export interface WorkerRun {
  name: string;
  lastRunAt: string | null;
  lastRunStatus: string;
}

const runs = new Map<string, WorkerRun>();

const WORKER_NAMES = ['orderMatcher', 'alertEvaluator', 'snapshotJob', 'newsSync'] as const;
export type WorkerName = (typeof WORKER_NAMES)[number];

export function recordWorkerRun(name: WorkerName, status: 'ok' | 'error'): void {
  runs.set(name, {
    name,
    lastRunAt: new Date().toISOString(),
    lastRunStatus: status,
  });
}

export function getWorkerRuns(): WorkerRun[] {
  return WORKER_NAMES.map(
    (name) => runs.get(name) ?? { name, lastRunAt: null, lastRunStatus: 'never run' },
  );
}
