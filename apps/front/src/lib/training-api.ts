import type {
    TrainingIndexResponse,
    TrainingLiveSnapshot,
    TrainingSessionDetail,
    TrainingSessionFields,
    EdgeDifficulty,
    EdgeOutcome,
} from '@/types';
import type { EdgingEdge, EdgingSession } from '@/types';

const API_URL = import.meta.env.VITE_API_URL;

function authHeaders(token: string): HeadersInit {
    return { accept: 'application/json', Authorization: `Bearer ${token}` };
}

async function parse<T>(res: Response): Promise<T> {
    if (!res.ok) {
        const body = await res.text();
        let message = `Request failed (${res.status})`;
        try {
            const json = JSON.parse(body) as { detail?: string };
            if (json.detail) message = json.detail;
        } catch {
            /* keep the generic message */
        }
        throw new Error(message);
    }
    return (await res.json()) as T;
}

export async function fetchTrainingIndex(token: string): Promise<TrainingIndexResponse> {
    return parse(await fetch(`${API_URL}/api/training`, { headers: authHeaders(token) }));
}

export async function fetchTrainingSessions(token: string): Promise<EdgingSession[]> {
    return parse(await fetch(`${API_URL}/api/training/edging/sessions`, { headers: authHeaders(token) }));
}

export async function fetchTrainingSession(token: string, sessionId: string): Promise<TrainingSessionDetail> {
    return parse(await fetch(`${API_URL}/api/training/edging/sessions/${sessionId}`, { headers: authHeaders(token) }));
}

export async function fetchTrainingLive(token: string): Promise<TrainingLiveSnapshot> {
    return parse(await fetch(`${API_URL}/api/training/edging/live`, { headers: authHeaders(token) }));
}

export async function createTrainingSession(
    token: string,
    fields: TrainingSessionFields,
): Promise<EdgingSession> {
    return parse(
        await fetch(`${API_URL}/api/training/edging/sessions`, {
            method: 'POST',
            headers: { ...authHeaders(token), 'content-type': 'application/json' },
            body: JSON.stringify(fields),
        }),
    );
}

export async function updateTrainingSession(
    token: string,
    sessionId: string,
    fields: Partial<TrainingSessionFields> & { notes?: string; rating?: number },
): Promise<EdgingSession> {
    return parse(
        await fetch(`${API_URL}/api/training/edging/sessions/${sessionId}`, {
            method: 'PATCH',
            headers: { ...authHeaders(token), 'content-type': 'application/json' },
            body: JSON.stringify(fields),
        }),
    );
}

export async function deleteTrainingSession(token: string, sessionId: string): Promise<void> {
    await parse(
        await fetch(`${API_URL}/api/training/edging/sessions/${sessionId}`, {
            method: 'DELETE',
            headers: authHeaders(token),
        }),
    );
}

export async function startTrainingSession(token: string, sessionId: string): Promise<EdgingSession> {
    return parse(
        await fetch(`${API_URL}/api/training/edging/sessions/${sessionId}/start`, {
            method: 'POST',
            headers: authHeaders(token),
        }),
    );
}

export async function recordTrainingEdge(
    token: string,
    sessionId: string,
    difficulty: EdgeDifficulty,
    outcome: EdgeOutcome,
): Promise<{ edge: EdgingEdge; session: EdgingSession }> {
    return parse(
        await fetch(`${API_URL}/api/training/edging/sessions/${sessionId}/edges`, {
            method: 'POST',
            headers: { ...authHeaders(token), 'content-type': 'application/json' },
            body: JSON.stringify({ difficulty, outcome }),
        }),
    );
}

export async function endTrainingSession(
    token: string,
    sessionId: string,
    status: 'succeeded' | 'cancelled',
): Promise<EdgingSession> {
    return parse(
        await fetch(`${API_URL}/api/training/edging/sessions/${sessionId}/end`, {
            method: 'POST',
            headers: { ...authHeaders(token), 'content-type': 'application/json' },
            body: JSON.stringify({ status }),
        }),
    );
}
