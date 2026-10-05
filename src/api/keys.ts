/**
 * ============================================================================
 * AtlasOps Incident Management Console - Hierarchical Query Key Factory
 * ============================================================================
 * File: src/api/keys.ts
 * Hierarchical, type-safe query key factories for granular cache invalidation
 * and cache synchronization across incidents, users, and services.
 */

import { GetIncidentsQuery, ParsedIncidentsQuery } from "../contracts/api.types.ts";

export const incidentKeys = {
  all: ["incidents"] as const,
  lists: () => [...incidentKeys.all, "list"] as const,
  list: (query?: Partial<GetIncidentsQuery> | ParsedIncidentsQuery) =>
    [...incidentKeys.lists(), query] as const,
  details: () => [...incidentKeys.all, "detail"] as const,
  detail: (id: string) => [...incidentKeys.details(), id] as const,
  // Helper aliases for interoperability
  users: () => ["users"] as const,
  services: () => ["services"] as const,
};

export const userKeys = {
  all: ["users"] as const,
  list: () => [...userKeys.all, "list"] as const,
};

export const serviceKeys = {
  all: ["services"] as const,
  list: () => [...serviceKeys.all, "list"] as const,
};
