export type DependencyState = 'up' | 'down' | 'disabled';

export interface DependencyStatus {
  state: DependencyState;
  /** Round-trip latency of the probe, in milliseconds. */
  latencyMs?: number;
  message?: string;
}

/** `GET /api/v1/health` - liveness. Answers "is the process running?". */
export interface HealthPayload {
  status: 'ok';
  service: string;
  version: string;
  environment: string;
  uptimeSeconds: number;
  timestamp: string;
}

/** `GET /api/v1/ready` - readiness. Answers "can it serve traffic?". */
export interface ReadyPayload {
  status: 'ready' | 'degraded';
  timestamp: string;
  dependencies: {
    mongo: DependencyStatus;
    redis: DependencyStatus;
  };
}
