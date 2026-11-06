import { useEffect, useMemo, useState } from "react";
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

import { useWebSocket } from "@/hooks/useWebSocket";
import type { LovensePatternDetail } from "@/types";

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

const EASINGS = ["linear", "step", "ease-in", "ease-out", "ease-in-out", "sine"];

interface KeyframeDraft {
    at_ms: number;
    value: number;
    easing: string;
}

interface TrackDraft {
    id: string;
    output: string;
    feature_index: number | "all";
    match: {
        device_ids: string[];
        tags: string[];
        node_ids: string[];
        all: boolean;
    };
    keyframes: KeyframeDraft[];
}

function defaultTrack(): TrackDraft {
    return {
        id: `t${Date.now().toString(36)}`,
        output: "Vibrate",
        feature_index: "all",
        match: { device_ids: [], tags: [], node_ids: [], all: true },
        keyframes: [
            { at_ms: 0, value: 0, easing: "linear" },
            { at_ms: 5000, value: 50, easing: "linear" },
        ],
    };
}

function readTracks(detail: LovensePatternDetail | null): TrackDraft[] {
    const definition = (detail?.definition ?? {}) as Record<string, unknown>;
    const rawTracks = Array.isArray(definition.tracks) ? definition.tracks : [];
    if (rawTracks.length === 0) return [defaultTrack()];
    return rawTracks.map((raw, index) => {
        const track = (raw ?? {}) as Record<string, unknown>;
        const match = (track.match ?? {}) as Record<string, unknown>;
        const keyframes = Array.isArray(track.keyframes) ? track.keyframes : [];
        return {
            id: String(track.id ?? `t${index + 1}`),
            output: String(track.output ?? "Vibrate"),
            feature_index:
                track.feature_index === "all" || track.feature_index == null
                    ? "all"
                    : Number(track.feature_index),
            match: {
                device_ids: Array.isArray(match.device_ids)
                    ? match.device_ids.map(String)
                    : [],
                tags: Array.isArray(match.tags) ? match.tags.map(String) : [],
                node_ids: Array.isArray(match.node_ids)
                    ? match.node_ids.map(String)
                    : [],
                all: Boolean(match.all ?? true),
            },
            keyframes:
                keyframes.length > 0
                    ? keyframes.map(kf => {
                          const item = (kf ?? {}) as Record<string, unknown>;
                          return {
                              at_ms: Number(item.at_ms ?? 0),
                              value: Math.round(Number(item.value ?? 0) * 100),
                              easing: String(item.easing ?? "linear"),
                          };
                      })
                    : [{ at_ms: 0, value: 0, easing: "linear" }],
        };
    });
}

export function PatternEditor({
    open,
    detail,
    onOpenChange,
    onSaved,
}: {
    open: boolean;
    detail: LovensePatternDetail | null;
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
    const [tracks, setTracks] = useState<TrackDraft[]>([defaultTrack()]);
    const [saving, setSaving] = useState(false);
    const builtIn = Boolean(detail?.built_in);

    useEffect(() => {
        if (!open) return;
        const definition = (detail?.definition ?? {}) as Record<string, unknown>;
        setName(detail?.name ?? "New pattern");
        setDescription(detail?.description ?? "");
        setTags((detail?.tags ?? []).join(", "));
        setLoop(Boolean(definition.loop ?? false));
        setMaxIntensity(Number(definition.max_intensity_pct ?? 80));
        setBpm(Number(definition.bpm ?? 0));
        setFadeIn(Number(definition.fade_in_ms ?? 0));
        setFadeOut(Number(definition.fade_out_ms ?? 0));
        setJitter(Number(definition.jitter_pct ?? 0));
        setTracks(readTracks(detail));
    }, [open, detail]);

    const title = useMemo(
        () => (detail ? (builtIn ? `${detail.name} (built-in)` : detail.name) : "New pattern"),
        [detail, builtIn]
    );

    const updateTrack = (index: number, patch: Partial<TrackDraft>) => {
        setTracks(current =>
            current.map((track, i) => (i === index ? { ...track, ...patch } : track))
        );
    };

    const updateKeyframe = (
        trackIndex: number,
        kfIndex: number,
        patch: Partial<KeyframeDraft>
    ) => {
        setTracks(current =>
            current.map((track, i) =>
                i === trackIndex
                    ? {
                          ...track,
                          keyframes: track.keyframes.map((kf, j) =>
                              j === kfIndex ? { ...kf, ...patch } : kf
                          ),
                      }
                    : track
            )
        );
    };

    const definition = () => ({
        version: 1,
        name: name.trim() || "Untitled pattern",
        description,
        loop,
        bpm: bpm > 0 ? bpm : null,
        max_intensity_pct: maxIntensity,
        fade_in_ms: fadeIn,
        fade_out_ms: fadeOut,
        jitter_pct: jitter,
        tags: tags
            .split(",")
            .map(tag => tag.trim())
            .filter(Boolean),
        tracks: tracks.map(track => ({
            id: track.id,
            output: track.output,
            feature_index: track.feature_index,
            match: track.match,
            keyframes: [...track.keyframes]
                .sort((a, b) => a.at_ms - b.at_ms)
                .map(kf => ({
                    at_ms: Math.max(0, Math.round(kf.at_ms)),
                    value: Math.max(0, Math.min(100, kf.value)) / 100,
                    easing: kf.easing,
                })),
        })),
    });

    const save = async () => {
        setSaving(true);
        try {
            const result = await sendCommand("lovense:pattern_save", {
                pattern_id: builtIn ? null : (detail?.id ?? null),
                name: name.trim() || "Untitled pattern",
                description,
                visibility: detail?.visibility ?? "private",
                tags: tags
                    .split(",")
                    .map(tag => tag.trim())
                    .filter(Boolean),
                definition: definition(),
            });
            if (result.status !== "ok") {
                toast.error(result.message ?? "Failed to save pattern");
                return;
            }
            toast.success("Pattern saved");
            onSaved();
            onOpenChange(false);
        } finally {
            setSaving(false);
        }
    };

    const duplicate = async () => {
        if (!detail) return;
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
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-[900px]">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        {title}
                        {builtIn && (
                            <Badge variant="outline" className="text-[9px]">
                                BUILT-IN
                            </Badge>
                        )}
                    </DialogTitle>
                    <DialogDescription>
                        Tracks drive one output on every matching device. Values are
                        percentages of the device range; the server cap is applied.
                    </DialogDescription>
                </DialogHeader>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                    <label className="space-y-1 sm:col-span-2">
                        <Label>Name</Label>
                        <Input
                            value={name}
                            disabled={builtIn}
                            onChange={event => setName(event.target.value)}
                        />
                    </label>
                    <label className="space-y-1">
                        <Label>Tags</Label>
                        <Input
                            value={tags}
                            placeholder="tease, reward"
                            onChange={event => setTags(event.target.value)}
                        />
                    </label>
                    <label className="space-y-1 sm:col-span-3">
                        <Label>Description</Label>
                        <Textarea
                            value={description}
                            rows={2}
                            disabled={builtIn}
                            onChange={event => setDescription(event.target.value)}
                        />
                    </label>
                    <label className="space-y-1">
                        <Label>Max intensity %</Label>
                        <Input
                            type="number"
                            min={0}
                            max={100}
                            value={maxIntensity}
                            onChange={event => setMaxIntensity(Number(event.target.value))}
                        />
                    </label>
                    <label className="space-y-1">
                        <Label>Fade in (ms)</Label>
                        <Input
                            type="number"
                            min={0}
                            max={10000}
                            value={fadeIn}
                            onChange={event => setFadeIn(Number(event.target.value))}
                        />
                    </label>
                    <label className="space-y-1">
                        <Label>Fade out (ms)</Label>
                        <Input
                            type="number"
                            min={0}
                            max={10000}
                            value={fadeOut}
                            onChange={event => setFadeOut(Number(event.target.value))}
                        />
                    </label>
                    <label className="space-y-1">
                        <Label>Jitter %</Label>
                        <Input
                            type="number"
                            min={0}
                            max={50}
                            value={jitter}
                            onChange={event => setJitter(Number(event.target.value))}
                        />
                    </label>
                    <label className="space-y-1">
                        <Label>BPM (0 = free)</Label>
                        <Input
                            type="number"
                            min={0}
                            max={300}
                            value={bpm}
                            onChange={event => setBpm(Number(event.target.value))}
                        />
                    </label>
                    <label className="flex items-center gap-2 text-xs">
                        <input
                            type="checkbox"
                            checked={loop}
                            onChange={event => setLoop(event.target.checked)}
                        />
                        Loop the pattern
                    </label>
                </div>

                <div className="space-y-3">
                    {tracks.map((track, trackIndex) => (
                        <div key={track.id} className="rounded-xl border p-3">
                            <div className="mb-2 flex flex-wrap items-end gap-2">
                                <label className="space-y-1">
                                    <span className="text-[10px] text-muted-foreground">
                                        Output
                                    </span>
                                    <select
                                        className="h-8 rounded-md border bg-background px-2 text-xs"
                                        value={track.output}
                                        onChange={event =>
                                            updateTrack(trackIndex, {
                                                output: event.target.value,
                                            })
                                        }
                                    >
                                        {OUTPUTS.map(output => (
                                            <option key={output} value={output}>
                                                {output}
                                            </option>
                                        ))}
                                    </select>
                                </label>
                                <label className="space-y-1">
                                    <span className="text-[10px] text-muted-foreground">
                                        Feature
                                    </span>
                                    <select
                                        className="h-8 rounded-md border bg-background px-2 text-xs"
                                        value={String(track.feature_index)}
                                        onChange={event =>
                                            updateTrack(trackIndex, {
                                                feature_index:
                                                    event.target.value === "all"
                                                        ? "all"
                                                        : Number(event.target.value),
                                            })
                                        }
                                    >
                                        <option value="all">All motors</option>
                                        <option value="0">Motor 1</option>
                                        <option value="1">Motor 2</option>
                                        <option value="2">Motor 3</option>
                                    </select>
                                </label>
                                <label className="min-w-40 flex-1 space-y-1">
                                    <span className="text-[10px] text-muted-foreground">
                                        Match tags (comma)
                                    </span>
                                    <Input
                                        className="h-8 text-xs"
                                        value={track.match.tags.join(", ")}
                                        placeholder="edge2, camille"
                                        onChange={event =>
                                            updateTrack(trackIndex, {
                                                match: {
                                                    ...track.match,
                                                    tags: event.target.value
                                                        .split(",")
                                                        .map(tag => tag.trim())
                                                        .filter(Boolean),
                                                    device_ids: [],
                                                    node_ids: [],
                                                    all: false,
                                                },
                                            })
                                        }
                                    />
                                </label>
                                <div className="flex-1" />
                                <Button
                                    type="button"
                                    variant="destructive"
                                    size="sm"
                                    className="h-8"
                                    disabled={tracks.length <= 1}
                                    onClick={() =>
                                        setTracks(current =>
                                            current.filter((_, i) => i !== trackIndex)
                                        )
                                    }
                                >
                                    <Trash2 className="size-3" />
                                </Button>
                            </div>

                            <div className="space-y-1.5">
                                {track.keyframes.map((kf, kfIndex) => (
                                    <div
                                        key={kfIndex}
                                        className="flex flex-wrap items-center gap-1.5"
                                    >
                                        <Input
                                            type="number"
                                            min={0}
                                            className="h-7 w-24 text-[11px]"
                                            value={kf.at_ms}
                                            onChange={event =>
                                                updateKeyframe(trackIndex, kfIndex, {
                                                    at_ms: Number(event.target.value),
                                                })
                                            }
                                        />
                                        <span className="text-[10px] text-muted-foreground">
                                            ms
                                        </span>
                                        <Input
                                            type="number"
                                            min={0}
                                            max={100}
                                            className="h-7 w-20 text-[11px]"
                                            value={kf.value}
                                            onChange={event =>
                                                updateKeyframe(trackIndex, kfIndex, {
                                                    value: Number(event.target.value),
                                                })
                                            }
                                        />
                                        <span className="text-[10px] text-muted-foreground">
                                            %
                                        </span>
                                        <select
                                            className="h-7 rounded-md border bg-background px-1.5 text-[11px]"
                                            value={kf.easing}
                                            onChange={event =>
                                                updateKeyframe(trackIndex, kfIndex, {
                                                    easing: event.target.value,
                                                })
                                            }
                                        >
                                            {EASINGS.map(easing => (
                                                <option key={easing} value={easing}>
                                                    {easing}
                                                </option>
                                            ))}
                                        </select>
                                        <Button
                                            type="button"
                                            variant="ghost"
                                            size="sm"
                                            className="h-7 px-1.5"
                                            disabled={track.keyframes.length <= 1}
                                            onClick={() =>
                                                updateTrack(trackIndex, {
                                                    keyframes: track.keyframes.filter(
                                                        (_, i) => i !== kfIndex
                                                    ),
                                                })
                                            }
                                        >
                                            <Trash2 className="size-3" />
                                        </Button>
                                    </div>
                                ))}
                                <Button
                                    type="button"
                                    variant="secondary"
                                    size="sm"
                                    className="h-7 text-[11px]"
                                    onClick={() =>
                                        updateTrack(trackIndex, {
                                            keyframes: [
                                                ...track.keyframes,
                                                {
                                                    at_ms:
                                                        (track.keyframes.at(-1)?.at_ms ??
                                                            0) + 1000,
                                                    value: 50,
                                                    easing: "linear",
                                                },
                                            ],
                                        })
                                    }
                                >
                                    <Plus className="size-3" />
                                    Keyframe
                                </Button>
                            </div>
                        </div>
                    ))}
                    <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        className="h-8 text-[11px]"
                        onClick={() => setTracks(current => [...current, defaultTrack()])}
                    >
                        <Plus className="size-3" />
                        Add track
                    </Button>
                </div>

                <DialogFooter>
                    <Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>
                        Cancel
                    </Button>
                    {builtIn ? (
                        <Button type="button" onClick={() => void duplicate()}>
                            <Copy className="size-3" />
                            Duplicate to edit
                        </Button>
                    ) : (
                        <Button type="button" disabled={saving} onClick={() => void save()}>
                            <Save className="size-3" />
                            {saving ? "Saving..." : "Save pattern"}
                        </Button>
                    )}
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
