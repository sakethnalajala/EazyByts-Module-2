import axios, { type AxiosError, type AxiosInstance, type InternalAxiosRequestConfig } from 'axios';
import { ERROR_CODES, type ApiResponse, type ErrorCode, type ApiFieldError } from '@smd/shared';
import { clientEnv } from './env';

/**
 * HTTP transport.
 *
 * The access token lives in memory only - never localStorage, where any XSS
 * could read it. The refresh token is an httpOnly cookie the browser sends
 * automatically, which JavaScript cannot touch at all.
 *
 * Losing the in-memory token on refresh is fine: the app calls /auth/refresh
 * on boot and the cookie restores the session.
 */

export class ApiClientError extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  readonly details: ApiFieldError[] | undefined;
  readonly requestId: string | undefined;

  constructor(
    status: number,
    code: ErrorCode,
    message: string,
    options: { details?: ApiFieldError[]; requestId?: string } = {},
  ) {
    super(message);
    this.name = 'ApiClientError';
    this.status = status;
    this.code = code;
    this.details = options.details;
    this.requestId = options.requestId;
  }

  /** True when re-authenticating could plausibly fix this. */
  get isAuthError(): boolean {
    return (
      this.code === ERROR_CODES.UNAUTHENTICATED ||
      this.code === ERROR_CODES.TOKEN_EXPIRED ||
      this.code === ERROR_CODES.TOKEN_REUSED
    );
  }
}

let accessToken: string | null = null;
/** Invoked when the session is definitively gone, so the app can redirect. */
let onSessionExpired: (() => void) | null = null;

export function setAccessToken(token: string | null): void {
  accessToken = token;
}

export function getAccessToken(): string | null {
  return accessToken;
}

export function setSessionExpiredHandler(handler: () => void): void {
  onSessionExpired = handler;
}

export const http: AxiosInstance = axios.create({
  baseURL: clientEnv.VITE_API_BASE_URL,
  // Sends the httpOnly refresh cookie. Safe because the proxy keeps the API
  // same-origin with the SPA.
  withCredentials: true,
  timeout: 20_000,
  headers: { 'Content-Type': 'application/json' },
});

http.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  if (accessToken) {
    config.headers.set('Authorization', `Bearer ${accessToken}`);
  }
  return config;
});

/**
 * Single-flight refresh.
 *
 * Without this, a dashboard that fires six parallel requests on load would, on
 * an expired token, trigger six simultaneous refreshes. Because refresh tokens
 * ROTATE, five of those would present an already-rotated token - which the
 * server correctly treats as theft and responds to by revoking the entire
 * family, logging the user out. So the first 401 refreshes and the rest queue.
 */
let refreshPromise: Promise<string> | null = null;

async function refreshSession(): Promise<string> {
  refreshPromise ??= (async () => {
    try {
      const response = await axios.post<ApiResponse<{ accessToken: string }>>(
        `${clientEnv.VITE_API_BASE_URL}/auth/refresh`,
        {},
        { withCredentials: true, timeout: 20_000 },
      );

      if (!response.data.success) throw new Error('Refresh rejected');

      const token = response.data.data.accessToken;
      setAccessToken(token);
      return token;
    } finally {
      refreshPromise = null;
    }
  })();

  return refreshPromise;
}

interface RetriableConfig extends InternalAxiosRequestConfig {
  _retried?: boolean;
}

http.interceptors.response.use(
  (response) => response,
  async (error: AxiosError<ApiResponse<unknown>>) => {
    const config = error.config as RetriableConfig | undefined;

    // Network-level failure: no response at all.
    if (!error.response) {
      const timedOut = error.code === 'ECONNABORTED';
      throw new ApiClientError(
        0,
        ERROR_CODES.SERVICE_UNAVAILABLE,
        timedOut
          ? 'The request timed out. The server may be waking up from idle - please try again.'
          : 'Could not reach the server. Check your connection and try again.',
      );
    }

    const { status, data, headers } = error.response;
    const requestId = (headers as Record<string, string | undefined>)['x-request-id'] ?? undefined;

    const payload = data as ApiResponse<unknown> | undefined;
    const errorBody = payload && !payload.success ? payload.error : undefined;
    const code = errorBody?.code ?? ERROR_CODES.INTERNAL_ERROR;

    const isExpired = code === ERROR_CODES.TOKEN_EXPIRED;
    const isRefreshCall = config?.url?.includes('/auth/refresh') ?? false;

    // Retry once, after refreshing, but never for the refresh call itself.
    if (status === 401 && isExpired && config && !config._retried && !isRefreshCall) {
      config._retried = true;
      try {
        const token = await refreshSession();
        config.headers.set('Authorization', `Bearer ${token}`);
        return await http.request(config);
      } catch {
        setAccessToken(null);
        onSessionExpired?.();
      }
    }

    if (status === 401 && !isRefreshCall) {
      setAccessToken(null);
      onSessionExpired?.();
    }

    throw new ApiClientError(
      status,
      code,
      errorBody?.message ?? 'Something went wrong. Please try again.',
      {
        ...(errorBody?.details ? { details: errorBody.details } : {}),
        ...((errorBody?.requestId ?? requestId)
          ? { requestId: errorBody?.requestId ?? requestId }
          : {}),
      },
    );
  },
);

/** Unwraps the success envelope, so callers work with plain data. */
async function unwrap<T>(promise: Promise<{ data: ApiResponse<T> }>): Promise<T> {
  const response = await promise;
  if (!response.data.success) {
    throw new ApiClientError(400, response.data.error.code, response.data.error.message);
  }
  return response.data.data;
}

/** Same as `unwrap`, but keeps the pagination metadata. */
export interface Paginated<T> {
  data: T;
  meta: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNext: boolean;
    hasPrev: boolean;
  };
}

async function unwrapPaginated<T>(
  promise: Promise<{ data: ApiResponse<T> }>,
): Promise<Paginated<T>> {
  const response = await promise;
  if (!response.data.success) {
    throw new ApiClientError(400, response.data.error.code, response.data.error.message);
  }
  return {
    data: response.data.data,
    meta: response.data.meta ?? {
      page: 1,
      limit: 20,
      total: 0,
      totalPages: 0,
      hasNext: false,
      hasPrev: false,
    },
  };
}

export const api = {
  get: <T>(url: string, params?: Record<string, unknown>) =>
    unwrap<T>(http.get<ApiResponse<T>>(url, { params })),

  getPaginated: <T>(url: string, params?: Record<string, unknown>) =>
    unwrapPaginated<T>(http.get<ApiResponse<T>>(url, { params })),

  post: <T>(url: string, body?: unknown, headers?: Record<string, string>) =>
    unwrap<T>(http.post<ApiResponse<T>>(url, body, headers ? { headers } : undefined)),

  patch: <T>(url: string, body?: unknown) => unwrap<T>(http.patch<ApiResponse<T>>(url, body)),

  put: <T>(url: string, body?: unknown) => unwrap<T>(http.put<ApiResponse<T>>(url, body)),

  delete: <T>(url: string) => unwrap<T>(http.delete<ApiResponse<T>>(url)),

  /** Triggers a browser download for CSV/PDF exports. */
  download: async (url: string, params: Record<string, unknown>, fallbackName: string) => {
    const response = await http.get<Blob>(url, { params, responseType: 'blob' });

    const disposition = response.headers['content-disposition'] as string | undefined;
    const match = disposition ? /filename="?([^";]+)"?/.exec(disposition) : null;

    const href = URL.createObjectURL(response.data);
    const anchor = document.createElement('a');
    anchor.href = href;
    anchor.download = match?.[1] ?? fallbackName;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    // Revoking immediately can cancel the download in some browsers.
    setTimeout(() => URL.revokeObjectURL(href), 1000);
  },
};

export { refreshSession };
