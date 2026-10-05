/**
 * ============================================================================
 * AtlasOps Incident Management Console - API Domain Barrel Export
 * ============================================================================
 * File: src/api/index.ts
 * Single source of truth exporting HTTP client utilities, ApiError,
 * typed incident/user/service endpoints, hierarchical query keys, and QueryProvider.
 */

export * from "./client.ts";
export * from "./incidents.ts";
export * from "./users.ts";
export * from "./services.ts";
export * from "./keys.ts";
export * from "./queryClient.ts";
