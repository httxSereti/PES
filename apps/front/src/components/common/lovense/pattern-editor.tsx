import {
    useEffect,
    useMemo,
    useRef,
    useState,
    type KeyboardEvent as ReactKeyboardEvent,
    type PointerEvent as ReactPointerEvent,
} from "react";
import { Copy, Plus, Save, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@pes/ui/components/badge";
import { Button } from "@pes/ui/components/button";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@pes/ui/components/dialog";
import { Input } from "@pes/ui/components/input";
import { Label } from "@pes/ui/components/label";
import { Textarea } from "@pes/ui/components/textarea";
import { cn } from "@pes/ui/lib/utils";

import { PatternWaveform } from "@/components/common/lovense/pattern-waveform";
import { useWebSocket } from "@/hooks/useWebSocket";
import type { LovenseDeviceInfo, LovensePatternDetail } from "@/types";

const OUTPUTS = [
    "Vibrate",
    "Rotate",
    "Oscillate",
    "Constrict",
    "Position",
    "HwPositionWithDuration",
    "Temperature",
    "Led",
    "Spray",
];
const EASINGS = [
    "linear",
    "step",
    "ease-in",
    "ease-out",
    "ease-in-out",
    "sine",
] as const;
const MAX_TRACKS = 64;
const MAX_KEYFRAMES = 512;
const MAX_DURATION_MS = 60 * 60 * 1000;
const MIN_TIMELINE_DURATION_MS = 1000;

const TIMELINE_WIDTH = 800;
const TIMELINE_HEIGHT = 220;
const TIMELINE_PADDING_X = 18;
const TIMELINE_PADDING_TOP = 16;
const TIMELINE_PADDING_BOTTOM = 22;
const TIMELINE_PLOT_WIDTH = TIMELINE_WIDTH - TIMELINE_PADDING_X * 2;
const TIMELINE_PLOT_HEIGHT =
    TIMELINE_HEIGHT - TIMELINE_PADDING_TOP - TIMELINE_PADDING_BOTTOM;

const SELECT_CLASS =
    "h-9 w-full min-w-0 rounded-md border border-input bg-background px-2.5 text-xs shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50";

type Easing = (typeof EASINGS)[number];
type TargetMode = "all" | "devices" | "tags";

interface KeyframeDraft {
    key: string;
    at_ms: number;
    value: number;
    easing: Easing;
}

interface TrackDraft {
    id: string;
    output: string;
    feature_index: number | "all";
    targetMode: TargetMode;
    match: {
        device_ids: string[];
        tags: string[];
        node_ids: string[];
        all: boolean;
    };
    tagsText: string;
    keyframes: KeyframeDraft[];
}

interface Selection {
    trackId: string;
    keyframeId: string;
}

interface FeatureCatalogEntry {
    descriptions: Set<string>;
    deviceIds: Set<string>;
}

type FeatureCatalog = Map<string, Map<number, FeatureCatalogEntry>>;

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

function finiteNumber(value: unknown, fallback = 0) {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
}

function clamp(value: number, min: number, max: number) {
    return Math.min(max, Math.max(min, value));
}

function createId(prefix: string) {
    if (
        typeof crypto !== "undefined" &&
        typeof crypto.randomUUID === "function"
    ) {
        return `${prefix}-${crypto.randomUUID()}`;
    }
    return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
}

function isEasing(value: unknown): value is Easing {
    return typeof value === "string" && EASINGS.includes(value as Easing);
}

function stringArray(value: unknown) {
    return Array.isArray(value) ? value.map(String).filter(Boolean) : [];
}

function parseTags(value: string) {
    return value
        .split(",")
        .map((tag) => tag.trim())
        .filter(Boolean);
}

function numberInputValue(value: number) {
    return Number.isFinite(value) ? value : "";
}

function defaultTrack(durationMs = 5000, output = "Vibrate"): TrackDraft {
    const duration = clamp(
        Math.round(finiteNumber(durationMs, 5000)),
        1000,
        MAX_DURATION_MS,
    );
    return {
        id: createId("track"),
        output,
        feature_index: "all",
        targetMode: "all",
        match: { device_ids: [], tags: [], node_ids: [], all: true },
        tagsText: "",
        keyframes: [
            { key: createId("keyframe"), at_ms: 0, value: 0, easing: "linear" },
            {
                key: createId("keyframe"),
                at_ms: duration,
                value: 50,
                easing: "linear",
            },
        ],
    };
}

function readTracks(detail: LovensePatternDetail | null): TrackDraft[] {
    const definition = isRecord(detail?.definition) ? detail.definition : {};
    const rawTracks = Array.isArray(definition.tracks) ? definition.tracks : [];
    if (rawTracks.length === 0) return [defaultTrack()];

    const usedTrackIds = new Set<string>();
    return rawTracks.map((rawTrack, trackIndex) => {
        const track = isRecord(rawTrack) ? rawTrack : {};
        const match = isRecord(track.match) ? track.match : {};
        const rawKeyframes = Array.isArray(track.keyframes)
            ? track.keyframes
            : [];
        const deviceIds = stringArray(match.device_ids);
        const tags = stringArray(match.tags);
        const nodeIds = stringArray(match.node_ids);
        const all =
            match.all == null
                ? deviceIds.length + tags.length + nodeIds.length === 0
                : Boolean(match.all);

        let id = String(track.id || `t${trackIndex + 1}`);
        while (usedTrackIds.has(id)) id = createId("track");
        usedTrackIds.add(id);

        const keyframes = rawKeyframes.flatMap((rawKeyframe) => {
            if (!isRecord(rawKeyframe)) return [];
            return [
                {
                    key: createId("keyframe"),
                    at_ms: Math.round(finiteNumber(rawKeyframe.at_ms)),
                    value: finiteNumber(rawKeyframe.value) * 100,
                    easing: isEasing(rawKeyframe.easing)
                        ? rawKeyframe.easing
                        : "linear",
                },
            ];
        });

        return {
            id,
            output: String(track.output || "Vibrate"),
            feature_index:
                track.feature_index === "all" || track.feature_index == null
                    ? "all"
                    : Math.round(finiteNumber(track.feature_index)),
            targetMode: all ? "all" : tags.length > 0 ? "tags" : "devices",
            match: {
                device_ids: deviceIds,
                tags,
                node_ids: nodeIds,
                all,
            },
            tagsText: tags.join(", "),
            keyframes:
                keyframes.length > 0
                    ? keyframes
                    : [
                          {
                              key: createId("keyframe"),
                              at_ms: 0,
                              value: 0,
                              easing: "linear",
                          },
                      ],
        };
    });
}

function buildFeatureCatalog(devices: LovenseDeviceInfo[]): FeatureCatalog {
    const catalog: FeatureCatalog = new Map();
    for (const device of devices) {
        for (const feature of device.features ?? []) {
            for (const output of Object.keys(feature.outputs ?? {})) {
                let features = catalog.get(output);
                if (!features) {
                    features = new Map();
                    catalog.set(output, features);
                }
                let entry = features.get(feature.index);
                if (!entry) {
                    entry = { descriptions: new Set(), deviceIds: new Set() };
                    features.set(feature.index, entry);
                }
                entry.deviceIds.add(device.id);
                if (feature.description)
                    entry.descriptions.add(feature.description);
            }
        }
    }
    return catalog;
}

function formatDuration(durationMs: number) {
    if (!Number.isFinite(durationMs) || durationMs <= 0) return "0 ms";
    if (durationMs < 1000) return `${Math.round(durationMs)} ms`;
    if (durationMs < 60_000) {
        const seconds = durationMs / 1000;
        return `${seconds.toFixed(Number.isInteger(seconds) ? 0 : 1)} s`;
    }
    const minutes = Math.floor(durationMs / 60_000);
    const seconds = Math.round((durationMs % 60_000) / 1000);
    return `${minutes}m ${seconds}s`;
}

function validatePattern(
    tracks: TrackDraft[],
    durationMs: number,
    maxIntensity: number,
    bpm: number,
    fadeIn: number,
    fadeOut: number,
    jitter: number,
) {
    if (tracks.length === 0) return "Add at least one track before saving.";
    if (tracks.length > MAX_TRACKS)
        return `A pattern can have at most ${MAX_TRACKS} tracks.`;
    if (!Number.isFinite(durationMs) || durationMs <= 0) {
        return "The pattern duration must be greater than 0 ms.";
    }
    if (durationMs > MAX_DURATION_MS) {
        return `The pattern duration cannot exceed ${MAX_DURATION_MS} ms.`;
    }
    if (
        !Number.isFinite(maxIntensity) ||
        maxIntensity < 0 ||
        maxIntensity > 100
    ) {
        return "Maximum intensity must be between 0 and 100%.";
    }
    if (!Number.isFinite(bpm) || (bpm !== 0 && (bpm < 20 || bpm > 300))) {
        return "BPM must be 0 (free) or between 20 and 300.";
    }
    if (!Number.isFinite(fadeIn) || fadeIn < 0 || fadeIn > 10_000) {
        return "Fade in must be between 0 and 10000 ms.";
    }
    if (!Number.isFinite(fadeOut) || fadeOut < 0 || fadeOut > 10_000) {
        return "Fade out must be between 0 and 10000 ms.";
    }
    if (!Number.isFinite(jitter) || jitter < 0 || jitter > 50) {
        return "Jitter must be between 0 and 50%.";
    }

    for (let trackIndex = 0; trackIndex < tracks.length; trackIndex += 1) {
        const track = tracks[trackIndex];
        if (!track) return `Track ${trackIndex + 1} is invalid.`;
        if (!track.output.trim())
            return `Track ${trackIndex + 1} needs an output.`;
        if (
            track.feature_index !== "all" &&
            (!Number.isInteger(track.feature_index) || track.feature_index < 0)
        ) {
            return `Track ${trackIndex + 1} has an invalid feature index.`;
        }
        if (track.keyframes.length === 0) {
            return `Track ${trackIndex + 1} needs at least one keyframe.`;
        }
        if (track.keyframes.length > MAX_KEYFRAMES) {
            return `Track ${trackIndex + 1} can have at most ${MAX_KEYFRAMES} keyframes.`;
        }

        let previousTime = -1;
        for (const keyframe of track.keyframes) {
            if (
                !Number.isFinite(keyframe.at_ms) ||
                keyframe.at_ms < 0 ||
                keyframe.at_ms > MAX_DURATION_MS
            ) {
                return `Track ${trackIndex + 1} has a keyframe outside 0..${MAX_DURATION_MS} ms.`;
            }
            if (keyframe.at_ms < previousTime) {
                return `Track ${trackIndex + 1} keyframes must be sorted by time.`;
            }
            if (
                !Number.isFinite(keyframe.value) ||
                keyframe.value < 0 ||
                keyframe.value > 100
            ) {
                return `Track ${trackIndex + 1} keyframe values must be between 0 and 100%.`;
            }
            previousTime = keyframe.at_ms;
        }
    }
    return null;
}

function timelineDuration(track: TrackDraft) {
    const lastKeyframeMs = Math.max(
        0,
        ...track.keyframes.map((keyframe) =>
            Number.isFinite(keyframe.at_ms) ? Math.max(0, keyframe.at_ms) : 0,
        ),
    );
    return lastKeyframeMs > 0 ? lastKeyframeMs : MIN_TIMELINE_DURATION_MS;
}

function timelinePosition(
    clientX: number,
    clientY: number,
    rect: DOMRect,
    durationMs: number,
) {
    const paddingX = (rect.width * TIMELINE_PADDING_X) / TIMELINE_WIDTH;
    const paddingTop = (rect.height * TIMELINE_PADDING_TOP) / TIMELINE_HEIGHT;
    const paddingBottom =
        (rect.height * TIMELINE_PADDING_BOTTOM) / TIMELINE_HEIGHT;
    const plotWidth = Math.max(1, rect.width - paddingX * 2);
    const plotHeight = Math.max(1, rect.height - paddingTop - paddingBottom);
    const timeRatio = clamp((clientX - rect.left - paddingX) / plotWidth, 0, 1);
    const valueRatio = clamp(
        (clientY - rect.top - paddingTop) / plotHeight,
        0,
        1,
    );
    return {
        at_ms: Math.round(timeRatio * durationMs),
        value: Math.round((1 - valueRatio) * 100),
    };
}

function TrackTimeline({
    track,
    selectedKeyframeId,
    readOnly,
    onSelect,
    onChange,
    onAdd,
}: {
    track: TrackDraft;
    selectedKeyframeId: string | null;
    readOnly: boolean;
    onSelect: (keyframeId: string) => void;
    onChange: (
        keyframeId: string,
        patch: Partial<Pick<KeyframeDraft, "at_ms" | "value">>,
    ) => void;
    onAdd: (atMs: number, value: number) => void;
}) {
    const timelineRef = useRef<HTMLDivElement>(null);
    const durationMs = timelineDuration(track);
    const definition = {
        tracks: [
            {
                keyframes: track.keyframes.map((keyframe) => ({
                    at_ms: keyframe.at_ms,
                    value: keyframe.value / 100,
                    easing: keyframe.easing,
                })),
            },
        ],
    };

    const updateFromPointer = (
        event: ReactPointerEvent<HTMLButtonElement>,
        keyframeId: string,
    ) => {
        if (readOnly || !event.currentTarget.hasPointerCapture(event.pointerId))
            return;
        const rect = timelineRef.current?.getBoundingClientRect();
        if (!rect) return;
        onChange(
            keyframeId,
            timelinePosition(event.clientX, event.clientY, rect, durationMs),
        );
    };

    const nudge = (
        event: ReactKeyboardEvent<HTMLButtonElement>,
        keyframe: KeyframeDraft,
    ) => {
        if (readOnly) return;
        const direction = event.key;
        if (
            !["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(
                direction,
            )
        )
            return;
        event.preventDefault();
        if (direction === "ArrowLeft" || direction === "ArrowRight") {
            const amount =
                (event.shiftKey ? 100 : 10) *
                (direction === "ArrowLeft" ? -1 : 1);
            onChange(keyframe.key, {
                at_ms: clamp(keyframe.at_ms + amount, 0, MAX_DURATION_MS),
            });
        } else {
            const amount =
                (event.shiftKey ? 10 : 1) *
                (direction === "ArrowDown" ? -1 : 1);
            onChange(keyframe.key, {
                value: clamp(keyframe.value + amount, 0, 100),
            });
        }
    };

    return (
        <div>
            <div
                ref={timelineRef}
                className="relative h-44 w-full touch-pan-y overflow-hidden rounded-xl border bg-background/80 select-none sm:h-52"
                onDoubleClick={(event) => {
                    if (readOnly) return;
                    const position = timelinePosition(
                        event.clientX,
                        event.clientY,
                        event.currentTarget.getBoundingClientRect(),
                        durationMs,
                    );
                    onAdd(position.at_ms, position.value);
                }}
            >
                <PatternWaveform
                    definition={definition}
                    className="pointer-events-none absolute inset-0 h-full w-full"
                />

                {track.keyframes.map((keyframe) => {
                    const atMs = Number.isFinite(keyframe.at_ms)
                        ? Math.max(0, keyframe.at_ms)
                        : 0;
                    const value = Number.isFinite(keyframe.value)
                        ? clamp(keyframe.value, 0, 100)
                        : 0;
                    const x =
                        TIMELINE_PADDING_X +
                        clamp(atMs / durationMs, 0, 1) * TIMELINE_PLOT_WIDTH;
                    const y =
                        TIMELINE_PADDING_TOP +
                        (1 - value / 100) * TIMELINE_PLOT_HEIGHT;
                    const selected = selectedKeyframeId === keyframe.key;
                    return (
                        <button
                            key={keyframe.key}
                            type="button"
                            aria-label={`Keyframe at ${keyframe.at_ms} ms, ${keyframe.value}%`}
                            aria-pressed={selected}
                            title={`${keyframe.at_ms} ms · ${keyframe.value}%`}
                            className="absolute z-10 flex size-8 -translate-x-1/2 -translate-y-1/2 cursor-grab items-center justify-center rounded-full outline-none active:cursor-grabbing disabled:cursor-default"
                            style={{
                                left: `${(x / TIMELINE_WIDTH) * 100}%`,
                                top: `${(y / TIMELINE_HEIGHT) * 100}%`,
                                touchAction: "none",
                            }}
                            onPointerDown={(event) => {
                                if (
                                    event.pointerType === "mouse" &&
                                    event.button !== 0
                                )
                                    return;
                                onSelect(keyframe.key);
                                if (readOnly) return;
                                event.currentTarget.focus({
                                    preventScroll: true,
                                });
                                event.currentTarget.setPointerCapture(
                                    event.pointerId,
                                );
                            }}
                            onPointerMove={(event) =>
                                updateFromPointer(event, keyframe.key)
                            }
                            onPointerUp={(event) => {
                                if (
                                    event.currentTarget.hasPointerCapture(
                                        event.pointerId,
                                    )
                                ) {
                                    event.currentTarget.releasePointerCapture(
                                        event.pointerId,
                                    );
                                }
                            }}
                            onDoubleClick={(event) => event.stopPropagation()}
                            onKeyDown={(event) => nudge(event, keyframe)}
                        >
                            <span
                                className={cn(
                                    "pointer-events-none size-3 rounded-full border-2 border-background bg-violet-500 shadow-sm ring-1 ring-violet-500/30 transition-transform dark:bg-violet-400",
                                    selected &&
                                        "scale-125 border-white ring-4 ring-violet-500/25 dark:border-violet-950",
                                )}
                            />
                        </button>
                    );
                })}
            </div>
            <div className="mt-1.5 flex items-center justify-between font-mono text-[9px] text-muted-foreground tabular-nums">
                <span>0 ms</span>
                <span>{formatDuration(durationMs / 2)}</span>
                <span>{formatDuration(durationMs)}</span>
            </div>
        </div>
    );
}

export function PatternEditor({
    open,
    detail,
    devices,
    onOpenChange,
    onSaved,
}: {
    open: boolean;
    detail: LovensePatternDetail | null;
    devices: LovenseDeviceInfo[];
    onOpenChange: (open: boolean) => void;
    onSaved: () => void;
}) {
    const { sendCommand } = useWebSocket();
    const [name, setName] = useState("New pattern");
    const [description, setDescription] = useState("");
    const [tags, setTags] = useState("");
    const [loop, setLoop] = useState(false);
    const [maxIntensity, setMaxIntensity] = useState(80);
    const [bpm, setBpm] = useState(0);
    const [fadeIn, setFadeIn] = useState(0);
    const [fadeOut, setFadeOut] = useState(0);
    const [jitter, setJitter] = useState(0);
    const [tracks, setTracks] = useState<TrackDraft[]>(() => [defaultTrack()]);
    const [selection, setSelection] = useState<Selection | null>(null);
    const [saving, setSaving] = useState(false);
    const [duplicating, setDuplicating] = useState(false);
    const [showValidation, setShowValidation] = useState(false);
    const builtIn = Boolean(detail?.built_in);

    useEffect(() => {
        if (!open) return;
        const definition = isRecord(detail?.definition)
            ? detail.definition
            : {};
        setName(detail?.name ?? String(definition.name ?? "New pattern"));
        setDescription(
            String(detail?.description ?? definition.description ?? ""),
        );
        const definitionTags = Array.isArray(definition.tags)
            ? definition.tags.map(String)
            : [];
        setTags((detail?.tags ?? definitionTags).join(", "));
        setLoop(Boolean(definition.loop ?? false));
        setMaxIntensity(finiteNumber(definition.max_intensity_pct, 80));
        setBpm(finiteNumber(definition.bpm, 0));
        setFadeIn(finiteNumber(definition.fade_in_ms, 0));
        setFadeOut(finiteNumber(definition.fade_out_ms, 0));
        setJitter(finiteNumber(definition.jitter_pct, 0));
        setTracks(readTracks(detail));
        setSelection(null);
        setShowValidation(false);
    }, [open, detail]);

    const featureCatalog = useMemo(
        () => buildFeatureCatalog(devices),
        [devices],
    );
    const outputOptions = useMemo(() => {
        const discovered = new Set(featureCatalog.keys());
        if (discovered.size === 0) return OUTPUTS;
        const classic = OUTPUTS.filter((output) => discovered.delete(output));
        return [
            ...classic,
            ...[...discovered].sort((a, b) => a.localeCompare(b)),
        ];
    }, [featureCatalog]);
    const patternTags = useMemo(() => parseTags(tags), [tags]);
    const durationMs = useMemo(
        () =>
            Math.max(
                0,
                ...tracks.flatMap((track) =>
                    track.keyframes.map((keyframe) =>
                        Number.isFinite(keyframe.at_ms)
                            ? Math.max(0, keyframe.at_ms)
                            : 0,
                    ),
                ),
            ),
        [tracks],
    );
    const validationError = validatePattern(
        tracks,
        durationMs,
        maxIntensity,
        bpm,
        fadeIn,
        fadeOut,
        jitter,
    );
    const title = detail
        ? builtIn
            ? `${detail.name} (built-in)`
            : detail.name
        : "New pattern";

    const definition = useMemo<Record<string, unknown>>(
        () => ({
            version: 1,
            name: name.trim() || "Untitled pattern",
            description,
            loop,
            bpm: bpm > 0 ? Math.round(bpm) : null,
            max_intensity_pct: Math.round(maxIntensity),
            fade_in_ms: Math.round(fadeIn),
            fade_out_ms: Math.round(fadeOut),
            jitter_pct: Math.round(jitter),
            tags: patternTags,
            tracks: tracks.map((track) => ({
                id: track.id,
                output: track.output,
                feature_index: track.feature_index,
                match: {
                    device_ids: track.match.device_ids,
                    tags: track.match.tags,
                    node_ids: track.match.node_ids,
                    all: track.match.all,
                },
                keyframes: [...track.keyframes]
                    .sort((a, b) => a.at_ms - b.at_ms)
                    .map((keyframe) => ({
                        at_ms: Math.round(keyframe.at_ms),
                        value: keyframe.value / 100,
                        easing: keyframe.easing,
                    })),
            })),
        }),
        [
            name,
            description,
            loop,
            bpm,
            maxIntensity,
            fadeIn,
            fadeOut,
            jitter,
            patternTags,
            tracks,
        ],
    );

    const updateTrack = (trackId: string, patch: Partial<TrackDraft>) => {
        setTracks((current) =>
            current.map((track) =>
                track.id === trackId ? { ...track, ...patch } : track,
            ),
        );
    };

    const updateKeyframe = (
        trackId: string,
        keyframeId: string,
        patch: Partial<KeyframeDraft>,
    ) => {
        setTracks((current) =>
            current.map((track) => {
                if (track.id !== trackId) return track;
                const keyframes = track.keyframes
                    .map((keyframe) =>
                        keyframe.key === keyframeId
                            ? { ...keyframe, ...patch }
                            : keyframe,
                    )
                    .sort((a, b) => a.at_ms - b.at_ms);
                return { ...track, keyframes };
            }),
        );
    };

    const addKeyframe = (trackId: string, atMs?: number, value?: number) => {
        const track = tracks.find((item) => item.id === trackId);
        if (builtIn || !track || track.keyframes.length >= MAX_KEYFRAMES)
            return;
        const keyframeId = createId("keyframe");
        setTracks((current) =>
            current.map((track) => {
                if (track.id !== trackId) return track;
                const lastTime = Math.max(
                    0,
                    ...track.keyframes.map((keyframe) =>
                        Number.isFinite(keyframe.at_ms) ? keyframe.at_ms : 0,
                    ),
                );
                const last = track.keyframes[track.keyframes.length - 1];
                const keyframes = [
                    ...track.keyframes,
                    {
                        key: keyframeId,
                        at_ms: clamp(
                            Math.round(atMs ?? lastTime + 1000),
                            0,
                            MAX_DURATION_MS,
                        ),
                        value:
                            value ??
                            (last && Number.isFinite(last.value)
                                ? clamp(last.value, 0, 100)
                                : 50),
                        easing: "linear" as const,
                    },
                ].sort((a, b) => a.at_ms - b.at_ms);
                return { ...track, keyframes };
            }),
        );
        setSelection({ trackId, keyframeId });
    };

    const deleteKeyframe = (track: TrackDraft, keyframeId: string) => {
        if (track.keyframes.length <= 1) return;
        const index = track.keyframes.findIndex(
            (keyframe) => keyframe.key === keyframeId,
        );
        const remaining = track.keyframes.filter(
            (keyframe) => keyframe.key !== keyframeId,
        );
        updateTrack(track.id, { keyframes: remaining });
        const next =
            remaining[Math.min(Math.max(0, index), remaining.length - 1)];
        setSelection(next ? { trackId: track.id, keyframeId: next.key } : null);
    };

    const addTrack = () => {
        const track = defaultTrack(
            durationMs > 0 ? durationMs : 5000,
            outputOptions[0],
        );
        setTracks((current) => [...current, track]);
        const firstKeyframe = track.keyframes[0];
        setSelection(
            firstKeyframe
                ? { trackId: track.id, keyframeId: firstKeyframe.key }
                : null,
        );
    };

    const duplicateTrack = (trackId: string) => {
        const source = tracks.find((track) => track.id === trackId);
        if (!source) return;
        const duplicate: TrackDraft = {
            ...source,
            id: createId("track"),
            match: {
                device_ids: [...source.match.device_ids],
                tags: [...source.match.tags],
                node_ids: [...source.match.node_ids],
                all: source.match.all,
            },
            keyframes: source.keyframes.map((keyframe) => ({
                ...keyframe,
                key: createId("keyframe"),
            })),
        };
        setTracks((current) => {
            const index = current.findIndex((track) => track.id === trackId);
            if (index < 0) return current;
            const next = [...current];
            next.splice(index + 1, 0, duplicate);
            return next;
        });
        const firstKeyframe = duplicate.keyframes[0];
        setSelection(
            firstKeyframe
                ? { trackId: duplicate.id, keyframeId: firstKeyframe.key }
                : null,
        );
    };

    const deleteTrack = (trackId: string) => {
        setTracks((current) => current.filter((track) => track.id !== trackId));
        setSelection((current) =>
            current?.trackId === trackId ? null : current,
        );
    };

    const changeTarget = (track: TrackDraft, mode: TargetMode) => {
        if (mode === "all") {
            updateTrack(track.id, {
                targetMode: mode,
                match: { device_ids: [], tags: [], node_ids: [], all: true },
                tagsText: "",
            });
        } else if (mode === "devices") {
            updateTrack(track.id, {
                targetMode: mode,
                match: {
                    device_ids: track.match.device_ids,
                    tags: [],
                    node_ids: [],
                    all: false,
                },
                tagsText: "",
            });
        } else {
            updateTrack(track.id, {
                targetMode: mode,
                match: {
                    device_ids: [],
                    tags: track.match.tags,
                    node_ids: [],
                    all: false,
                },
                tagsText: track.match.tags.join(", "),
            });
        }
    };

    const save = async () => {
        if (builtIn) return;
        if (validationError) {
            setShowValidation(true);
            toast.error(validationError);
            return;
        }
        if (name.trim().length > 80) {
            setShowValidation(true);
            toast.error("Pattern name cannot exceed 80 characters.");
            return;
        }

        setSaving(true);
        try {
            const result = await sendCommand("lovense:pattern_save", {
                pattern_id: detail?.id ?? null,
                name: name.trim() || "Untitled pattern",
                description,
                visibility: detail?.visibility ?? "private",
                tags: patternTags,
                definition,
            });
            if (result.status !== "ok") {
                toast.error(result.message ?? "Failed to save pattern");
                return;
            }
            toast.success("Pattern saved");
            onSaved();
            onOpenChange(false);
        } catch (error) {
            toast.error(
                error instanceof Error
                    ? error.message
                    : "Failed to save pattern",
            );
        } finally {
            setSaving(false);
        }
    };

    const duplicate = async () => {
        if (!detail) return;
        setDuplicating(true);
        try {
            const result = await sendCommand("lovense:pattern_duplicate", {
                pattern_id: detail.id,
                name: `${detail.name} copy`.slice(0, 80),
            });
            if (result.status !== "ok") {
                toast.error(result.message ?? "Failed to duplicate pattern");
                return;
            }
            toast.success("Pattern duplicated — reopen it to edit");
            onSaved();
            onOpenChange(false);
        } catch (error) {
            toast.error(
                error instanceof Error
                    ? error.message
                    : "Failed to duplicate pattern",
            );
        } finally {
            setDuplicating(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="flex h-[92dvh] max-h-[92dvh] w-[calc(100%-1rem)] max-w-[calc(100%-1rem)] flex-col gap-0 overflow-hidden p-0 sm:max-w-6xl">
                <DialogHeader className="shrink-0 border-b px-4 py-4 pr-12 sm:px-6 sm:py-5">
                    <DialogTitle className="flex flex-wrap items-center gap-2 text-base sm:text-lg">
                        {title}
                        {builtIn && (
                            <Badge variant="outline" className="text-[9px]">
                                BUILT-IN
                            </Badge>
                        )}
                    </DialogTitle>
                    <DialogDescription className="text-xs sm:text-sm">
                        Shape each output with draggable keyframes. Values are
                        percentages; device and server intensity caps still
                        apply.
                    </DialogDescription>
                    <div className="flex flex-wrap gap-1.5 pt-1 text-[10px] text-muted-foreground">
                        <Badge variant="secondary">
                            {formatDuration(durationMs)}
                        </Badge>
                        <Badge variant="secondary">
                            {tracks.length}{" "}
                            {tracks.length === 1 ? "track" : "tracks"}
                        </Badge>
                        <Badge variant="secondary">
                            {loop ? "Looping" : "Play once"}
                        </Badge>
                    </div>
                </DialogHeader>

                <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4 sm:px-6 sm:py-5">
                    <fieldset
                        disabled={builtIn}
                        className="min-w-0 space-y-5 border-0 p-0"
                    >
                        {builtIn && (
                            <div className="rounded-xl border border-violet-500/20 bg-violet-500/5 px-3 py-2.5 text-xs text-muted-foreground">
                                This built-in pattern is read-only. Use{" "}
                                <strong className="text-foreground">
                                    Duplicate to edit
                                </strong>{" "}
                                to create an editable copy.
                            </div>
                        )}

                        <section className="rounded-2xl border bg-card p-3.5 sm:p-4">
                            <div className="mb-3">
                                <h3 className="text-sm font-semibold">
                                    Pattern settings
                                </h3>
                                <p className="mt-0.5 text-[11px] text-muted-foreground">
                                    The essentials used to identify and play
                                    this pattern.
                                </p>
                            </div>
                            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                                <label className="space-y-1.5 sm:col-span-2">
                                    <Label htmlFor="pattern-name">Name</Label>
                                    <Input
                                        id="pattern-name"
                                        value={name}
                                        maxLength={80}
                                        onChange={(event) =>
                                            setName(event.target.value)
                                        }
                                    />
                                </label>
                                <label className="space-y-1.5">
                                    <Label htmlFor="pattern-max-intensity">
                                        Max intensity %
                                    </Label>
                                    <Input
                                        id="pattern-max-intensity"
                                        type="number"
                                        min={0}
                                        max={100}
                                        value={numberInputValue(maxIntensity)}
                                        onChange={(event) =>
                                            setMaxIntensity(
                                                event.target.valueAsNumber,
                                            )
                                        }
                                    />
                                </label>
                                <label className="flex min-h-9 items-end gap-2 pb-2 text-xs font-medium">
                                    <input
                                        type="checkbox"
                                        className="size-4 accent-violet-600"
                                        checked={loop}
                                        onChange={(event) =>
                                            setLoop(event.target.checked)
                                        }
                                    />
                                    Loop the pattern
                                </label>
                                <label className="space-y-1.5 sm:col-span-2 lg:col-span-4">
                                    <Label htmlFor="pattern-description">
                                        Description
                                    </Label>
                                    <Textarea
                                        id="pattern-description"
                                        value={description}
                                        rows={2}
                                        maxLength={500}
                                        placeholder="What does this pattern feel like?"
                                        onChange={(event) =>
                                            setDescription(event.target.value)
                                        }
                                    />
                                </label>
                                <label className="space-y-1.5 sm:col-span-2 lg:col-span-4">
                                    <Label htmlFor="pattern-tags">Tags</Label>
                                    <Input
                                        id="pattern-tags"
                                        value={tags}
                                        placeholder="tease, reward"
                                        onChange={(event) =>
                                            setTags(event.target.value)
                                        }
                                    />
                                </label>
                            </div>

                            <details className="group mt-4 rounded-xl border bg-muted/20 px-3 py-2.5">
                                <summary className="cursor-pointer text-xs font-medium text-muted-foreground group-open:text-foreground">
                                    Advanced timing & variation
                                </summary>
                                <div className="mt-3 grid grid-cols-2 gap-3 lg:grid-cols-4">
                                    <label className="space-y-1.5">
                                        <Label htmlFor="pattern-bpm">
                                            BPM (0 = free)
                                        </Label>
                                        <Input
                                            id="pattern-bpm"
                                            type="number"
                                            min={0}
                                            max={300}
                                            value={numberInputValue(bpm)}
                                            onChange={(event) =>
                                                setBpm(
                                                    event.target.valueAsNumber,
                                                )
                                            }
                                        />
                                    </label>
                                    <label className="space-y-1.5">
                                        <Label htmlFor="pattern-fade-in">
                                            Fade in (ms)
                                        </Label>
                                        <Input
                                            id="pattern-fade-in"
                                            type="number"
                                            min={0}
                                            max={10000}
                                            value={numberInputValue(fadeIn)}
                                            onChange={(event) =>
                                                setFadeIn(
                                                    event.target.valueAsNumber,
                                                )
                                            }
                                        />
                                    </label>
                                    <label className="space-y-1.5">
                                        <Label htmlFor="pattern-fade-out">
                                            Fade out (ms)
                                        </Label>
                                        <Input
                                            id="pattern-fade-out"
                                            type="number"
                                            min={0}
                                            max={10000}
                                            value={numberInputValue(fadeOut)}
                                            onChange={(event) =>
                                                setFadeOut(
                                                    event.target.valueAsNumber,
                                                )
                                            }
                                        />
                                    </label>
                                    <label className="space-y-1.5">
                                        <Label htmlFor="pattern-jitter">
                                            Jitter %
                                        </Label>
                                        <Input
                                            id="pattern-jitter"
                                            type="number"
                                            min={0}
                                            max={50}
                                            value={numberInputValue(jitter)}
                                            onChange={(event) =>
                                                setJitter(
                                                    event.target.valueAsNumber,
                                                )
                                            }
                                        />
                                    </label>
                                </div>
                            </details>
                        </section>

                        <section className="overflow-hidden rounded-2xl border bg-card">
                            <div className="flex items-center justify-between gap-3 border-b px-3.5 py-3 sm:px-4">
                                <div>
                                    <h3 className="text-sm font-semibold">
                                        Live preview
                                    </h3>
                                    <p className="mt-0.5 text-[11px] text-muted-foreground">
                                        All tracks share one time scale;
                                        secondary tracks are faded.
                                    </p>
                                </div>
                                <Badge
                                    variant="outline"
                                    className="shrink-0 text-[10px]"
                                >
                                    {formatDuration(durationMs)}
                                </Badge>
                            </div>
                            <div className="bg-muted/20 px-1 py-2 sm:px-3">
                                <PatternWaveform
                                    definition={definition}
                                    className="h-40 w-full sm:h-48"
                                />
                            </div>
                        </section>

                        <section className="space-y-3">
                            <div className="flex flex-wrap items-end justify-between gap-2">
                                <div>
                                    <h3 className="text-sm font-semibold">
                                        Tracks
                                    </h3>
                                    <p className="mt-0.5 text-[11px] text-muted-foreground">
                                        Double-click the timeline to add a
                                        point. Drag points with a mouse or
                                        touch; arrow keys also nudge them.
                                    </p>
                                </div>
                                <Button
                                    type="button"
                                    variant="secondary"
                                    size="sm"
                                    onClick={addTrack}
                                    disabled={tracks.length >= MAX_TRACKS}
                                >
                                    <Plus className="size-3.5" />
                                    Add track
                                </Button>
                            </div>

                            {devices.length === 0 && (
                                <p className="rounded-lg border border-dashed px-3 py-2 text-[11px] text-muted-foreground">
                                    No devices are currently available. Generic
                                    outputs and “all features” remain editable
                                    and will resolve when compatible devices
                                    connect.
                                </p>
                            )}

                            {tracks.map((track, trackIndex) => {
                                const targetMode = track.targetMode;
                                const selectedKeyframe =
                                    selection?.trackId === track.id
                                        ? track.keyframes.find(
                                              (keyframe) =>
                                                  keyframe.key ===
                                                  selection.keyframeId,
                                          )
                                        : undefined;
                                const discoveredFeatures = featureCatalog.get(
                                    track.output,
                                );
                                const featureIndexes = [
                                    ...(discoveredFeatures?.keys() ?? []),
                                ].sort((a, b) => a - b);
                                if (
                                    typeof track.feature_index === "number" &&
                                    !featureIndexes.includes(
                                        track.feature_index,
                                    )
                                ) {
                                    featureIndexes.push(track.feature_index);
                                    featureIndexes.sort((a, b) => a - b);
                                }
                                const trackOutputs = outputOptions.includes(
                                    track.output,
                                )
                                    ? outputOptions
                                    : [track.output, ...outputOptions];
                                const knownDeviceIds = new Set(
                                    devices.map((device) => device.id),
                                );
                                const savedOnlyDeviceIds =
                                    track.match.device_ids.filter(
                                        (deviceId) =>
                                            !knownDeviceIds.has(deviceId),
                                    );

                                return (
                                    <article
                                        key={track.id}
                                        className="overflow-hidden rounded-2xl border bg-card shadow-xs"
                                    >
                                        <header className="flex items-center gap-2 border-b bg-muted/20 px-3 py-2.5 sm:px-4">
                                            <Badge
                                                variant="outline"
                                                className="font-mono text-[10px]"
                                            >
                                                {String(
                                                    trackIndex + 1,
                                                ).padStart(2, "0")}
                                            </Badge>
                                            <div className="min-w-0 flex-1">
                                                <h4 className="truncate text-xs font-semibold sm:text-sm">
                                                    {track.output}
                                                </h4>
                                                <p className="truncate text-[10px] text-muted-foreground">
                                                    {track.keyframes.length}{" "}
                                                    keyframes ·{" "}
                                                    {targetMode === "all"
                                                        ? "All devices"
                                                        : targetMode === "tags"
                                                          ? "Tag targets"
                                                          : "Selected devices"}
                                                </p>
                                            </div>
                                            <Button
                                                type="button"
                                                variant="ghost"
                                                size="icon-sm"
                                                aria-label={`Duplicate track ${trackIndex + 1}`}
                                                title="Duplicate track"
                                                onClick={() =>
                                                    duplicateTrack(track.id)
                                                }
                                                disabled={
                                                    tracks.length >= MAX_TRACKS
                                                }
                                            >
                                                <Copy className="size-3.5" />
                                            </Button>
                                            <Button
                                                type="button"
                                                variant="ghost"
                                                size="icon-sm"
                                                aria-label={`Delete track ${trackIndex + 1}`}
                                                title={
                                                    tracks.length <= 1
                                                        ? "A pattern needs at least one track"
                                                        : "Delete track"
                                                }
                                                className="text-destructive hover:text-destructive"
                                                disabled={tracks.length <= 1}
                                                onClick={() =>
                                                    deleteTrack(track.id)
                                                }
                                            >
                                                <Trash2 className="size-3.5" />
                                            </Button>
                                        </header>

                                        <div className="grid grid-cols-1 gap-3 border-b p-3 sm:grid-cols-3 sm:p-4">
                                            <label className="space-y-1.5">
                                                <Label>Output</Label>
                                                <select
                                                    className={SELECT_CLASS}
                                                    value={track.output}
                                                    onChange={(event) => {
                                                        const output =
                                                            event.target.value;
                                                        const supported =
                                                            featureCatalog.get(
                                                                output,
                                                            );
                                                        updateTrack(track.id, {
                                                            output,
                                                            feature_index:
                                                                track.feature_index ===
                                                                    "all" ||
                                                                supported?.has(
                                                                    track.feature_index,
                                                                )
                                                                    ? track.feature_index
                                                                    : "all",
                                                        });
                                                    }}
                                                >
                                                    {trackOutputs.map(
                                                        (output) => (
                                                            <option
                                                                key={output}
                                                                value={output}
                                                            >
                                                                {output}
                                                            </option>
                                                        ),
                                                    )}
                                                </select>
                                            </label>

                                            <label className="space-y-1.5">
                                                <Label>Motor / feature</Label>
                                                <select
                                                    className={SELECT_CLASS}
                                                    value={String(
                                                        track.feature_index,
                                                    )}
                                                    onChange={(event) =>
                                                        updateTrack(track.id, {
                                                            feature_index:
                                                                event.target
                                                                    .value ===
                                                                "all"
                                                                    ? "all"
                                                                    : Number(
                                                                          event
                                                                              .target
                                                                              .value,
                                                                      ),
                                                        })
                                                    }
                                                >
                                                    <option value="all">
                                                        All motors / features
                                                    </option>
                                                    {featureIndexes.map(
                                                        (featureIndex) => {
                                                            const entry =
                                                                discoveredFeatures?.get(
                                                                    featureIndex,
                                                                );
                                                            const descriptions =
                                                                entry
                                                                    ? [
                                                                          ...entry.descriptions,
                                                                      ]
                                                                    : [];
                                                            const base =
                                                                track.output ===
                                                                "Vibrate"
                                                                    ? `Motor ${featureIndex + 1}`
                                                                    : `Feature ${featureIndex + 1}`;
                                                            const saved =
                                                                !entry &&
                                                                devices.length >
                                                                    0
                                                                    ? " (saved)"
                                                                    : "";
                                                            return (
                                                                <option
                                                                    key={
                                                                        featureIndex
                                                                    }
                                                                    value={
                                                                        featureIndex
                                                                    }
                                                                >
                                                                    {base}
                                                                    {descriptions.length >
                                                                    0
                                                                        ? ` · ${descriptions[0]}`
                                                                        : ""}
                                                                    {saved}
                                                                </option>
                                                            );
                                                        },
                                                    )}
                                                </select>
                                            </label>

                                            <label className="space-y-1.5">
                                                <Label>Target devices</Label>
                                                <select
                                                    className={SELECT_CLASS}
                                                    value={targetMode}
                                                    onChange={(event) =>
                                                        changeTarget(
                                                            track,
                                                            event.target
                                                                .value as TargetMode,
                                                        )
                                                    }
                                                >
                                                    <option value="all">
                                                        All devices
                                                    </option>
                                                    <option value="devices">
                                                        Device IDs
                                                    </option>
                                                    <option value="tags">
                                                        Device tags
                                                    </option>
                                                </select>
                                            </label>

                                            {targetMode === "devices" && (
                                                <div className="space-y-2 rounded-xl border bg-muted/20 p-3 sm:col-span-3">
                                                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                                                        {devices.map(
                                                            (device) => (
                                                                <label
                                                                    key={
                                                                        device.id
                                                                    }
                                                                    className="flex min-w-0 cursor-pointer items-center gap-2 text-xs"
                                                                >
                                                                    <input
                                                                        type="checkbox"
                                                                        className="size-4 shrink-0 accent-violet-600"
                                                                        checked={track.match.device_ids.includes(
                                                                            device.id,
                                                                        )}
                                                                        onChange={(
                                                                            event,
                                                                        ) => {
                                                                            const selected =
                                                                                new Set(
                                                                                    track.match.device_ids,
                                                                                );
                                                                            if (
                                                                                event
                                                                                    .target
                                                                                    .checked
                                                                            ) {
                                                                                selected.add(
                                                                                    device.id,
                                                                                );
                                                                            } else {
                                                                                selected.delete(
                                                                                    device.id,
                                                                                );
                                                                            }
                                                                            updateTrack(
                                                                                track.id,
                                                                                {
                                                                                    match: {
                                                                                        device_ids:
                                                                                            [
                                                                                                ...selected,
                                                                                            ],
                                                                                        tags: [],
                                                                                        node_ids:
                                                                                            [],
                                                                                        all: false,
                                                                                    },
                                                                                },
                                                                            );
                                                                        }}
                                                                    />
                                                                    <span className="min-w-0 flex-1 truncate">
                                                                        {device.display_name ||
                                                                            device.name ||
                                                                            device.id}
                                                                    </span>
                                                                    {!device.online && (
                                                                        <span className="text-[9px] text-muted-foreground">
                                                                            offline
                                                                        </span>
                                                                    )}
                                                                </label>
                                                            ),
                                                        )}
                                                        {savedOnlyDeviceIds.map(
                                                            (deviceId) => (
                                                                <label
                                                                    key={
                                                                        deviceId
                                                                    }
                                                                    className="flex min-w-0 cursor-pointer items-center gap-2 text-xs"
                                                                >
                                                                    <input
                                                                        type="checkbox"
                                                                        className="size-4 shrink-0 accent-violet-600"
                                                                        checked
                                                                        onChange={() =>
                                                                            updateTrack(
                                                                                track.id,
                                                                                {
                                                                                    match: {
                                                                                        ...track.match,
                                                                                        device_ids:
                                                                                            track.match.device_ids.filter(
                                                                                                (
                                                                                                    id,
                                                                                                ) =>
                                                                                                    id !==
                                                                                                    deviceId,
                                                                                            ),
                                                                                    },
                                                                                },
                                                                            )
                                                                        }
                                                                    />
                                                                    <span className="truncate font-mono text-[10px]">
                                                                        {
                                                                            deviceId
                                                                        }{" "}
                                                                        (saved)
                                                                    </span>
                                                                </label>
                                                            ),
                                                        )}
                                                    </div>
                                                    {devices.length === 0 &&
                                                        savedOnlyDeviceIds.length ===
                                                            0 && (
                                                            <p className="text-[11px] text-muted-foreground">
                                                                Connect a device
                                                                to select it, or
                                                                use “All
                                                                devices” for a
                                                                portable
                                                                pattern.
                                                            </p>
                                                        )}
                                                    {track.match.node_ids
                                                        .length > 0 && (
                                                        <p className="text-[10px] text-amber-600 dark:text-amber-400">
                                                            Existing node
                                                            targets are
                                                            preserved until you
                                                            select devices or
                                                            another target mode.
                                                        </p>
                                                    )}
                                                </div>
                                            )}

                                            {targetMode === "tags" && (
                                                <label className="space-y-1.5 sm:col-span-3">
                                                    <Label>
                                                        Match tags (comma
                                                        separated)
                                                    </Label>
                                                    <Input
                                                        value={track.tagsText}
                                                        placeholder="edge2, camille"
                                                        onChange={(event) =>
                                                            updateTrack(
                                                                track.id,
                                                                {
                                                                    tagsText:
                                                                        event
                                                                            .target
                                                                            .value,
                                                                    match: {
                                                                        device_ids:
                                                                            [],
                                                                        tags: parseTags(
                                                                            event
                                                                                .target
                                                                                .value,
                                                                        ),
                                                                        node_ids:
                                                                            [],
                                                                        all: false,
                                                                    },
                                                                },
                                                            )
                                                        }
                                                    />
                                                </label>
                                            )}
                                        </div>

                                        <div className="space-y-3 p-3 sm:p-4">
                                            <div className="flex flex-wrap items-center justify-between gap-2">
                                                <span className="text-[10px] font-medium tracking-wide text-muted-foreground uppercase">
                                                    Intensity over time
                                                </span>
                                                <Button
                                                    type="button"
                                                    variant="outline"
                                                    size="xs"
                                                    onClick={() =>
                                                        addKeyframe(track.id)
                                                    }
                                                    disabled={
                                                        track.keyframes
                                                            .length >=
                                                        MAX_KEYFRAMES
                                                    }
                                                >
                                                    <Plus className="size-3" />
                                                    Keyframe
                                                </Button>
                                            </div>

                                            <TrackTimeline
                                                track={track}
                                                selectedKeyframeId={
                                                    selection?.trackId ===
                                                    track.id
                                                        ? selection.keyframeId
                                                        : null
                                                }
                                                readOnly={builtIn}
                                                onSelect={(keyframeId) =>
                                                    setSelection({
                                                        trackId: track.id,
                                                        keyframeId,
                                                    })
                                                }
                                                onChange={(keyframeId, patch) =>
                                                    updateKeyframe(
                                                        track.id,
                                                        keyframeId,
                                                        patch,
                                                    )
                                                }
                                                onAdd={(atMs, value) =>
                                                    addKeyframe(
                                                        track.id,
                                                        atMs,
                                                        value,
                                                    )
                                                }
                                            />

                                            {selectedKeyframe && (
                                                <div className="rounded-xl border border-violet-500/25 bg-violet-500/5 p-3">
                                                    <div className="mb-2.5 flex items-center justify-between gap-2">
                                                        <span className="text-xs font-semibold text-violet-700 dark:text-violet-300">
                                                            Selected keyframe
                                                        </span>
                                                        <Button
                                                            type="button"
                                                            variant="ghost"
                                                            size="xs"
                                                            className="text-destructive hover:text-destructive"
                                                            disabled={
                                                                track.keyframes
                                                                    .length <= 1
                                                            }
                                                            title={
                                                                track.keyframes
                                                                    .length <= 1
                                                                    ? "A track needs at least one keyframe"
                                                                    : "Delete keyframe"
                                                            }
                                                            onClick={() =>
                                                                deleteKeyframe(
                                                                    track,
                                                                    selectedKeyframe.key,
                                                                )
                                                            }
                                                        >
                                                            <Trash2 className="size-3" />
                                                            Delete point
                                                        </Button>
                                                    </div>
                                                    <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
                                                        <label className="space-y-1.5">
                                                            <Label>
                                                                Time (ms)
                                                            </Label>
                                                            <Input
                                                                type="number"
                                                                min={0}
                                                                max={
                                                                    MAX_DURATION_MS
                                                                }
                                                                step={10}
                                                                className="h-8 text-xs"
                                                                value={numberInputValue(
                                                                    selectedKeyframe.at_ms,
                                                                )}
                                                                onChange={(
                                                                    event,
                                                                ) =>
                                                                    updateKeyframe(
                                                                        track.id,
                                                                        selectedKeyframe.key,
                                                                        {
                                                                            at_ms: event
                                                                                .target
                                                                                .valueAsNumber,
                                                                        },
                                                                    )
                                                                }
                                                            />
                                                        </label>
                                                        <label className="space-y-1.5">
                                                            <Label>
                                                                Value (%)
                                                            </Label>
                                                            <Input
                                                                type="number"
                                                                min={0}
                                                                max={100}
                                                                className="h-8 text-xs"
                                                                value={numberInputValue(
                                                                    selectedKeyframe.value,
                                                                )}
                                                                onChange={(
                                                                    event,
                                                                ) =>
                                                                    updateKeyframe(
                                                                        track.id,
                                                                        selectedKeyframe.key,
                                                                        {
                                                                            value: event
                                                                                .target
                                                                                .valueAsNumber,
                                                                        },
                                                                    )
                                                                }
                                                            />
                                                        </label>
                                                        <label className="col-span-2 space-y-1.5 sm:col-span-1">
                                                            <Label>
                                                                Easing to next
                                                            </Label>
                                                            <select
                                                                className={cn(
                                                                    SELECT_CLASS,
                                                                    "h-8",
                                                                )}
                                                                value={
                                                                    selectedKeyframe.easing
                                                                }
                                                                onChange={(
                                                                    event,
                                                                ) =>
                                                                    updateKeyframe(
                                                                        track.id,
                                                                        selectedKeyframe.key,
                                                                        {
                                                                            easing: event
                                                                                .target
                                                                                .value as Easing,
                                                                        },
                                                                    )
                                                                }
                                                            >
                                                                {EASINGS.map(
                                                                    (
                                                                        easing,
                                                                    ) => (
                                                                        <option
                                                                            key={
                                                                                easing
                                                                            }
                                                                            value={
                                                                                easing
                                                                            }
                                                                        >
                                                                            {
                                                                                easing
                                                                            }
                                                                        </option>
                                                                    ),
                                                                )}
                                                            </select>
                                                        </label>
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    </article>
                                );
                            })}

                            {tracks.length === 0 && (
                                <div className="rounded-2xl border border-dashed p-8 text-center">
                                    <p className="text-sm font-medium">
                                        No tracks yet
                                    </p>
                                    <p className="mt-1 text-xs text-muted-foreground">
                                        Add a track to define the pattern
                                        duration and outputs.
                                    </p>
                                    <Button
                                        type="button"
                                        variant="secondary"
                                        size="sm"
                                        className="mt-4"
                                        onClick={addTrack}
                                    >
                                        <Plus className="size-3.5" />
                                        Add the first track
                                    </Button>
                                </div>
                            )}
                        </section>

                        {showValidation && validationError && (
                            <p
                                role="alert"
                                className="rounded-xl border border-destructive/30 bg-destructive/5 px-3 py-2.5 text-xs text-destructive"
                            >
                                {validationError}
                            </p>
                        )}
                    </fieldset>
                </div>

                <DialogFooter className="shrink-0 border-t bg-background px-4 py-3 sm:px-6">
                    <Button
                        type="button"
                        variant="secondary"
                        className="w-full sm:w-auto"
                        onClick={() => onOpenChange(false)}
                    >
                        Cancel
                    </Button>
                    {builtIn ? (
                        <Button
                            type="button"
                            className="w-full sm:w-auto"
                            disabled={duplicating}
                            onClick={() => void duplicate()}
                        >
                            <Copy className="size-3.5" />
                            {duplicating
                                ? "Duplicating..."
                                : "Duplicate to edit"}
                        </Button>
                    ) : (
                        <Button
                            type="button"
                            className="w-full sm:w-auto"
                            disabled={saving}
                            onClick={() => void save()}
                        >
                            <Save className="size-3.5" />
                            {saving ? "Saving..." : "Save pattern"}
                        </Button>
                    )}
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
