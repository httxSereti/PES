import { useId } from "react";

import { cn } from "@pes/ui/lib/utils";

const WIDTH = 800;
const HEIGHT = 220;
const PADDING_X = 18;
const PADDING_TOP = 16;
const PADDING_BOTTOM = 22;
const PLOT_WIDTH = WIDTH - PADDING_X * 2;
const PLOT_HEIGHT = HEIGHT - PADDING_TOP - PADDING_BOTTOM;
const BASELINE_Y = PADDING_TOP + PLOT_HEIGHT;
const MIN_DURATION_MS = 1000;
const SEGMENT_SAMPLES = 16;
const EASINGS = new Set([
    "linear",
    "step",
    "ease-in",
    "ease-out",
    "ease-in-out",
    "sine",
]);

interface WaveformKeyframe {
    at_ms: number;
    value: number;
    easing: string;
}

interface WaveformTrack {
    keyframes: WaveformKeyframe[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

function clamp(value: number, min = 0, max = 1) {
    return Math.min(max, Math.max(min, value));
}

function finiteNumber(value: unknown) {
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
}

function readTracks(definition: Record<string, unknown>): WaveformTrack[] {
    if (!isRecord(definition) || !Array.isArray(definition.tracks)) return [];

    return definition.tracks.flatMap((rawTrack) => {
        if (!isRecord(rawTrack) || !Array.isArray(rawTrack.keyframes))
            return [];

        const keyframes = rawTrack.keyframes
            .flatMap((rawKeyframe) => {
                if (!isRecord(rawKeyframe)) return [];
                const atMs = finiteNumber(rawKeyframe.at_ms);
                const value = finiteNumber(rawKeyframe.value);
                if (atMs === null || value === null) return [];

                const rawEasing = String(
                    rawKeyframe.easing ?? "linear",
                ).toLowerCase();
                return [
                    {
                        at_ms: Math.max(0, atMs),
                        value: clamp(value),
                        easing: EASINGS.has(rawEasing) ? rawEasing : "linear",
                    },
                ];
            })
            .sort((a, b) => a.at_ms - b.at_ms);

        return keyframes.length > 0 ? [{ keyframes }] : [];
    });
}

function ease(progress: number, kind: string) {
    const value = clamp(progress);
    if (kind === "step") return value < 1 ? 0 : 1;
    if (kind === "ease-in") return value * value;
    if (kind === "ease-out") return 1 - (1 - value) ** 2;
    if (kind === "ease-in-out")
        return 3 * value * value - 2 * value * value * value;
    if (kind === "sine") return 0.5 - 0.5 * Math.cos(Math.PI * value);
    return value;
}

function point(
    atMs: number,
    value: number,
    durationMs: number,
): [number, number] {
    return [
        PADDING_X + clamp(atMs / durationMs) * PLOT_WIDTH,
        PADDING_TOP + (1 - clamp(value)) * PLOT_HEIGHT,
    ];
}

function formatCoordinate(value: number) {
    return Number(value.toFixed(2));
}

function linePath(track: WaveformTrack, durationMs: number) {
    const keyframes = track.keyframes;
    const first = keyframes[0];
    if (!first) return "";

    const points: Array<[number, number]> = [point(0, first.value, durationMs)];
    if (first.at_ms > 0)
        points.push(point(first.at_ms, first.value, durationMs));

    for (let index = 0; index < keyframes.length - 1; index += 1) {
        const start = keyframes[index];
        const end = keyframes[index + 1];
        if (!start || !end) continue;
        const span = end.at_ms - start.at_ms;
        if (span <= 0) {
            points.push(point(end.at_ms, end.value, durationMs));
            continue;
        }

        for (let sample = 1; sample <= SEGMENT_SAMPLES; sample += 1) {
            const progress = sample / SEGMENT_SAMPLES;
            const value =
                start.value +
                (end.value - start.value) * ease(progress, start.easing);
            points.push(
                point(start.at_ms + span * progress, value, durationMs),
            );
        }
    }

    const last = keyframes[keyframes.length - 1];
    if (last && last.at_ms < durationMs) {
        points.push(point(durationMs, last.value, durationMs));
    }

    return points
        .map(([x, y], index) => {
            const command = index === 0 ? "M" : "L";
            return `${command}${formatCoordinate(x)},${formatCoordinate(y)}`;
        })
        .join(" ");
}

function areaPath(path: string, track: WaveformTrack, durationMs: number) {
    const first = track.keyframes[0];
    const last = track.keyframes[track.keyframes.length - 1];
    if (!path || !first || !last) return "";

    const [startX] = point(0, first.value, durationMs);
    const [endX] = point(
        Math.max(durationMs, last.at_ms),
        last.value,
        durationMs,
    );
    return `${path} L${formatCoordinate(endX)},${BASELINE_Y} L${formatCoordinate(startX)},${BASELINE_Y} Z`;
}

/**
 * Read-only, responsive preview of the tracks in a Lovense pattern definition.
 * `progress` is a normalized position in the pattern (0..1).
 */
export function PatternWaveform({
    definition,
    className,
    progress = null,
}: {
    definition: Record<string, unknown>;
    className?: string;
    progress?: number | null;
}) {
    const gradientId = `pattern-waveform-${useId().replace(/:/g, "")}`;
    const tracks = readTracks(definition);
    const lastKeyframeMs = Math.max(
        0,
        ...tracks.map(
            (track) => track.keyframes[track.keyframes.length - 1]?.at_ms ?? 0,
        ),
    );
    const durationMs = lastKeyframeMs > 0 ? lastKeyframeMs : MIN_DURATION_MS;
    const firstTrack = tracks[0];
    const firstPath = firstTrack ? linePath(firstTrack, durationMs) : "";
    const progressRatio =
        progress !== null && Number.isFinite(progress) ? clamp(progress) : null;

    return (
        <svg
            viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
            preserveAspectRatio="none"
            className={cn("block h-40 w-full", className)}
            role="img"
            aria-label="Pattern waveform"
        >
            <defs>
                <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="100%">
                    <stop offset="0%" stopColor="#a855f7" stopOpacity="0.38" />
                    <stop offset="55%" stopColor="#8b5cf6" stopOpacity="0.16" />
                    <stop
                        offset="100%"
                        stopColor="#7c3aed"
                        stopOpacity="0.025"
                    />
                </linearGradient>
            </defs>

            <g className="text-foreground" aria-hidden="true">
                {[0, 0.25, 0.5, 0.75, 1].map((level) => {
                    const y = PADDING_TOP + level * PLOT_HEIGHT;
                    return (
                        <line
                            key={level}
                            x1={PADDING_X}
                            x2={WIDTH - PADDING_X}
                            y1={y}
                            y2={y}
                            stroke="currentColor"
                            strokeOpacity={level === 1 ? 0.16 : 0.075}
                            strokeWidth="1"
                            vectorEffect="non-scaling-stroke"
                        />
                    );
                })}
                {[0, 0.25, 0.5, 0.75, 1].map((position) => {
                    const x = PADDING_X + position * PLOT_WIDTH;
                    return (
                        <line
                            key={position}
                            x1={x}
                            x2={x}
                            y1={PADDING_TOP}
                            y2={BASELINE_Y}
                            stroke="currentColor"
                            strokeOpacity="0.045"
                            strokeWidth="1"
                            vectorEffect="non-scaling-stroke"
                        />
                    );
                })}
            </g>

            {firstTrack && firstPath && (
                <path
                    d={areaPath(firstPath, firstTrack, durationMs)}
                    fill={`url(#${gradientId})`}
                />
            )}

            {tracks.map((track, index) => (
                <path
                    key={index}
                    d={linePath(track, durationMs)}
                    fill="none"
                    stroke="#a855f7"
                    strokeOpacity={
                        index === 0 ? 0.96 : Math.max(0.2, 0.58 - index * 0.07)
                    }
                    strokeWidth={index === 0 ? 2.25 : 1.4}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    vectorEffect="non-scaling-stroke"
                    className="dark:stroke-violet-400"
                />
            ))}

            {tracks.length === 0 && (
                <text
                    x={WIDTH / 2}
                    y={HEIGHT / 2}
                    textAnchor="middle"
                    fill="currentColor"
                    opacity="0.45"
                    fontSize="12"
                    className="font-sans"
                >
                    No valid keyframes to preview
                </text>
            )}

            {progressRatio !== null && (
                <g className="text-foreground" aria-hidden="true">
                    <line
                        x1={PADDING_X + progressRatio * PLOT_WIDTH}
                        x2={PADDING_X + progressRatio * PLOT_WIDTH}
                        y1={PADDING_TOP / 2}
                        y2={HEIGHT - PADDING_BOTTOM / 2}
                        stroke="currentColor"
                        strokeOpacity="0.7"
                        strokeWidth="1.25"
                        strokeDasharray="4 4"
                        vectorEffect="non-scaling-stroke"
                    />
                    <circle
                        cx={PADDING_X + progressRatio * PLOT_WIDTH}
                        cy={PADDING_TOP / 2}
                        r="3"
                        fill="currentColor"
                    />
                </g>
            )}
        </svg>
    );
}
