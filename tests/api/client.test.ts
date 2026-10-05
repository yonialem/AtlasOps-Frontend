import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { ApiError, fetchWithTimeout } from "@/api/client";
import {
  listIncidents,
  getIncident,
  createIncident,
  updateIncidentStatus,
  updateIncidentAssignee,
  createIncidentNote,
} from "@/api/incidents";
import { listUsers } from "@/api/users";
import { listServices } from "@/api/services";
import type {
  Incident,
  IncidentCreateInput,
  IncidentStatusUpdateInput,
  IncidentAssigneeUpdateInput,
  IncidentNoteCreateInput,
  IncidentNote,
  UserSummary,
  IncidentsListResponse,
  UpdateIncidentStatusResponse,
  ApiErrorEnvelope,
  GetIncidentsQuery,
} from "@contracts";

// ---------------------------------------------------------------------------
// Test Fixtures (Strict adherence to contracts/api.types.ts & incident.types.ts)
// ---------------------------------------------------------------------------

const mockUser: UserSummary = {
  id: "usr-12",
  name: "Maya Chen",
  email: "maya@example.com",
  avatarUrl: "https://example.com/avatar12.png",
};

const mockOperator: UserSummary = {
  id: "usr-4",
  name: "Daniel Brooks",
  email: "daniel@example.com",
};

const mockNote: IncidentNote = {
  id: "note-91",
  incidentId: "INC-1001",
  author: mockOperator,
  message: "The issue appears isolated to the EU payment provider.",
  createdAt: "2026-08-01T09:02:00.000Z",
};

const mockIncident: Incident = {
  id: "INC-1001",
  title: "Elevated database connection pool latency",
  description: "The primary database pool latency exceeded 500ms threshold during peak load.",
  status: "investigating",
  severity: "critical",
  service: "payments-api",
  assignee: mockUser,
  createdAt: "2026-08-01T08:42:00.000Z",
  updatedAt: "2026-08-01T09:18:00.000Z",
  version: 3,
  notes: [mockNote],
};

const mockListResponse: IncidentsListResponse = {
  items: [mockIncident],
  page: 1,
  pageSize: 25,
  total: 1,
  totalPages: 1,
};

const mockStatusUpdateResponse: UpdateIncidentStatusResponse = {
  id: "INC-1001",
  status: "resolved",
  updatedAt: "2026-08-01T10:04:00.000Z",
  version: 4,
};

// ---------------------------------------------------------------------------
// Helper Functions
// ---------------------------------------------------------------------------

function createJsonResponse(data: unknown, status = 200, statusText = "OK"): Response {
  return new Response(JSON.stringify(data), {
    status,
    statusText,
    headers: { "Content-Type": "application/json" },
  });
}

function createTextResponse(text: string, status = 502, statusText = "Bad Gateway"): Response {
  return new Response(text, {
    status,
    statusText,
    headers: { "Content-Type": "text/plain" },
  });
}

function createEmptyResponse(status = 204, statusText = "No Content"): Response {
  return new Response(null, {
    status,
    statusText,
  });
}

// ---------------------------------------------------------------------------
// Test Suites
// ---------------------------------------------------------------------------

describe("ApiError class", () => {
  it("initializes with status, code, message, fieldErrors, and currentVersion", () => {
    const error = new ApiError({
      status: 400,
      code: "VALIDATION_ERROR",
      message: "Validation failed for submitted payload.",
      fieldErrors: {
        title: ["Title must contain at least 5 characters."],
        service: ["Service is required."],
      },
      currentVersion: 5,
    });

    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(ApiError);
    expect(error.name).toBe("ApiError");
    expect(error.status).toBe(400);
    expect(error.code).toBe("VALIDATION_ERROR");
    expect(error.message).toBe("Validation failed for submitted payload.");
    expect(error.fieldErrors).toEqual({
      title: ["Title must contain at least 5 characters."],
      service: ["Service is required."],
    });
    expect(error.currentVersion).toBe(5);
  });

  it("handles optional fields when omitted in constructor", () => {
    const error = new ApiError({
      status: 500,
      code: "INTERNAL_SERVER_ERROR",
      message: "Internal server error occurred.",
    });

    expect(error.status).toBe(500);
    expect(error.code).toBe("INTERNAL_SERVER_ERROR");
    expect(error.message).toBe("Internal server error occurred.");
    expect(error.fieldErrors).toBeUndefined();
    expect(error.currentVersion).toBeUndefined();
  });

  it("identifies 404 with isNotFound() helper", () => {
    const notFound = new ApiError({
      status: 404,
      code: "INCIDENT_NOT_FOUND",
      message: "Incident not found.",
    });
    const badRequest = new ApiError({
      status: 400,
      code: "VALIDATION_ERROR",
      message: "Bad request.",
    });

    expect(notFound.isNotFound()).toBe(true);
    expect(badRequest.isNotFound()).toBe(false);
  });

  it("identifies 409 with isConflict() helper", () => {
    const conflict = new ApiError({
      status: 409,
      code: "INCIDENT_VERSION_CONFLICT",
      message: "Version conflict.",
      currentVersion: 8,
    });
    const notFound = new ApiError({
      status: 404,
      code: "INCIDENT_NOT_FOUND",
      message: "Incident not found.",
    });

    expect(conflict.isConflict()).toBe(true);
    expect(notFound.isConflict()).toBe(false);
  });

  it("identifies 400 with isValidationError() helper", () => {
    const validationError = new ApiError({
      status: 400,
      code: "VALIDATION_ERROR",
      message: "Invalid input.",
    });
    const serverError = new ApiError({
      status: 500,
      code: "INTERNAL_SERVER_ERROR",
      message: "Server error.",
    });

    expect(validationError.isValidationError()).toBe(true);
    expect(serverError.isValidationError()).toBe(false);
  });

  it("identifies 5xx with isServerError() helper", () => {
    const error500 = new ApiError({
      status: 500,
      code: "INTERNAL_SERVER_ERROR",
      message: "Internal error.",
    });
    const error502 = new ApiError({
      status: 502,
      code: "HTTP_ERROR",
      message: "Bad Gateway.",
    });
    const error503 = new ApiError({
      status: 503,
      code: "HTTP_ERROR",
      message: "Service Unavailable.",
    });
    const error400 = new ApiError({
      status: 400,
      code: "VALIDATION_ERROR",
      message: "Validation error.",
    });

    expect(error500.isServerError()).toBe(true);
    expect(error502.isServerError()).toBe(true);
    expect(error503.isServerError()).toBe(true);
    expect(error400.isServerError()).toBe(false);
  });
});

describe("fetchWithTimeout core function", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it("dispatches GET request and deserializes JSON response successfully", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(createJsonResponse({ success: true, count: 42 }));

    const result = await fetchWithTimeout<{ success: boolean; count: number }>("/api/test");

    expect(vi.mocked(fetch)).toHaveBeenCalledTimes(1);
    const [calledUrl, calledInit] = vi.mocked(fetch).mock.calls[0];
    expect(calledUrl.toString()).toContain("/api/test");
    expect(calledInit?.method).toBeUndefined(); // Default GET
    expect(result).toEqual({ success: true, count: 42 });
  });

  it("returns undefined for 204 No Content response", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(createEmptyResponse(204));

    const result = await fetchWithTimeout<void>("/api/noop", { method: "DELETE" });

    expect(result).toBeUndefined();
  });

  it("allows passing custom headers without overwriting them", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(createJsonResponse({ ok: true }));

    await fetchWithTimeout("/api/custom", {
      headers: {
        "X-Custom-Header": "CustomValue",
        "Content-Type": "application/json",
      },
    });

    const [, calledInit] = vi.mocked(fetch).mock.calls[0];
    const headers = new Headers(calledInit?.headers);
    expect(headers.get("X-Custom-Header")).toBe("CustomValue");
    expect(headers.get("Content-Type")).toBe("application/json");
  });

  // TEST-API-003
  it("TEST-API-003: normalizes 400 Bad Request into ApiError with code, message, and fieldErrors", async () => {
    const errorEnvelope: ApiErrorEnvelope = {
      code: "VALIDATION_ERROR",
      message: "The submitted incident is invalid.",
      fieldErrors: {
        title: ["Title must contain at least 5 characters."],
        description: ["Description must contain at least 20 characters."],
        service: ["Service is required."],
      },
    };
    vi.mocked(fetch).mockResolvedValueOnce(createJsonResponse(errorEnvelope, 400, "Bad Request"));

    await expect(fetchWithTimeout("/api/incidents")).rejects.toSatisfy((err: unknown) => {
      expect(err).toBeInstanceOf(ApiError);
      const apiErr = err as ApiError;
      expect(apiErr.status).toBe(400);
      expect(apiErr.code).toBe("VALIDATION_ERROR");
      expect(apiErr.message).toBe("The submitted incident is invalid.");
      expect(apiErr.fieldErrors).toEqual(errorEnvelope.fieldErrors);
      expect(apiErr.isValidationError()).toBe(true);
      return true;
    });
  });

  // TEST-API-004
  it("TEST-API-004: normalizes 409 Conflict into ApiError with code and currentVersion", async () => {
    const conflictEnvelope: ApiErrorEnvelope = {
      code: "INCIDENT_VERSION_CONFLICT",
      message: "The incident was changed by another user.",
      currentVersion: 8,
    };
    vi.mocked(fetch).mockResolvedValueOnce(createJsonResponse(conflictEnvelope, 409, "Conflict"));

    await expect(fetchWithTimeout("/api/incidents/INC-1001/status")).rejects.toSatisfy(
      (err: unknown) => {
        expect(err).toBeInstanceOf(ApiError);
        const apiErr = err as ApiError;
        expect(apiErr.status).toBe(409);
        expect(apiErr.code).toBe("INCIDENT_VERSION_CONFLICT");
        expect(apiErr.message).toBe("The incident was changed by another user.");
        expect(apiErr.currentVersion).toBe(8);
        expect(apiErr.isConflict()).toBe(true);
        return true;
      }
    );
  });

  // TEST-API-005
  it("TEST-API-005: normalizes 404 Not Found into ApiError with code and message", async () => {
    const notFoundEnvelope: ApiErrorEnvelope = {
      code: "INCIDENT_NOT_FOUND",
      message: "The requested incident does not exist.",
    };
    vi.mocked(fetch).mockResolvedValueOnce(createJsonResponse(notFoundEnvelope, 404, "Not Found"));

    await expect(fetchWithTimeout("/api/incidents/INC-9999")).rejects.toSatisfy((err: unknown) => {
      expect(err).toBeInstanceOf(ApiError);
      const apiErr = err as ApiError;
      expect(apiErr.status).toBe(404);
      expect(apiErr.code).toBe("INCIDENT_NOT_FOUND");
      expect(apiErr.message).toBe("The requested incident does not exist.");
      expect(apiErr.isNotFound()).toBe(true);
      return true;
    });
  });

  // TEST-API-006
  it("TEST-API-006: normalizes 500 Internal Server Error into ApiError with code INTERNAL_SERVER_ERROR", async () => {
    const serverErrorEnvelope: ApiErrorEnvelope = {
      code: "INTERNAL_SERVER_ERROR",
      message: "An internal server error occurred.",
    };
    vi.mocked(fetch).mockResolvedValueOnce(
      createJsonResponse(serverErrorEnvelope, 500, "Internal Server Error")
    );

    await expect(fetchWithTimeout("/api/incidents")).rejects.toSatisfy((err: unknown) => {
      expect(err).toBeInstanceOf(ApiError);
      const apiErr = err as ApiError;
      expect(apiErr.status).toBe(500);
      expect(apiErr.code).toBe("INTERNAL_SERVER_ERROR");
      expect(apiErr.message).toBe("An internal server error occurred.");
      expect(apiErr.isServerError()).toBe(true);
      return true;
    });
  });

  it("handles non-JSON error response body with fallback message and status", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(createTextResponse("<html>502 Bad Gateway</html>", 502, "Bad Gateway"));

    await expect(fetchWithTimeout("/api/incidents")).rejects.toSatisfy((err: unknown) => {
      expect(err).toBeInstanceOf(ApiError);
      const apiErr = err as ApiError;
      expect(apiErr.status).toBe(502);
      expect(apiErr.isServerError()).toBe(true);
      expect(apiErr.message).toBeDefined();
      return true;
    });
  });

  // TEST-API-007
  it("TEST-API-007: handles network disconnect by creating ApiError with status 0 and code NETWORK_ERROR", async () => {
    vi.mocked(fetch).mockRejectedValueOnce(new TypeError("Failed to fetch"));

    await expect(fetchWithTimeout("/api/incidents")).rejects.toSatisfy((err: unknown) => {
      expect(err).toBeInstanceOf(ApiError);
      const apiErr = err as ApiError;
      expect(apiErr.status).toBe(0);
      expect(apiErr.code).toBe("NETWORK_ERROR");
      expect(apiErr.message).toMatch(/network/i);
      return true;
    });
  });

  // TEST-API-008
  it("TEST-API-008: aborts and throws ApiError with code TIMEOUT_ERROR when request exceeds timeoutMs", async () => {
    vi.mocked(fetch).mockImplementation((_url, options?: RequestInit) => {
      return new Promise((_resolve, reject) => {
        const signal = options?.signal;
        if (signal?.aborted) {
          reject(new DOMException("The operation was aborted.", "AbortError"));
          return;
        }
        signal?.addEventListener("abort", () => {
          reject(new DOMException("The operation was aborted.", "AbortError"));
        });
      });
    });

    await expect(fetchWithTimeout("/api/slow", { timeoutMs: 35 })).rejects.toSatisfy(
      (err: unknown) => {
        expect(err).toBeInstanceOf(ApiError);
        const apiErr = err as ApiError;
        expect(apiErr.code).toBe("TIMEOUT_ERROR");
        expect(apiErr.status).toBe(408);
        expect(apiErr.message).toMatch(/timed out/i);
        return true;
      }
    );
  });

  // TEST-API-009
  it("TEST-API-009: cancels request immediately when caller external AbortSignal is triggered", async () => {
    const controller = new AbortController();
    vi.mocked(fetch).mockImplementation((_url, options?: RequestInit) => {
      return new Promise((_resolve, reject) => {
        const signal = options?.signal;
        if (signal?.aborted) {
          reject(new DOMException("The user aborted a request.", "AbortError"));
          return;
        }
        signal?.addEventListener("abort", () => {
          reject(new DOMException("The user aborted a request.", "AbortError"));
        });
      });
    });

    const requestPromise = fetchWithTimeout("/api/incidents", {
      signal: controller.signal,
    });
    controller.abort();

    await expect(requestPromise).rejects.toSatisfy((err: any) => {
      const isAbort =
        (err instanceof DOMException && err.name === "AbortError") ||
        err?.name === "AbortError" ||
        (err instanceof ApiError && (err.code === "ABORTED" || err.status === 499));
      return isAbort;
    });
  });

  it("rejects immediately if an already aborted AbortSignal is provided", async () => {
    const controller = new AbortController();
    controller.abort();

    vi.mocked(fetch).mockImplementation((_url, options?: RequestInit) => {
      if (options?.signal?.aborted) {
        return Promise.reject(new DOMException("The user aborted a request.", "AbortError"));
      }
      return Promise.resolve(createJsonResponse({ ok: true }));
    });

    await expect(
      fetchWithTimeout("/api/already-aborted", { signal: controller.signal })
    ).rejects.toSatisfy((err: any) => {
      const isAbort =
        (err instanceof DOMException && err.name === "AbortError") ||
        err?.name === "AbortError" ||
        (err instanceof ApiError && (err.code === "ABORTED" || err.status === 499));
      return isAbort;
    });
  });
});

describe("Typed Incident Endpoints", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  // TEST-API-001
  it("TEST-API-001: listIncidents() performs GET /api/incidents and returns IncidentsListResponse", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(createJsonResponse(mockListResponse));

    const response = await listIncidents();

    expect(vi.mocked(fetch)).toHaveBeenCalledTimes(1);
    const [calledUrl] = vi.mocked(fetch).mock.calls[0];
    expect(calledUrl.toString()).toMatch(/\/api\/incidents(\?.*)?$/);
    expect(response).toEqual(mockListResponse);
    expect(response.items).toHaveLength(1);
    expect(response.total).toBe(1);
    expect(response.totalPages).toBe(1);
  });

  // TEST-API-002
  it("TEST-API-002: listIncidents() formats URL query parameters and omits empty/undefined values", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(createJsonResponse(mockListResponse));

    const query: Partial<GetIncidentsQuery> = {
      q: "pay",
      status: "triggered,investigating",
      severity: "critical,high",
      service: "payments-api",
      sort: "severity",
      order: "asc",
      page: 2,
      pageSize: 50,
    };

    await listIncidents(query);

    const [calledUrl] = vi.mocked(fetch).mock.calls[0];
    const url = new URL(calledUrl.toString(), "http://localhost");

    expect(url.pathname).toMatch(/\/api\/incidents$/);
    expect(url.searchParams.get("q")).toBe("pay");
    expect(url.searchParams.get("status")).toBe("triggered,investigating");
    expect(url.searchParams.get("severity")).toBe("critical,high");
    expect(url.searchParams.get("service")).toBe("payments-api");
    expect(url.searchParams.get("sort")).toBe("severity");
    expect(url.searchParams.get("order")).toBe("asc");
    expect(url.searchParams.get("page")).toBe("2");
    expect(url.searchParams.get("pageSize")).toBe("50");
  });

  it("listIncidents() omits empty string parameters from the query string", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(createJsonResponse(mockListResponse));

    await listIncidents({
      q: "",
      status: "",
      severity: "",
      service: "",
      page: 1,
    });

    const [calledUrl] = vi.mocked(fetch).mock.calls[0];
    const url = new URL(calledUrl.toString(), "http://localhost");

    expect(url.searchParams.has("q")).toBe(false);
    expect(url.searchParams.has("status")).toBe(false);
    expect(url.searchParams.has("severity")).toBe(false);
    expect(url.searchParams.has("service")).toBe(false);
    expect(url.searchParams.get("page")).toBe("1");
  });

  it("listIncidents() passes through external AbortSignal", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(createJsonResponse(mockListResponse));
    const controller = new AbortController();

    await listIncidents({}, controller.signal);

    const [, calledInit] = vi.mocked(fetch).mock.calls[0];
    expect(calledInit?.signal).toBeDefined();
  });

  it("getIncident() performs GET /api/incidents/:id and returns parsed Incident", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(createJsonResponse(mockIncident));

    const result = await getIncident("INC-1001");

    expect(vi.mocked(fetch)).toHaveBeenCalledTimes(1);
    const [calledUrl] = vi.mocked(fetch).mock.calls[0];
    expect(calledUrl.toString()).toMatch(/\/api\/incidents\/INC-1001$/);
    expect(result).toEqual(mockIncident);
  });

  it("getIncident() throws ApiError when incident is not found (404)", async () => {
    const errorEnvelope: ApiErrorEnvelope = {
      code: "INCIDENT_NOT_FOUND",
      message: "The requested incident does not exist.",
    };
    vi.mocked(fetch).mockResolvedValueOnce(createJsonResponse(errorEnvelope, 404, "Not Found"));

    await expect(getIncident("INC-9999")).rejects.toSatisfy((err: unknown) => {
      expect(err).toBeInstanceOf(ApiError);
      const apiErr = err as ApiError;
      expect(apiErr.status).toBe(404);
      expect(apiErr.code).toBe("INCIDENT_NOT_FOUND");
      return true;
    });
  });

  it("createIncident() performs POST /api/incidents with JSON payload", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(createJsonResponse(mockIncident, 201, "Created"));

    const input: IncidentCreateInput = {
      title: "Checkout latency increased",
      description: "The 95th percentile latency has exceeded the alert threshold.",
      status: "triggered",
      severity: "high",
      service: "checkout-web",
      assigneeId: "usr-18",
    };

    const result = await createIncident(input);

    expect(vi.mocked(fetch)).toHaveBeenCalledTimes(1);
    const [calledUrl, calledInit] = vi.mocked(fetch).mock.calls[0];
    expect(calledUrl.toString()).toMatch(/\/api\/incidents$/);
    expect(calledInit?.method).toBe("POST");

    const headers = new Headers(calledInit?.headers);
    expect(headers.get("Content-Type")).toBe("application/json");
    expect(JSON.parse(calledInit?.body as string)).toEqual(input);
    expect(result).toEqual(mockIncident);
  });

  // TEST-API-010
  it("TEST-API-010: updateIncidentStatus() performs PATCH /api/incidents/:id/status with exact JSON body", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(createJsonResponse(mockStatusUpdateResponse));

    const input: IncidentStatusUpdateInput = {
      status: "investigating",
      version: 1,
    };

    const result = await updateIncidentStatus("INC-1001", input);

    expect(vi.mocked(fetch)).toHaveBeenCalledTimes(1);
    const [calledUrl, calledInit] = vi.mocked(fetch).mock.calls[0];
    expect(calledUrl.toString()).toMatch(/\/api\/incidents\/INC-1001\/status$/);
    expect(calledInit?.method).toBe("PATCH");

    const headers = new Headers(calledInit?.headers);
    expect(headers.get("Content-Type")).toBe("application/json");
    expect(JSON.parse(calledInit?.body as string)).toEqual({
      status: "investigating",
      version: 1,
    });
    expect(result).toEqual(mockStatusUpdateResponse);
  });

  it("updateIncidentStatus() handles 409 version conflict gracefully", async () => {
    const conflictEnvelope: ApiErrorEnvelope = {
      code: "INCIDENT_VERSION_CONFLICT",
      message: "The incident was changed by another user.",
      currentVersion: 8,
    };
    vi.mocked(fetch).mockResolvedValueOnce(createJsonResponse(conflictEnvelope, 409, "Conflict"));

    await expect(
      updateIncidentStatus("INC-1001", { status: "resolved", version: 1 })
    ).rejects.toSatisfy((err: unknown) => {
      expect(err).toBeInstanceOf(ApiError);
      const apiErr = err as ApiError;
      expect(apiErr.status).toBe(409);
      expect(apiErr.code).toBe("INCIDENT_VERSION_CONFLICT");
      expect(apiErr.currentVersion).toBe(8);
      return true;
    });
  });

  it("updateIncidentAssignee() performs PATCH /api/incidents/:id/assignee with user ID or null", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(createJsonResponse(mockIncident));

    const assignInput: IncidentAssigneeUpdateInput = {
      assigneeId: "usr-12",
    };

    const result = await updateIncidentAssignee("INC-1001", assignInput);

    expect(vi.mocked(fetch)).toHaveBeenCalledTimes(1);
    const [calledUrl, calledInit] = vi.mocked(fetch).mock.calls[0];
    expect(calledUrl.toString()).toMatch(/\/api\/incidents\/INC-1001\/assignee$/);
    expect(calledInit?.method).toBe("PATCH");

    const headers = new Headers(calledInit?.headers);
    expect(headers.get("Content-Type")).toBe("application/json");
    expect(JSON.parse(calledInit?.body as string)).toEqual({ assigneeId: "usr-12" });
    expect(result).toEqual(mockIncident);
  });

  it("updateIncidentAssignee() supports unassigning owner with assigneeId: null", async () => {
    const unassignedIncident: Incident = { ...mockIncident, assignee: null };
    vi.mocked(fetch).mockResolvedValueOnce(createJsonResponse(unassignedIncident));

    const result = await updateIncidentAssignee("INC-1001", { assigneeId: null });

    const [, calledInit] = vi.mocked(fetch).mock.calls[0];
    expect(JSON.parse(calledInit?.body as string)).toEqual({ assigneeId: null });
    expect(result.assignee).toBeNull();
  });

  it("createIncidentNote() performs POST /api/incidents/:id/notes with message payload", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(createJsonResponse(mockNote, 201, "Created"));

    const noteInput: IncidentNoteCreateInput = {
      message: "The issue appears isolated to the EU payment provider.",
    };

    const result = await createIncidentNote("INC-1001", noteInput);

    expect(vi.mocked(fetch)).toHaveBeenCalledTimes(1);
    const [calledUrl, calledInit] = vi.mocked(fetch).mock.calls[0];
    expect(calledUrl.toString()).toMatch(/\/api\/incidents\/INC-1001\/notes$/);
    expect(calledInit?.method).toBe("POST");

    const headers = new Headers(calledInit?.headers);
    expect(headers.get("Content-Type")).toBe("application/json");
    expect(JSON.parse(calledInit?.body as string)).toEqual(noteInput);
    expect(result).toEqual(mockNote);
  });
});

describe("Users and Services Endpoints", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it("listUsers() performs GET /api/users and unwraps items into UserSummary array", async () => {
    const mockUsersList = [mockUser, mockOperator];
    vi.mocked(fetch).mockResolvedValueOnce(createJsonResponse({ items: mockUsersList }));

    const users = await listUsers();

    expect(vi.mocked(fetch)).toHaveBeenCalledTimes(1);
    const [calledUrl] = vi.mocked(fetch).mock.calls[0];
    expect(calledUrl.toString()).toMatch(/\/api\/users$/);
    expect(users).toEqual(mockUsersList);
    expect(users).toHaveLength(2);
    expect(users[0].id).toBe("usr-12");
  });

  it("listUsers() supports passing external AbortSignal", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(createJsonResponse({ items: [mockUser] }));
    const controller = new AbortController();

    await listUsers(controller.signal);

    const [, calledInit] = vi.mocked(fetch).mock.calls[0];
    expect(calledInit?.signal).toBeDefined();
  });

  it("listServices() performs GET /api/services and unwraps items into string array", async () => {
    const mockServicesList = [
      "payments-api",
      "checkout-web",
      "auth-gateway",
      "identity-service",
    ];
    vi.mocked(fetch).mockResolvedValueOnce(createJsonResponse({ items: mockServicesList }));

    const services = await listServices();

    expect(vi.mocked(fetch)).toHaveBeenCalledTimes(1);
    const [calledUrl] = vi.mocked(fetch).mock.calls[0];
    expect(calledUrl.toString()).toMatch(/\/api\/services$/);
    expect(services).toEqual(mockServicesList);
    expect(services).toHaveLength(4);
    expect(services).toContain("payments-api");
  });

  it("listServices() supports passing external AbortSignal", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(createJsonResponse({ items: ["payments-api"] }));
    const controller = new AbortController();

    await listServices(controller.signal);

    const [, calledInit] = vi.mocked(fetch).mock.calls[0];
    expect(calledInit?.signal).toBeDefined();
  });
});
