import { useCallback, useEffect, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@pes/ui/components/card";
import {
  Activity,
  Clock,
  Flame,
  Gauge,
  Star,
  Trophy,
} from "lucide-react";

import { useWebSocket, useWebSocketEvent } from "@/hooks/useWebSocket";
import { formatDuration } from "@/lib/training";
import type { TrainingAnalytics } from "@/types";

export function meta() {
  return [{ title: "PES | Training - Analytics" }];
}

function shortDate(value: string): string {
  return new Date(value).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

function RecordCard({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Flame;
  label: string;
  value: string;
}) {
  return (
    <Card className="gap-2 py-3">
      <CardContent className="flex items-center gap-3 px-4">
        <span className="accent-tile flex h-9 w-9 shrink-0 items-center justify-center rounded-md">
          <Icon size={15} className="accent-tile-icon" />
        </span>
        <div className="min-w-0">
          <p className="text-[11px] font-medium text-muted-foreground">
            {label}
          </p>
          <p className="truncate font-mono text-lg font-bold tabular-nums">
            {value}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

export default function TrainingAnalyticsPage() {
  const { sendCommand } = useWebSocket();
  const [data, setData] = useState<TrainingAnalytics | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const result = await sendCommand("training:analytics");
      if (result.status !== "ok") {
        setError(result.message ?? "Failed to load analytics");
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to load analytics",
      );
    }
  }, [sendCommand]);

  useEffect(() => {
    void load();
  }, [load]);

  useWebSocketEvent("training:analytics", (payload) => {
    setData(payload);
    setError(null);
  });

  useWebSocketEvent("training:session", (session) => {
    if (
      session.status === "succeeded" ||
      session.status === "failed" ||
      session.status === "cancelled"
    ) {
      void load();
    }
  });

  if (error) {
    return <p className="px-4 text-sm text-destructive md:px-5">{error}</p>;
  }

  if (!data) {
    return (
      <p className="px-4 text-sm text-muted-foreground md:px-5">
        Loading analytics…
      </p>
    );
  }

  const trend = data.trend.map((point) => ({
    date: shortDate(point.ended_at),
    edges: point.edges,
    pace: point.edges_per_minute ?? 0,
    duration: Math.round((point.duration_seconds ?? 0) / 60),
  }));
  const records = data.records;

  return (
    <div className="space-y-4 px-4 md:px-5">
      <div>
        <h2 className="text-lg font-semibold">Analytics</h2>
        <p className="text-xs text-muted-foreground">
          Trends, records and edge pacing across your accessible sessions.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <RecordCard
          icon={Clock}
          label="Longest session"
          value={formatDuration(records.longest_duration_seconds)}
        />
        <RecordCard
          icon={Flame}
          label="Most edges"
          value={records.most_edges != null ? String(records.most_edges) : "—"}
        />
        <RecordCard
          icon={Gauge}
          label="Best pace"
          value={
            records.best_edges_per_minute != null
              ? `${records.best_edges_per_minute}/min`
              : "—"
          }
        />
        <RecordCard
          icon={Star}
          label="Best rating"
          value={records.best_rating != null ? `${records.best_rating}/5` : "—"}
        />
      </div>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
        <Card className="gap-2 py-3 lg:col-span-2">
          <CardHeader className="px-4">
            <CardTitle className="flex items-center gap-2 text-sm">
              <Trophy size={14} className="text-violet-500" />
              Streaks
            </CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-4 px-4">
            <div>
              <p className="text-[11px] text-muted-foreground">Current streak</p>
              <p className="font-mono text-2xl font-bold tabular-nums">
                {records.current_streak_days}
                <span className="ml-1 text-xs font-normal text-muted-foreground">
                  days
                </span>
              </p>
            </div>
            <div>
              <p className="text-[11px] text-muted-foreground">Best streak</p>
              <p className="font-mono text-2xl font-bold tabular-nums">
                {records.best_streak_days}
                <span className="ml-1 text-xs font-normal text-muted-foreground">
                  days
                </span>
              </p>
            </div>
          </CardContent>
        </Card>
        <Card className="gap-2 py-3">
          <CardHeader className="px-4">
            <CardTitle className="flex items-center gap-2 text-sm">
              <Activity size={14} className="text-violet-500" />
              Overview
            </CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-2 px-4 text-xs">
            <span className="text-muted-foreground">Sessions</span>
            <span className="text-right font-mono font-semibold">
              {data.overview.total_sessions}
            </span>
            <span className="text-muted-foreground">Success rate</span>
            <span className="text-right font-mono font-semibold">
              {data.overview.success_rate != null
                ? `${Math.round(data.overview.success_rate * 100)}%`
                : "—"}
            </span>
            <span className="text-muted-foreground">Edges</span>
            <span className="text-right font-mono font-semibold">
              {data.overview.total_success_edges}
            </span>
            <span className="text-muted-foreground">Avg rating</span>
            <span className="text-right font-mono font-semibold">
              {data.overview.average_rating != null
                ? `${data.overview.average_rating}/5`
                : "—"}
            </span>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Session trend</CardTitle>
          <CardDescription>
            Edges and pace for the last {trend.length} sessions.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {trend.length === 0 ? (
            <p className="py-8 text-center text-xs text-muted-foreground">
              Finish a session to see the trend.
            </p>
          ) : (
            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={trend}>
                  <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.15} />
                  <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                  <YAxis yAxisId="left" tick={{ fontSize: 10 }} width={30} />
                  <YAxis
                    yAxisId="right"
                    orientation="right"
                    tick={{ fontSize: 10 }}
                    width={34}
                  />
                  <Tooltip />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Line
                    yAxisId="left"
                    type="monotone"
                    dataKey="edges"
                    name="Edges"
                    stroke="#8b5cf6"
                    strokeWidth={2}
                    dot={false}
                  />
                  <Line
                    yAxisId="right"
                    type="monotone"
                    dataKey="pace"
                    name="Edges/min"
                    stroke="#10b981"
                    strokeWidth={2}
                    dot={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Daily volume</CardTitle>
            <CardDescription>Last 30 days</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-56 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data.daily}>
                  <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.15} />
                  <XAxis
                    dataKey="date"
                    tick={{ fontSize: 9 }}
                    tickFormatter={(value: string) => value.slice(5)}
                  />
                  <YAxis tick={{ fontSize: 10 }} width={28} />
                  <Tooltip />
                  <Bar dataKey="sessions" name="Sessions" fill="#8b5cf6" />
                  <Bar dataKey="edges" name="Edges" fill="#c4b5fd" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Edge intervals</CardTitle>
            <CardDescription>Time between consecutive edges</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-56 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data.interval_buckets}>
                  <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.15} />
                  <XAxis dataKey="label" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 10 }} width={28} />
                  <Tooltip />
                  <Bar dataKey="count" name="Edges" fill="#f97316" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
