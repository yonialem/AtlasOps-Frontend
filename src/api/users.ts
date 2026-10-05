/**
 * ============================================================================
 * AtlasOps Incident Management Console - Users API Endpoints
 * ============================================================================
 * File: src/api/users.ts
 * Type-safe user directory endpoint unwrapping user list items.
 */

import { UserSummary } from "../contracts/incident.types.ts";
import { ListUsersResponse } from "../contracts/api.types.ts";
import { fetchWithTimeout } from "./client.ts";

/**
 * GET /api/users
 * Retrieves the list of available operators for assignment.
 */
export async function listUsers(signal?: AbortSignal): Promise<UserSummary[]> {
  const data = await fetchWithTimeout<ListUsersResponse | UserSummary[]>(`/users`, {
    method: "GET",
    signal,
  });

  if (Array.isArray(data)) {
    return data;
  }
  return data?.items ?? [];
}

// Alias for backwards compatibility
export const fetchUsers = listUsers;
