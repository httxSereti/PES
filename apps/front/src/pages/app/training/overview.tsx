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
import {
  ArrowRight,
  Clock,
  Flame,
  Gauge,
  Hourglass,
  Star,
  Target,
  Trophy,
} from "lucide-react";

import { useAppSelector } from "@/store/hooks";
import { fetchTrainingIndex } from "@/lib/training-api";
import { formatDuration } from "@/lib/training";
import { formatDateTime } from "@/lib/format-date";
import { TrainingStatusBadge } from "@/components/common/training/training-status-badge";
import type { EdgingSession, TrainingIndexResponse } from "@/types";

export function meta() {
  return [{ title: "PES | Training - Overview" }];
}

/** Sum of the targets for a goal type (duration in seconds, edges as count). */
function goalTotal(session: EdgingSession, type: "duration" | "edges") {
  return session.goals
    .filter((goal) => goal.type === type)
    .reduce((sum, goal) => sum + goal.value, 0);
}

/** Compact "live now" banner shown on the overview when a session is running. */
function LiveSessionCard({ session }: { session: EdgingSession }) {
  const durationTarget = goalTotal(session, "duration");
  const edgesTarget = goalTotal(session, "edges");

  const currentDuration = session.duration_seconds ?? 0;
  const durationDone = Math.min(currentDuration, durationTarget);
  const durationRemaining = Math.max(0, durationTarget - currentDuration);

  const currentEdges = session.edge_count;
  const edgesDone = Math.min(currentEdges, edgesTarget);
  const edgesRemaining = Math.max(0, edgesTarget - currentEdges);

  return (
    <Link
      to={`/app/training/edging/${session.id}`}
      className="transition-colors hover:bg-emerald-500/10"
    >
      <Card className="border-emerald-500/30 bg-emerald-500/5">
        <CardContent className="flex flex-wrap items-center gap-x-6 gap-y-2 px-5 py-4">
          <div className="flex min-w-0 items-center gap-2.5">
            <span className="relative flex h-2.5 w-2.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500" />
            </span>
            <p className="min-w-0 truncate text-sm font-medium">
              Live · {session.name}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
            {durationTarget > 0 && (
              <span className="flex items-center gap-1.5 font-mono text-xs tabular-nums text-muted-foreground">
                <Clock size={12} className="text-emerald-500" />
                {formatDuration(durationDone)} / {formatDuration(durationTarget)}
                <span className="text-muted-foreground/60">
                  ({formatDuration(durationRemaining)} to go)
                </span>
              </span>
            )}
            {edgesTarget > 0 && (
              <span className="flex items-center gap-1.5 font-mono text-xs tabular-nums text-muted-foreground">
                <Flame size={12} className="text-emerald-500" />
                {edgesDone} / {edgesTarget}
                <span className="text-muted-foreground/60">
                  ({edgesRemaining} to go)
                </span>
              </span>
            )}
          </div>

          <span className="ml-auto flex items-center gap-1 text-xs text-violet-600 hover:underline dark:text-violet-400">
            Open session
            <ArrowRight size={12} />
          </span>
        </CardContent>
      </Card>
    </Link>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  sub,
}: {
  icon: typeof Flame;
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <Card className="gap-3 py-4">
      <CardHeader className="flex-row items-center gap-3 space-y-0 px-5">
        <span className="accent-tile flex h-9 w-9 items-center justify-center rounded-md">
          <Icon size={15} className="accent-tile-icon" />
        </span>
        <div className="flex min-w-0 flex-col">
          <CardTitle className="text-[13px] font-medium text-muted-foreground">
            {label}
          </CardTitle>
          <span className="font-mono text-xl font-bold tabular-nums">
            {value}
          </span>
        </div>
      </CardHeader>
      {sub && (
        <CardContent className="px-5">
          <p className="text-[11px] text-muted-foreground/70">{sub}</p>
        </CardContent>
      )}
    </Card>
  );
}

function StatCardsSkeleton() {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
      {Array.from({ length: 6 }).map((_, i) => (
        <Card key={i} className="gap-3 py-4">
          <CardHeader className="flex-row items-center gap-3 space-y-0 px-5">
            <Skeleton className="h-9 w-9 rounded-md" />
            <div className="flex flex-col gap-1.5">
              <Skeleton className="h-3 w-24" />
              <Skeleton className="h-5 w-16" />
            </div>
          </CardHeader>
        </Card>
      ))}
    </div>
  );
}

export default function TrainingOverviewPage() {
  const token = useAppSelector((state) => state.auth.token);
  const [data, setData] = useState<TrainingIndexResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token) return;
    try {
      setData(await fetchTrainingIndex(token));
      setError(null);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to load training stats",
      );
    }
  }, [token]);

  useEffect(() => {
    void load();
    const id = setInterval(() => void load(), 15000);
    return () => clearInterval(id);
  }, [load]);

  const stats = data?.edging;
  const liveSession = useAppSelector((state) => state.training.liveSession);

  return (
    <div className="space-y-4 px-4 md:px-5">
      {error && <p className="text-sm text-destructive">{error}</p>}

      {liveSession && <LiveSessionCard session={liveSession} />}

      {!stats || !data ? (
        <StatCardsSkeleton />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          <StatCard
            icon={Target}
            label="Edging sessions"
            value={String(stats.total_sessions)}
            sub={`${stats.succeeded_sessions} succeeded · ${stats.failed_sessions} failed · ${stats.cancelled_sessions} cancelled`}
          />
          <StatCard
            icon={Flame}
            label="Total edges"
            value={String(stats.total_success_edges)}
            sub={`${stats.total_failed_edges} failed`}
          />
          <StatCard
            icon={Hourglass}
            label="Time trained"
            value={formatDuration(stats.total_duration_seconds)}
            sub={`Average ${formatDuration(stats.average_duration_seconds)} per session`}
          />
          <StatCard
            icon={Gauge}
            label="Avg edges / session"
            value={
              stats.average_edges_per_session != null
                ? String(stats.average_edges_per_session)
                : "—"
            }
            sub="Successful edges per ended session"
          />
          <StatCard
            icon={Trophy}
            label="Success rate"
            value={
              stats.success_rate != null
                ? `${Math.round(stats.success_rate * 100)}%`
                : "—"
            }
            sub="Succeeded vs all ended sessions"
          />
          <StatCard
            icon={Star}
            label="Average rating"
            value={
              stats.average_rating != null ? `${stats.average_rating} / 5` : "—"
            }
            sub="Host ratings of ended sessions"
          />
        </div>
      )}

      {data && (
        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <div className="flex flex-col gap-1.5">
              <CardTitle>Recent sessions</CardTitle>
              <CardDescription>
                The last edging training sessions
              </CardDescription>
            </div>
            <Link
              to="/app/training/edging"
              className="flex items-center gap-1 text-xs text-violet-600 hover:underline dark:text-violet-400"
            >
              View all
              <ArrowRight size={12} />
            </Link>
          </CardHeader>
          <CardContent>
            {data.recent_sessions.length === 0 ? (
              <p className="py-4 text-center text-xs text-muted-foreground">
                No sessions yet — create one to get started.
              </p>
            ) : (
              <ul className="flex flex-col divide-y divide-border/60">
                {data.recent_sessions.map((session) => (
                  <li key={session.id}>
                    <Link
                      to={`/app/training/edging/${session.id}`}
                      className="flex items-center justify-between gap-3 py-2.5 transition-colors hover:bg-accent/40 rounded-md px-2 -mx-2"
                    >
                      <div className="flex min-w-0 items-center gap-2.5">
                        <TrainingStatusBadge status={session.status} />
                        <span className="truncate text-sm font-medium">
                          {session.name}
                        </span>
                      </div>
                      <div className="flex shrink-0 items-center gap-4 text-[11px] text-muted-foreground/70">
                        <span className="hidden sm:block">
                          {formatDateTime(session.created_at)}
                        </span>
                        <span className="font-mono tabular-nums">
                          {formatDuration(session.duration_seconds)}
                        </span>
                        <span className="font-mono tabular-nums">
                          {session.edge_count} edges
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
    </div>
  );
}
