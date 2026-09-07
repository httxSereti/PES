import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@pes/ui/components/card";
import { Skeleton } from "@pes/ui/components/skeleton";
import { History, Zap } from "lucide-react";

import { useWebSocket } from "@/hooks/useWebSocket";
import { useAppSelector } from "@/store/hooks";
import { formatDuration } from "@/lib/training";
import { formatDateTime } from "@/lib/format-date";
import { SESSION_TYPE_META } from "@/components/common/session/session.constants";
import { SessionStatusBadge } from "@/components/common/session/session-status-badge";

export function meta() {
  return [{ title: "PES | Sessions" }];
}

export default function SessionsPage() {
  const { sendCommand } = useWebSocket();
  const sessions = useAppSelector((state) => state.sessionHistory.list);
  const activeSession = useAppSelector((state) => state.session.activeSession);

  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const result = await sendCommand("sessions:history");
      if (result.status !== "ok") {
        setError(result.message ?? "Failed to load sessions");
      } else {
        setError(null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load sessions");
    }
  }, [sendCommand]);

  useEffect(() => {
    void load();
  }, [load]);

  // Refetch once a session lifecycle change was broadcast (start/end)
  useEffect(() => {
    if (activeSession) void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSession?.id]);

  return (
    <div className="px-4 md:px-5 space-y-4">
      {error && <p className="text-sm text-destructive">{error}</p>}

      <Card>
        <CardHeader>
          <CardTitle>Session history</CardTitle>
          <CardDescription>
            Every application session — what ran, and what happened during it
          </CardDescription>
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
                <History size={16} className="accent-tile-icon" />
              </span>
              <p className="text-xs text-muted-foreground">
                No sessions yet — start one from the session settings.
              </p>
            </div>
          ) : (
            <ul className="flex flex-col divide-y divide-border/60">
              {sessions.map((session) => {
                const typeMeta = SESSION_TYPE_META.find(
                  (meta) => meta.value === session.type,
                );
                return (
                  <li key={session.id}>
                    <Link
                      to={`/app/sessions/${session.id}`}
                      className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-md px-2 py-3 -mx-2 transition-colors hover:bg-accent/40 sm:grid-cols-[minmax(0,1fr)_auto_auto_auto_auto]"
                    >
                      <div className="flex min-w-0 items-center gap-2.5">
                        <SessionStatusBadge status={session.status} />
                        <span className="truncate text-sm font-medium">
                          {session.name}
                        </span>
                      </div>
                      <span className="hidden sm:flex items-center gap-1.5 text-[11px] text-muted-foreground/70">
                        {typeMeta?.icon ? <typeMeta.icon size={12} /> : null}
                        {typeMeta?.label ?? session.type}
                      </span>
                      <span className="hidden sm:block text-[11px] text-muted-foreground/70">
                        {formatDateTime(
                          session.started_at ?? session.created_at,
                        )}
                      </span>
                      <span className="hidden sm:block font-mono text-[11px] tabular-nums text-muted-foreground/70">
                        {formatDuration(session.duration_seconds)}
                      </span>
                      <span className="flex items-center gap-3 text-[11px] text-muted-foreground/70">
                        <span className="font-mono tabular-nums">
                          {session.edging_session_count}{" "}
                          {session.edging_session_count === 1
                            ? "edge session"
                            : "edge sessions"}
                        </span>
                        <span className="hidden sm:flex items-center gap-1 font-mono tabular-nums">
                          <Zap size={11} />
                          {session.event_count}
                        </span>
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
