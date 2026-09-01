import type { EdgingEdge } from "@/types";
import { difficultyMeta } from "@/lib/training";
import {
    CartesianGrid,
    Cell,
    ResponsiveContainer,
    Scatter,
    ScatterChart,
    Tooltip,
    XAxis,
    YAxis,
} from "recharts";

interface ChartPoint {
    minutes: number;
    difficulty: number;
    label: string;
    outcome: string;
    fill: string;
}

function buildPoints(edges: EdgingEdge[], startedAt: string | null): ChartPoint[] {
    const start = startedAt ? new Date(startedAt).getTime() : null;
    return edges.map((edge) => ({
        minutes: start
            ? Math.max(0, (new Date(edge.recorded_at).getTime() - start) / 60000)
            : 0,
        difficulty: difficultyMeta(edge.difficulty).score,
        label: difficultyMeta(edge.difficulty).label,
        outcome: edge.outcome,
        fill: edge.outcome === "fail" ? "#ef4444" : difficultyMeta(edge.difficulty).dot,
    }));
}

function EdgeTooltip({ active, payload }: { active?: boolean; payload?: Array<{ payload?: ChartPoint }> }) {
    if (!active || !payload || payload.length === 0) return null;
    const point = payload[0]?.payload;
    if (!point) return null;
    return (
        <div className="rounded-md border border-border bg-background px-2.5 py-1.5 text-xs shadow-md">
            <p className="font-medium">{point.label}{point.outcome === "fail" ? " · Failed" : ""}</p>
            <p className="text-muted-foreground tabular-nums">
                {Math.floor(point.minutes)} min {Math.round((point.minutes % 1) * 60)} s
            </p>
        </div>
    );
}

interface EdgeChartProps {
    edges: EdgingEdge[];
    startedAt: string | null;
}

/** Difficulty of each edge over time (minutes since session start). */
export function EdgeChart({ edges, startedAt }: EdgeChartProps) {
    const points = buildPoints(edges, startedAt);

    if (points.length === 0) {
        return (
            <p className="py-6 text-center text-xs text-muted-foreground">
                Record edges to see the chart.
            </p>
        );
    }

    return (
        <div className="h-56 w-full">
            <ResponsiveContainer width="100%" height="100%">
                <ScatterChart margin={{ top: 8, right: 16, bottom: 4, left: -16 }}>
                    <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.15} />
                    <XAxis
                        dataKey="minutes"
                        type="number"
                        domain={[0, "dataMax"]}
                        tick={{ fontSize: 10 }}
                        tickFormatter={(v: number) => `${Math.round(v)}m`}
                    />
                    <YAxis
                        dataKey="difficulty"
                        type="number"
                        domain={[0.5, 4.5]}
                        ticks={[1, 2, 3, 4]}
                        tick={{ fontSize: 10 }}
                        tickFormatter={(v: number) =>
                            (["", "Easy", "Normal", "Hard", "Extreme"] as const)[v] ?? ""
                        }
                        width={64}
                    />
                    <Tooltip content={<EdgeTooltip />} cursor={{ strokeDasharray: "3 3" }} />
                    <Scatter data={points} isAnimationActive={false}>
                        {points.map((point, index) => (
                            <Cell key={index} fill={point.fill} />
                        ))}
                    </Scatter>
                </ScatterChart>
            </ResponsiveContainer>
        </div>
    );
}
