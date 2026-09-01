import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@pes/ui/components/card";
import { Plus } from "lucide-react";

import { useAppSelector } from "@/store/hooks";
import { hasPermission } from "@/lib/permissions";
import { fetchTrainingSessions } from "@/lib/training-api";
import { formatDuration } from "@/lib/training";
import { formatDateTime } from "@/lib/format-date";
import { TrainingStatusBadge } from "@/components/common/training/training-status-badge";
import { TrainingTimer } from "@/components/common/training/training-timer";
import { Star } from "lucide-react";
import type { EdgingSession } from "@/types";
import { Permission } from "@/types";

export function meta() {
    return [{ title: "PES | Training - Edging Sessions" }];
}

export default function EdgingSessionsPage() {
    const token = useAppSelector((state) => state.auth.token);
    const user = useAppSelector((state) => state.auth.user);
    const events = useAppSelector((state) => state.training.events);

    const [sessions, setSessions] = useState<EdgingSession[] | null>(null);
    const [error, setError] = useState<string | null>(null);

    const load = useCallback(async () => {
        if (!token) return;
        try {
            setSessions(await fetchTrainingSessions(token));
            setError(null);
        } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to load sessions");
        }
    }, [token]);

    useEffect(() => {
        void load();
    }, [load]);

    // Refetch whenever a session changed server-side (WS)
    const latestEvent = Math.max(0, ...Object.values(events));
    useEffect(() => {
        if (latestEvent) void load();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [latestEvent]);

    return (
        <div className="px-4 md:px-5 space-y-4">
            {error && <p className="text-sm text-destructive">{error}</p>}

            <Card>
                <CardHeader className="flex-row items-center justify-between space-y-0">
                    <div className="flex flex-col gap-1.5">
                        <CardTitle>Edging sessions</CardTitle>
                        <CardDescription>
                            Configured, running and past edging training sessions
                        </CardDescription>
                    </div>
                    {hasPermission(user, Permission.TRAINING_EDGING_MANAGE) && (
                        <Link
                            to="/app/training/edging/new"
                            className="flex items-center gap-1.5 rounded-md bg-violet-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-violet-500"
                        >
                            <Plus size={13} />
                            New session
                        </Link>
                    )}
                </CardHeader>
                <CardContent>
                    {sessions === null ? (
                        <p className="py-4 text-center text-xs text-muted-foreground">Loading…</p>
                    ) : sessions.length === 0 ? (
                        <p className="py-6 text-center text-xs text-muted-foreground">
                            No sessions yet.
                        </p>
                    ) : (
                        <ul className="flex flex-col divide-y divide-border/60">
                            {sessions.map((session) => (
                                <li key={session.id}>
                                    <Link
                                        to={`/app/training/edging/${session.id}`}
                                        className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-md px-2 py-3 -mx-2 transition-colors hover:bg-accent/40 sm:grid-cols-[minmax(0,1fr)_auto_auto_auto_auto]"
                                    >
                                        <div className="flex min-w-0 items-center gap-2.5">
                                            <TrainingStatusBadge status={session.status} />
                                            <span className="truncate text-sm font-medium">
                                                {session.name}
                                            </span>
                                        </div>
                                        <span className="hidden sm:block text-[11px] text-muted-foreground/70">
                                            {formatDateTime(session.started_at ?? session.created_at)}
                                        </span>
                                        <span className="hidden sm:block font-mono text-[11px] tabular-nums text-muted-foreground/70">
                                            {session.status === "running" ? (
                                                <TrainingTimer startedAt={session.started_at} endedAt={session.ended_at} />
                                            ) : (
                                                formatDuration(session.duration_seconds)
                                            )}
                                        </span>
                                        <span className="hidden sm:block font-mono text-[11px] tabular-nums text-muted-foreground/70">
                                            {session.edge_count} edges
                                        </span>
                                        <span className="flex items-center gap-0.5 text-[11px] text-muted-foreground/70">
                                            {session.rating != null ? (
                                                <>
                                                    <Star size={11} className="fill-amber-400 text-amber-400" />
                                                    {session.rating}/5
                                                </>
                                            ) : (
                                                "—"
                                            )}
                                        </span>
                                    </Link>
                                </li>
                            ))}
                        </ul>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
