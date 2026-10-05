/**
 * ============================================================================
 * AtlasOps Incident Management Console - QueryClient & Provider Configuration
 * ============================================================================
 * File: src/api/queryClient.ts
 * Configures TanStack Query v5 with strict operational retry policies,
 * exponential backoff, cache windows, and the QueryProvider context component.
 */

import React, { ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ApiError } from "./client.ts";

/**
 * Instantiates a QueryClient adhering to operational resiliency policies:
 * - staleTime: 30,000ms (30s)
 * - gcTime: 300,000ms (5m)
 * - refetchOnWindowFocus: true
 * - retry: 0 for 4xx client errors; up to 3 attempts for 5xx server errors and network crashes
 * - retryDelay: exponential backoff (1s, 2s, 4s, capped at 10s)
 * - mutations.retry: 0 (immediate failure for optimistic rollbacks)
 */
export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30 * 1000,
        gcTime: 5 * 60 * 1000,
        refetchOnWindowFocus: true,
        retry: (failureCount: number, error: unknown): boolean => {
          // Do NOT retry client errors (4xx: 400, 404, 409, etc.)
          if (error instanceof ApiError && error.status >= 400 && error.status < 500) {
            return false;
          }
          if (error && typeof error === "object") {
            const status = (error as { status?: number }).status;
            if (typeof status === "number" && status >= 400 && status < 500) {
              return false;
            }
          }
          // Retry up to 3 times for 5xx server errors or transient network failures (status === 0 || >= 500)
          return failureCount < 3;
        },
        retryDelay: (attemptIndex: number): number => {
          // Exponential backoff: 1s, 2s, 4s, capped at 10s
          return Math.min(1000 * 2 ** attemptIndex, 10000);
        },
      },
      mutations: {
        // Zero automatic retries for mutations to prevent unintended duplicate side-effects
        retry: 0,
      },
    },
  });
}

export const queryClient = createQueryClient();

export interface QueryProviderProps {
  children: ReactNode;
  client?: QueryClient;
}

/**
 * Root context provider supplying the TanStack Query cache to the React tree.
 */
export function QueryProvider({
  children,
  client = queryClient,
}: QueryProviderProps) {
  return React.createElement(QueryClientProvider, { client }, children);
}
