/**
 * ============================================================================
 * AtlasOps Incident Management Console - HTTP Client & Error Normalization
 * ============================================================================
 * File: src/api/client.ts
 * Resilient HTTP client with configurable timeout, AbortSignal orchestration,
 * custom ApiError class, and automated JSON error envelope parsing.
 */

import {
  ApiErrorCode,
  ApiErrorEnvelope,
  ApiErrorEnvelopeSchema,
} from "../contracts/api.types.ts";

export interface ApiErrorParams {
  status: number;
  code: ApiErrorCode;
  message: string;
  fieldErrors?: Record<string, string[]>;
  currentVersion?: number;
  cause?: unknown;
}

/**
 * Normalized API Error representation extending standard JavaScript Error.
 * Holds HTTP status code, standardized error code identifier, field errors map,
 * and optimistic concurrency version counter.
 */
export class ApiError extends Error {
  public readonly status: number;
  public readonly code: ApiErrorCode;
  public readonly fieldErrors?: Record<string, string[]>;
  public readonly currentVersion?: number;
  public readonly cause?: unknown;

  constructor(
    paramsOrMessage: ApiErrorParams | string,
    legacyStatusOrOptions?: number | Partial<ApiErrorParams>,
    legacyCode?: ApiErrorCode,
    legacyFieldErrors?: Record<string, string[]>,
    legacyCurrentVersion?: number
  ) {
    let resolvedMessage: string;
    let status: number;
    let code: ApiErrorCode;
    let fieldErrors: Record<string, string[]> | undefined;
    let currentVersion: number | undefined;
    let cause: unknown;

    if (typeof paramsOrMessage === "object") {
      resolvedMessage = paramsOrMessage.message;
      status = paramsOrMessage.status;
      code = paramsOrMessage.code;
      fieldErrors = paramsOrMessage.fieldErrors;
      currentVersion = paramsOrMessage.currentVersion;
      cause = paramsOrMessage.cause;
    } else {
      resolvedMessage = paramsOrMessage;
      if (typeof legacyStatusOrOptions === "number") {
        status = legacyStatusOrOptions;
        code = legacyCode ?? "HTTP_ERROR";
        fieldErrors = legacyFieldErrors;
        currentVersion = legacyCurrentVersion;
      } else if (legacyStatusOrOptions && typeof legacyStatusOrOptions === "object") {
        status = legacyStatusOrOptions.status ?? 500;
        code = legacyStatusOrOptions.code ?? legacyCode ?? "HTTP_ERROR";
        fieldErrors = legacyStatusOrOptions.fieldErrors ?? legacyFieldErrors;
        currentVersion = legacyStatusOrOptions.currentVersion ?? legacyCurrentVersion;
        cause = legacyStatusOrOptions.cause;
      } else {
        status = 500;
        code = "HTTP_ERROR";
      }
    }

    super(resolvedMessage);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.fieldErrors = fieldErrors;
    this.currentVersion = currentVersion;
    if (cause !== undefined) {
      this.cause = cause;
    }

    Object.setPrototypeOf(this, ApiError.prototype);
  }

  public isNotFound(): boolean {
    return this.status === 404;
  }

  public isConflict(): boolean {
    return this.status === 409 || this.code === "INCIDENT_VERSION_CONFLICT";
  }

  public isValidationError(): boolean {
    return this.status === 400 || this.code === "VALIDATION_ERROR";
  }

  public isServerError(): boolean {
    return this.status >= 500;
  }
}

/**
 * Type guard for detecting concurrency conflicts (409 Conflict).
 */
export function isConflictError(error: unknown): boolean {
  if (error instanceof ApiError) {
    return error.isConflict();
  }
  if (error && typeof error === "object") {
    const err = error as { status?: unknown; code?: unknown };
    return err.status === 409 || err.code === "INCIDENT_VERSION_CONFLICT";
  }
  return false;
}

/**
 * Type guard for detecting network disconnections and connection failures.
 */
export function isNetworkError(error: unknown): boolean {
  if (error instanceof ApiError) {
    return error.status === 0 || error.code === "NETWORK_ERROR";
  }
  if (error instanceof TypeError) {
    const msg = error.message.toLowerCase();
    return (
      msg.includes("fetch") ||
      msg.includes("network") ||
      msg.includes("failed to fetch") ||
      msg.includes("load failed")
    );
  }
  if (error && typeof error === "object") {
    const err = error as { status?: unknown; code?: unknown; message?: unknown };
    if (
      err.status === 0 ||
      err.code === "NETWORK_ERROR" ||
      err.code === "ECONNREFUSED" ||
      err.code === "ENOTFOUND"
    ) {
      return true;
    }
    if (typeof err.message === "string") {
      const msg = err.message.toLowerCase();
      if (msg.includes("network") || msg.includes("failed to fetch") || msg.includes("load failed")) {
        return true;
      }
    }
  }
  return false;
}

let customBaseUrl: string | null = null;

export function setApiBaseUrl(url: string | null): void {
  customBaseUrl = url;
}

export function getApiBaseUrl(): string {
  if (customBaseUrl !== null) {
    return customBaseUrl.replace(/\/+$/, "");
  }
  if (
    typeof import.meta !== "undefined" &&
    import.meta.env &&
    typeof import.meta.env.VITE_API_BASE_URL === "string" &&
    import.meta.env.VITE_API_BASE_URL.length > 0
  ) {
    return import.meta.env.VITE_API_BASE_URL.replace(/\/+$/, "");
  }
  if (
    typeof import.meta !== "undefined" &&
    import.meta.env &&
    typeof import.meta.env.VITE_API_URL === "string" &&
    import.meta.env.VITE_API_URL.length > 0
  ) {
    return import.meta.env.VITE_API_URL.replace(/\/+$/, "");
  }
  return "";
}

/**
 * Resolves any endpoint string into an absolute path or prefixed `/api/...` path.
 */
export function resolveUrl(endpoint: string): string {
  const baseUrl = getApiBaseUrl();
  let cleanEndpoint = endpoint;
  if (!cleanEndpoint.startsWith("/")) {
    cleanEndpoint = `/${cleanEndpoint}`;
  }
  if (!cleanEndpoint.startsWith("/api")) {
    cleanEndpoint = `/api${cleanEndpoint}`;
  }
  return `${baseUrl}${cleanEndpoint}`;
}

export interface RequestOptions extends RequestInit {
  timeoutMs?: number; // Default: 10,000ms
}

/**
 * Dispatches fetch with automatic timeout abort, combined AbortSignal, and
 * normalized ApiError parsing.
 */
export async function fetchWithTimeout<T>(
  endpoint: string,
  options: RequestOptions = {}
): Promise<T> {
  const url = resolveUrl(endpoint);
  const timeoutMs = options.timeoutMs ?? 10_000;

  const controller = new AbortController();
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  let timedOut = false;

  if (timeoutMs > 0 && timeoutMs !== Infinity) {
    timeoutId = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, timeoutMs);
  }

  // Handle external caller signal
  if (options.signal) {
    if (options.signal.aborted) {
      if (timeoutId) clearTimeout(timeoutId);
      throw new DOMException("The user aborted a request.", "AbortError");
    }
    options.signal.addEventListener("abort", () => {
      controller.abort();
    });
  }

  // Headers setup
  const headers = new Headers(options.headers);
  if (!headers.has("Accept")) {
    headers.set("Accept", "application/json");
  }

  // Auto JSON body serialization
  let body = options.body;
  if (
    body &&
    typeof body === "object" &&
    !(body instanceof FormData) &&
    !(body instanceof Blob) &&
    !(body instanceof URLSearchParams)
  ) {
    body = JSON.stringify(body);
    if (!headers.has("Content-Type")) {
      headers.set("Content-Type", "application/json");
    }
  } else if (body && typeof body === "string" && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  let response: Response;
  try {
    response = await fetch(url, {
      ...options,
      body,
      headers,
      signal: controller.signal,
    });
  } catch (err: unknown) {
    if (timeoutId) clearTimeout(timeoutId);

    if (timedOut) {
      throw new ApiError({
        status: 408,
        code: "TIMEOUT_ERROR",
        message: `Request timed out after ${timeoutMs}ms.`,
      });
    }

    if (options.signal?.aborted) {
      if (err instanceof DOMException && err.name === "AbortError") {
        throw err;
      }
      throw new DOMException("The user aborted a request.", "AbortError");
    }

    if (err instanceof ApiError) {
      throw err;
    }

    // Network / connectivity crash
    throw new ApiError({
      status: 0,
      code: "NETWORK_ERROR",
      message: "Network connection unavailable or request failed.",
      cause: err,
    });
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }

  // 204 No Content
  if (response.status === 204) {
    return undefined as unknown as T;
  }

  if (response.ok) {
    const contentType = response.headers.get("content-type");
    if (contentType && contentType.includes("application/json")) {
      return (await response.json()) as T;
    }
    return (await response.text()) as unknown as T;
  }

  // Non-2xx response: attempt parsing standard ApiErrorEnvelope
  let errorPayload: Partial<ApiErrorEnvelope> | null = null;
  try {
    const contentType = response.headers.get("content-type");
    if (contentType && contentType.includes("application/json")) {
      const json = await response.json();
      const parsed = ApiErrorEnvelopeSchema.safeParse(json);
      if (parsed.success) {
        errorPayload = parsed.data;
      } else if (json && typeof json === "object") {
        errorPayload = json as Partial<ApiErrorEnvelope>;
      }
    } else {
      const text = await response.text();
      errorPayload = { message: text };
    }
  } catch {
    // Body reading or parsing failed
  }

  if (errorPayload && errorPayload.code && errorPayload.message) {
    throw new ApiError({
      status: response.status,
      code: errorPayload.code as ApiErrorCode,
      message: errorPayload.message,
      fieldErrors: errorPayload.fieldErrors,
      currentVersion: errorPayload.currentVersion,
    });
  }

  throw new ApiError({
    status: response.status,
    code: (response.status === 500 ? "INTERNAL_SERVER_ERROR" : "HTTP_ERROR") as ApiErrorCode,
    message: errorPayload?.message || response.statusText || "An unexpected network error occurred.",
    fieldErrors: errorPayload?.fieldErrors,
    currentVersion: errorPayload?.currentVersion,
  });
}
