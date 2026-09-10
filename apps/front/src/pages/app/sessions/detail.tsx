import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { Button } from "@pes/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@pes/ui/components/card";
import { Archive, Dumbbell, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { useWebSocket } from "@/hooks/useWebSocket";
import { useAppSelector } from "@/store/hooks";
import { hasPermission } from "@/lib/permissions";
import { formatDuration } from "@/lib/training";
import { formatDateTime } from "@/lib/format-date";
import { SESSION_TYPE_META } from "@/components/common/session/session.constants";
import { SessionStatusBadge } from "@/components/common/session/session-status-badge";
import { TrainingStatusBadge } from "@/components/common/training/training-status-badge";
import { EventRow, EventCard } from "@/components/common/events/event-row";
import { ConfirmDeleteDialog } from "@/components/common/dialogs/confirm-delete-dialog";
import { Permission } from "@/types";

export function meta() {
  return [{ title: "PES | Session history" }];
}

export default function SessionHistoryDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { sendCommand } = useWebSocket();
  const user = useAppSelector((state) => state.auth.user);
  const detail = useAppSelector((state) =>
    id ? state.sessionHistory.details[id] : undefined,
  );

  const [error, setError] = useState<string | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    try {
      const result = await sendCommand("sessions:history_detail", {
        session_id: id,
      });
      if (result.status !== "ok") {
        setError(result.message ?? "Failed to load the session");
      } else {
        setError(null);
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to load the session",
      );
    }
  }, [sendCommand, id]);

  useEffect(() => {
    void load();
  }, [load]);

  const isHost = hasPermission(user, Permission.HOST);

  async function handleDelete() {
    if (!detail) return;
    try {
      const result = await sendCommand("sessions:delete", {
        session_id: detail.session.id,
      });
      if (result.status !== "ok") {
        setError(result.message ?? "Failed to delete the session");
        return;
      }
      toast.success("Session deleted", { position: "bottom-right" });
      navigate("/app/sessions");
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to delete the session",
      );
    } finally {
      setDeleteOpen(false);
    }
  }

  if (!detail) {
    return (
      <div className="px-4 md:px-5">
        {error ? (
          <p className="text-sm text-destructive">{error}</p>
        ) : (
          <p className="text-sm text-muted-foreground">Loading…</p>
        )}
      </div>
    );
  }

  const { session, edging_sessions, events } = detail;
  const typeMeta = SESSION_TYPE_META.find(
    (meta) => meta.value === session.type,
  );

  return (
    <div className="space-y-4 px-4 md:px-5">
      {error && <p className="text-sm text-destructive">{error}</p>}

      {/* Header */}
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex min-w-0 flex-col gap-1.5">
              <div className="flex items-center gap-2.5">
                <SessionStatusBadge status={session.status} />
                <CardTitle className="truncate">{session.name}</CardTitle>
              </div>
              <CardDescription>
                {typeMeta?.label ?? session.type}
                {session.description ? ` · ${session.description}` : ""}
              </CardDescription>
              <p className="text-[11px] text-muted-foreground/70">
                Created {formatDateTime(session.created_at)}
                {session.started_at && (
                  <> · started {formatDateTime(session.started_at)}</>
                )}
                {session.ended_at && (
                  <> · ended {formatDateTime(session.ended_at)}</>
                )}
                {session.duration_seconds != null && (
                  <> · {formatDuration(session.duration_seconds)}</>
                )}
              </p>
            </div>
            <div className="flex flex-col gap-1 text-right font-mono text-[11px] tabular-nums text-muted-foreground/70">
              <span>
                {session.unit_ids.length}{" "}
                {session.unit_ids.length === 1 ? "unit" : "units"}
              </span>
              <span>
                {session.sensor_ids.length}{" "}
                {session.sensor_ids.length === 1 ? "sensor" : "sensors"}
              </span>
              {isHost && session.status !== "running" && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="mt-1 h-7 gap-1.5 text-muted-foreground/70 hover:text-destructive"
                  onClick={() => setDeleteOpen(true)}
                >
                  <Trash2 size={13} />
                  Delete session
                </Button>
              )}
            </div>
          </div>
        </CardHeader>
      </Card>

      {/* Edging sessions run during this session */}
      {edging_sessions !== null && (
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2.5">
              <span className="accent-tile flex h-8 w-8 items-center justify-center rounded-md">
                <Dumbbell size={14} className="accent-tile-icon" />
              </span>
              <div className="flex flex-col">
                <CardTitle>Edging sessions</CardTitle>
                <CardDescription>
                  Training sessions that ran during this application session
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {edging_sessions.length === 0 ? (
              <p className="py-4 text-center text-xs text-muted-foreground">
                No edging sessions during this application session.
              </p>
            ) : (
              <ul className="flex flex-col divide-y divide-border/60">
                {edging_sessions.map((edging) => (
                  <li key={edging.id}>
                    <Link
                      to={`/app/training/edging/${edging.id}`}
                      className="flex items-center justify-between gap-3 py-2.5 px-2 -mx-2 rounded-md transition-colors hover:bg-accent/40"
                    >
                      <div className="flex min-w-0 items-center gap-2.5">
                        <TrainingStatusBadge status={edging.status} />
                        <span className="truncate text-sm font-medium">
                          {edging.name}
                        </span>
                      </div>
                      <div className="flex shrink-0 items-center gap-4 text-[11px] text-muted-foreground/70">
                        <span className="hidden sm:block">
                          {formatDateTime(
                            edging.started_at ?? edging.created_at,
                          )}
                        </span>
                        <span className="font-mono tabular-nums">
                          {formatDuration(edging.duration_seconds)}
                        </span>
                        <span className="font-mono tabular-nums">
                          {edging.edge_count} edges
                        </span>
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      )}

      {/* Events logged during this session */}
      {events !== null && (
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2.5">
              <span className="accent-tile flex h-8 w-8 items-center justify-center rounded-md">
                <Archive size={14} className="accent-tile-icon" />
              </span>
              <div className="flex flex-col">
                <CardTitle>Events log</CardTitle>
                <CardDescription>
                  {events.length} {events.length === 1 ? "event" : "events"}{" "}
                  recorded during this application session
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {events.length === 0 ? (
              <p className="py-4 text-center text-xs text-muted-foreground">
                No events recorded during this application session.
              </p>
            ) : (
              <>
                <div className="hidden md:block rounded-xl border border-border overflow-hidden">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border bg-muted/40">
                        {["Time", "Type", "Origin", "Triggered rules", ""].map(
                          (h, i) => (
                            <th
                              key={i}
                              className="py-2.5 px-2 first:pl-4 last:pr-4 text-left text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/50"
                            >
                              {h}
                            </th>
                          ),
                        )}
                      </tr>
                    </thead>
                    <tbody>
                      {events.map((event) => (
                        <EventRow key={event.id} event={event} />
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="flex flex-col gap-2 md:hidden">
                  {events.map((event) => (
                    <EventCard key={event.id} event={event} />
                  ))}
                </div>
              </>
            )}
          </CardContent>
        </Card>
      )}

      <ConfirmDeleteDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title={`Delete session '${session.name}'?`}
        onConfirm={() => void handleDelete()}
      />
    </div>
  );
}
