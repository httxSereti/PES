const rawApiUrl = import.meta.env.VITE_API_URL ?? "";

/** Root API URL (users, logs, auth, ... have no path prefix). */
export const API_URL = rawApiUrl.replace(/\/+$/, "");

/** Events v3 REST routes are mounted under `/api` by FastAPI. */
export const EVENTS_API_URL = API_URL.endsWith("/api")
    ? API_URL
    : `${API_URL}/api`;

/**
 * Fetch an Events v3 route, with a legacy fallback for deployments whose
 * reverse proxy already strips `/api`. Only a 404 triggers the fallback, so
 * a genuine "rule not found" still returns the primary response.
 */
export async function eventsFetch(path: string, init?: RequestInit): Promise<Response> {
    const suffix = path.startsWith("/") ? path : `/${path}`;
    const primary = `${EVENTS_API_URL}${suffix}`;
    const response = await fetch(primary, init);
    if (response.status !== 404) return response;
    const legacy = `${API_URL}${suffix}`;
    if (legacy === primary) return response;
    const fallback = await fetch(legacy, init);
    return fallback.status === 404 ? response : fallback;
}
