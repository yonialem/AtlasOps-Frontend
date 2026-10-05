/**
 * ============================================================================
 * AtlasOps Incident Management Console - Incident API Endpoints
 * ============================================================================
 * File: src/api/incidents.ts
 * Type-safe incident endpoints for listing, fetching, creating, status transitions,
 * assignee reassignments, and chronological investigation notes.
 */

import {
  Incident,
  IncidentCreateInput,
  IncidentStatusUpdateInput,
  IncidentAssigneeUpdateInput,
  IncidentNoteCreateInput,
  IncidentNote,
} from "../contracts/incident.types.ts";
import {
  GetIncidentsQuery,
  ParsedIncidentsQuery,
  IncidentsListResponse,
  UpdateIncidentStatusResponse,
} from "../contracts/api.types.ts";
import { fetchWithTimeout } from "./client.ts";

/**
 * GET /api/incidents
 * Serializes query parameters into URLSearchParams (omitting empty strings).
 */
export async function listIncidents(
  query?: Partial<GetIncidentsQuery> | ParsedIncidentsQuery,
  signal?: AbortSignal
): Promise<IncidentsListResponse> {
  const searchParams = new URLSearchParams();

  if (query) {
    if ("q" in query && typeof query.q === "string" && query.q.trim().length > 0) {
      searchParams.set("q", query.q.trim());
    }

    if ("statuses" in query && Array.isArray(query.statuses) && query.statuses.length > 0) {
      searchParams.set("status", query.statuses.join(","));
    } else if ("status" in query && typeof query.status === "string" && query.status.trim().length > 0) {
      searchParams.set("status", query.status.trim());
    }

    if ("severities" in query && Array.isArray(query.severities) && query.severities.length > 0) {
      searchParams.set("severity", query.severities.join(","));
    } else if ("severity" in query && typeof query.severity === "string" && query.severity.trim().length > 0) {
      searchParams.set("severity", query.severity.trim());
    }

    if ("services" in query && Array.isArray(query.services) && query.services.length > 0) {
      searchParams.set("service", query.services.join(","));
    } else if ("service" in query && typeof query.service === "string" && query.service.trim().length > 0) {
      searchParams.set("service", query.service.trim());
    }

    if ("sort" in query && query.sort) {
      searchParams.set("sort", query.sort);
    }

    if ("order" in query && query.order) {
      searchParams.set("order", query.order);
    }

    if ("page" in query && query.page !== undefined && query.page !== null) {
      searchParams.set("page", String(query.page));
    }

    if ("pageSize" in query && query.pageSize !== undefined && query.pageSize !== null) {
      searchParams.set("pageSize", String(query.pageSize));
    }
  }

  const queryString = searchParams.toString();
  const endpoint = queryString ? `/incidents?${queryString}` : `/incidents`;

  return fetchWithTimeout<IncidentsListResponse>(endpoint, {
    method: "GET",
    signal,
  });
}

/**
 * GET /api/incidents/:id
 */
export async function getIncident(
  id: string,
  signal?: AbortSignal
): Promise<Incident> {
  return fetchWithTimeout<Incident>(`/incidents/${encodeURIComponent(id)}`, {
    method: "GET",
    signal,
  });
}

/**
 * POST /api/incidents
 */
export async function createIncident(
  input: IncidentCreateInput,
  signal?: AbortSignal
): Promise<Incident> {
  return fetchWithTimeout<Incident>(`/incidents`, {
    method: "POST",
    body: input as unknown as BodyInit,
    signal,
  });
}

/**
 * PATCH /api/incidents/:id/status
 */
export async function updateIncidentStatus(
  id: string,
  input: IncidentStatusUpdateInput,
  signal?: AbortSignal
): Promise<UpdateIncidentStatusResponse> {
  return fetchWithTimeout<UpdateIncidentStatusResponse>(
    `/incidents/${encodeURIComponent(id)}/status`,
    {
      method: "PATCH",
      body: input as unknown as BodyInit,
      signal,
    }
  );
}

/**
 * PATCH /api/incidents/:id/assignee
 */
export async function updateIncidentAssignee(
  id: string,
  input: IncidentAssigneeUpdateInput,
  signal?: AbortSignal
): Promise<Incident> {
  return fetchWithTimeout<Incident>(
    `/incidents/${encodeURIComponent(id)}/assignee`,
    {
      method: "PATCH",
      body: input as unknown as BodyInit,
      signal,
    }
  );
}

/**
 * POST /api/incidents/:id/notes
 */
export async function createIncidentNote(
  id: string,
  input: IncidentNoteCreateInput,
  signal?: AbortSignal
): Promise<IncidentNote> {
  return fetchWithTimeout<IncidentNote>(
    `/incidents/${encodeURIComponent(id)}/notes`,
    {
      method: "POST",
      body: input as unknown as BodyInit,
      signal,
    }
  );
}

// Aliases for backwards compatibility with earlier draft signatures
export const fetchIncidents = listIncidents;
export const fetchIncidentById = getIncident;
export const patchIncidentStatus = updateIncidentStatus;
export const patchIncidentAssignee = updateIncidentAssignee;
