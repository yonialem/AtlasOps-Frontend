/**
 * ============================================================================
 * AtlasOps Incident Management Console - Services API Endpoints
 * ============================================================================
 * File: src/api/services.ts
 * Type-safe service catalog endpoint unwrapping service list items.
 */

import { ListServicesResponse } from "../contracts/api.types.ts";
import { fetchWithTimeout } from "./client.ts";

/**
 * GET /api/services
 * Retrieves the catalog of monitored microservices and platform components.
 */
export async function listServices(signal?: AbortSignal): Promise<string[]> {
  const data = await fetchWithTimeout<ListServicesResponse | string[]>(`/services`, {
    method: "GET",
    signal,
  });

  if (Array.isArray(data)) {
    return data;
  }
  return data?.items ?? [];
}

// Alias for backwards compatibility
export const fetchServices = listServices;
