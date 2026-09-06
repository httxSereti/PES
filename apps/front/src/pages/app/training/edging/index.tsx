import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router";
import { Button } from "@pes/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@pes/ui/components/card";
import { Skeleton } from "@pes/ui/components/skeleton";
import { List, Plus, Star } from "lucide-react";

import { useAppSelector } from "@/store/hooks";
import { hasPermission } from "@/lib/permissions";
import { fetchTrainingSessions } from "@/lib/training-api";
import { formatDuration } from "@/lib/training";
import { formatDateTime } from "@/lib/format-date";
import { TrainingStatusBadge } from "@/components/common/training/training-status-badge";
import { TrainingTimer } from "@/components/common/training/training-timer";
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

  const canManage = hasPermission(user, Permission.TRAINING_EDGING_MANAGE);

  return (
    <div className="px-4 md:px-5 space-y-4">
      {error && <p className="text-sm text-destructive">{error}</p>}

      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <div className="flex flex-col">
            <CardTitle>Edging sessions</CardTitle>
            <CardDescription>
              Configured, running and past edging training sessions
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          {sessions === null ? (
            <div className="space-y-2 py-1">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="flex items-center gap-2.5 py-2">
                  <Skeleton className="h-4.5 w-24 rounded-md" />
                  <Skeleton className="h-4 w-42" />
                  <Skeleton className="ml-auto h-3 w-28 hidden sm:block" />
                </div>
              ))}
            </div>
          ) : sessions.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-10 text-center">
              <span className="accent-tile flex h-10 w-10 items-center justify-center rounded-md">
                <List size={16} className="accent-tile-icon" />
              </span>
              <p className="text-xs text-muted-foreground">No sessions yet.</p>
              {canManage && (
                <Button asChild variant="outline" size="sm">
                  <Link to="/app/training/edging/new">
                    <Plus size={13} />
                    Create your first session
                  </Link>
                </Button>
              )}
            </div>
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
                        <TrainingTimer
                          startedAt={session.started_at}
                          endedAt={session.ended_at}
                        />
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
                          <Star
                            size={11}
                            className="fill-amber-400 text-amber-400"
                          />
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
