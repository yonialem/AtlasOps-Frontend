import React from "react";
import { renderToString } from "react-dom/server";
import { describe, it, expect } from "vitest";
import { QueryClient, useQueryClient } from "@tanstack/react-query";
import { ApiError } from "@/api/client";
import { incidentKeys, userKeys, serviceKeys } from "@/api/keys";
import {
  createQueryClient,
  queryClient,
  QueryProvider,
} from "@/api/queryClient";
import type { GetIncidentsQuery, ParsedIncidentsQuery } from "@contracts";

// ---------------------------------------------------------------------------
// 1. Hierarchical Query Keys Factory Tests
// ---------------------------------------------------------------------------

describe("Hierarchical Query Keys Factory", () => {
  // TEST-API-011
  describe("incidentKeys", () => {
    it("TEST-API-011: generates hierarchical cache keys matching expected tuple structures", () => {
      expect(incidentKeys.all).toEqual(["incidents"]);
      expect(incidentKeys.lists()).toEqual(["incidents", "list"]);
      expect(incidentKeys.details()).toEqual(["incidents", "detail"]);
      expect(incidentKeys.detail("INC-1001")).toEqual([
        "incidents",
        "detail",
        "INC-1001",
      ]);
    });

    it("incidentKeys.list(query) embeds query filters into the key tuple", () => {
      const queryParams: Partial<GetIncidentsQuery> = {
        q: "db",
        status: "triggered",
        page: 1,
      };
      expect(incidentKeys.list(queryParams)).toEqual([
        "incidents",
        "list",
        queryParams,
      ]);
    });

    it("incidentKeys.list(query) supports ParsedIncidentsQuery objects", () => {
      const parsedQuery: ParsedIncidentsQuery = {
        q: "timeout",
        statuses: ["investigating", "triggered"],
        severities: ["critical"],
        services: ["payments-api"],
        sort: "severity",
        order: "desc",
        page: 2,
        pageSize: 50,
      };
      expect(incidentKeys.list(parsedQuery)).toEqual([
        "incidents",
        "list",
        parsedQuery,
      ]);
    });

    it("supports granular cache invalidation via hierarchical key prefixes", () => {
      const testClient = new QueryClient();

      testClient.setQueryData(incidentKeys.list({ q: "cache1" }), "list-data-1");
      testClient.setQueryData(incidentKeys.list({ q: "cache2" }), "list-data-2");
      testClient.setQueryData(incidentKeys.detail("INC-1001"), "detail-data-1");

      expect(testClient.getQueryData(incidentKeys.list({ q: "cache1" }))).toBe("list-data-1");
      expect(testClient.getQueryData(incidentKeys.list({ q: "cache2" }))).toBe("list-data-2");
      expect(testClient.getQueryData(incidentKeys.detail("INC-1001"))).toBe("detail-data-1");

      // Invalidate all incident lists only
      testClient.invalidateQueries({ queryKey: incidentKeys.lists() });

      const listQuery1State = testClient.getQueryState(incidentKeys.list({ q: "cache1" }));
      const listQuery2State = testClient.getQueryState(incidentKeys.list({ q: "cache2" }));
      const detailQueryState = testClient.getQueryState(incidentKeys.detail("INC-1001"));

      expect(listQuery1State?.isInvalidated).toBe(true);
      expect(listQuery2State?.isInvalidated).toBe(true);
      expect(detailQueryState?.isInvalidated).toBe(false);

      // Invalidate all incident keys root
      testClient.invalidateQueries({ queryKey: incidentKeys.all });
      const detailStateAfterRoot = testClient.getQueryState(incidentKeys.detail("INC-1001"));
      expect(detailStateAfterRoot?.isInvalidated).toBe(true);
    });
  });

  describe("userKeys", () => {
    it("generates user query keys matching expected tuple structures", () => {
      expect(userKeys.all).toEqual(["users"]);
      expect(userKeys.list()).toEqual(["users", "list"]);
    });
  });

  describe("serviceKeys", () => {
    it("generates service query keys matching expected tuple structures", () => {
      expect(serviceKeys.all).toEqual(["services"]);
      expect(serviceKeys.list()).toEqual(["services", "list"]);
    });
  });
});

// ---------------------------------------------------------------------------
// 2. TanStack QueryClient Configuration Tests
// ---------------------------------------------------------------------------

describe("TanStack QueryClient Configuration", () => {
  it("createQueryClient() configures queries with staleTime 30s and gcTime 5m", () => {
    const client = createQueryClient();
    const defaultOptions = client.getDefaultOptions();

    expect(defaultOptions.queries?.staleTime).toBe(30 * 1000); // 30,000ms
    expect(defaultOptions.queries?.gcTime).toBe(5 * 60 * 1000); // 300,000ms
    expect(defaultOptions.queries?.refetchOnWindowFocus).toBe(true);
  });

  it("configures mutations with zero automatic retries", () => {
    const client = createQueryClient();
    const defaultOptions = client.getDefaultOptions();

    expect(defaultOptions.mutations?.retry).toBe(0);
  });

  // TEST-API-012
  describe("TEST-API-012: QueryClient retry predicate policy", () => {
    const client = createQueryClient();
    const retryFn = client.getDefaultOptions().queries?.retry as (
      failureCount: number,
      error: unknown
    ) => boolean;

    it("does NOT retry on 400 Validation Error (status 400)", () => {
      const error400 = new ApiError({
        status: 400,
        code: "VALIDATION_ERROR",
        message: "Bad request payload",
      });

      expect(retryFn(0, error400)).toBe(false);
      expect(retryFn(1, error400)).toBe(false);
      expect(retryFn(2, error400)).toBe(false);
    });

    it("does NOT retry on 404 Not Found (status 404)", () => {
      const error404 = new ApiError({
        status: 404,
        code: "INCIDENT_NOT_FOUND",
        message: "Incident not found",
      });

      expect(retryFn(0, error404)).toBe(false);
      expect(retryFn(1, error404)).toBe(false);
    });

    it("does NOT retry on 409 Conflict (status 409)", () => {
      const error409 = new ApiError({
        status: 409,
        code: "INCIDENT_VERSION_CONFLICT",
        message: "Version mismatch",
        currentVersion: 8,
      });

      expect(retryFn(0, error409)).toBe(false);
      expect(retryFn(1, error409)).toBe(false);
    });

    it("does NOT retry on any other 4xx client errors (401, 403, 422)", () => {
      const error401 = new ApiError({ status: 401, code: "UNAUTHORIZED", message: "Unauthorized" });
      const error403 = new ApiError({ status: 403, code: "FORBIDDEN", message: "Forbidden" });
      const error422 = new ApiError({ status: 422, code: "UNPROCESSABLE", message: "Unprocessable" });

      expect(retryFn(0, error401)).toBe(false);
      expect(retryFn(0, error403)).toBe(false);
      expect(retryFn(0, error422)).toBe(false);
    });

    it("retries up to 3 times on 500 Internal Server Error", () => {
      const error500 = new ApiError({
        status: 500,
        code: "INTERNAL_SERVER_ERROR",
        message: "Internal server crash",
      });

      expect(retryFn(0, error500)).toBe(true);
      expect(retryFn(1, error500)).toBe(true);
      expect(retryFn(2, error500)).toBe(true);
      expect(retryFn(3, error500)).toBe(false);
      expect(retryFn(4, error500)).toBe(false);
    });

    it("retries up to 3 times on 502/503/504 gateway and server errors", () => {
      const error502 = new ApiError({ status: 502, code: "HTTP_ERROR", message: "Bad Gateway" });
      const error503 = new ApiError({ status: 503, code: "HTTP_ERROR", message: "Service Unavailable" });

      expect(retryFn(0, error502)).toBe(true);
      expect(retryFn(2, error502)).toBe(true);
      expect(retryFn(3, error502)).toBe(false);

      expect(retryFn(0, error503)).toBe(true);
      expect(retryFn(2, error503)).toBe(true);
      expect(retryFn(3, error503)).toBe(false);
    });

    it("retries up to 3 times on network disconnects (status 0 / NETWORK_ERROR)", () => {
      const networkError = new ApiError({
        status: 0,
        code: "NETWORK_ERROR",
        message: "Network connection failed",
      });

      expect(retryFn(0, networkError)).toBe(true);
      expect(retryFn(1, networkError)).toBe(true);
      expect(retryFn(2, networkError)).toBe(true);
      expect(retryFn(3, networkError)).toBe(false);
    });

    it("retries up to 3 times on native TypeErrors or standard Errors", () => {
      const genericError = new TypeError("Failed to fetch");

      expect(retryFn(0, genericError)).toBe(true);
      expect(retryFn(2, genericError)).toBe(true);
      expect(retryFn(3, genericError)).toBe(false);
    });
  });

  describe("QueryClient retryDelay calculation", () => {
    const client = createQueryClient();
    const retryDelayFn = client.getDefaultOptions().queries?.retryDelay as (
      attemptIndex: number
    ) => number;

    it("calculates exponential backoff capped at 10 seconds", () => {
      expect(retryDelayFn(0)).toBe(1000);  // 1000 * 2^0 = 1000ms
      expect(retryDelayFn(1)).toBe(2000);  // 1000 * 2^1 = 2000ms
      expect(retryDelayFn(2)).toBe(4000);  // 1000 * 2^2 = 4000ms
      expect(retryDelayFn(3)).toBe(8000);  // 1000 * 2^3 = 8000ms
      expect(retryDelayFn(4)).toBe(10000); // capped at 10,000ms
      expect(retryDelayFn(10)).toBe(10000); // capped at 10,000ms
    });
  });

  describe("Singleton queryClient export", () => {
    it("is an instance of QueryClient with configured default options", () => {
      expect(queryClient).toBeInstanceOf(QueryClient);
      const defaults = queryClient.getDefaultOptions();
      expect(defaults.queries?.staleTime).toBe(30000);
      expect(defaults.queries?.gcTime).toBe(300000);
      expect(defaults.mutations?.retry).toBe(0);
    });
  });
});

// ---------------------------------------------------------------------------
// 3. QueryProvider Component Tests
// ---------------------------------------------------------------------------

describe("QueryProvider React Context Component", () => {
  // TEST-API-013
  it("TEST-API-013: renders children and provides default queryClient singleton via useQueryClient", () => {
    let capturedClient: QueryClient | null = null;

    function TestConsumer() {
      capturedClient = useQueryClient();
      return React.createElement("div", { id: "child-node" }, "Consumer rendered successfully");
    }

    const html = renderToString(
      React.createElement(QueryProvider, null, React.createElement(TestConsumer))
    );

    expect(html).toContain("Consumer rendered successfully");
    expect(capturedClient).toBe(queryClient);
  });

  it("supports passing a custom QueryClient instance via client prop", () => {
    const customClient = new QueryClient();
    let capturedClient: QueryClient | null = null;

    function CustomConsumer() {
      capturedClient = useQueryClient();
      return React.createElement("span", null, "Custom child");
    }

    const html = renderToString(
      React.createElement(
        QueryProvider,
        { client: customClient },
        React.createElement(CustomConsumer)
      )
    );

    expect(html).toContain("Custom child");
    expect(capturedClient).toBe(customClient);
    expect(capturedClient).not.toBe(queryClient);
  });
});
