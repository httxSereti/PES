import { useCallback, useEffect, useRef, useState } from "react";
import { Circle, Disc3, Save, Square } from "lucide-react";
import { toast } from "sonner";

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
import { useWebSocket } from "@/hooks/useWebSocket";
import type { PlayerOutput } from "./player-utils";

interface Sample {
    at_ms: number;
    value: number;
}

interface RecordingState {
    startedAt: number;
    samples: Map<string, Sample[]>;
    lastSampleAt: Map<string, number>;
}

interface RecordingDraft {
    name: string;
    definition: Record<string, unknown>;
}

export function useTouchRecorder(outputs: PlayerOutput[], cap: number) {
    const { sendCommand } = useWebSocket();
    const [recording, setRecording] = useState(false);
    const [draft, setDraft] = useState<RecordingDraft | null>(null);
    const [name, setName] = useState("Touch recording");
    const [saving, setSaving] = useState(false);
    const recordingRef = useRef<RecordingState | null>(null);
    const targetSignature = outputs
        .slice(0, 2)
        .map(
            (output) =>
                `${output.deviceId}:${output.featureIndex}:${output.output}`,
        )
        .join("|");

    const stop = useCallback(() => {
        const current = recordingRef.current;
        recordingRef.current = null;
        setRecording(false);
        if (!current) return;

        const tracks = outputs.slice(0, 2).flatMap((output, index) => {
            const key = `${output.deviceId}:${output.featureIndex}:${output.output}`;
            const samples = current.samples.get(key) ?? [];
            if (samples.length < 2) return [];
            return [
                {
                    id: `touch-${index + 1}`,
                    output: output.output,
                    feature_index: output.featureIndex,
                    match: {
                        device_ids: [],
                        tags: [],
                        node_ids: [],
                        all: true,
                    },
                    keyframes: samples.map((sample) => ({
                        at_ms: sample.at_ms,
                        value: sample.value / 100,
                        easing: "linear",
                    })),
                },
            ];
        });
        const duration = Math.max(
            0,
            ...tracks.map((track) => track.keyframes.at(-1)?.at_ms ?? 0),
        );
        if (tracks.length === 0 || duration < 500) {
            toast.error(
                "Move on the touch pad for at least half a second to save a gesture",
            );
            return;
        }

        const recordingName = `Touch ${new Date().toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
        })}`;
        setName(recordingName);
        setDraft({
            name: recordingName,
            definition: {
                version: 1,
                name: recordingName,
                description: "Recorded from the touch pad.",
                loop: true,
                bpm: null,
                max_intensity_pct: cap,
                fade_in_ms: 200,
                fade_out_ms: 300,
                jitter_pct: 0,
                tags: ["recorded", "touch"],
                tracks,
            },
        });
    }, [cap, outputs]);

    const start = useCallback(() => {
        recordingRef.current = {
            startedAt: performance.now(),
            samples: new Map(),
            lastSampleAt: new Map(),
        };
        setDraft(null);
        setRecording(true);
        toast.success("Recording started — draw on the touch pad");
    }, []);

    const cancel = useCallback(() => {
        recordingRef.current = null;
        setRecording(false);
    }, []);

    const capture = useCallback(
        (output: PlayerOutput, value: number) => {
            const current = recordingRef.current;
            if (!current) return;
            const now = performance.now();
            const elapsed = Math.round(now - current.startedAt);
            if (elapsed > 30000) {
                toast.success("30 second recording limit reached");
                stop();
                return;
            }
            const key = `${output.deviceId}:${output.featureIndex}:${output.output}`;
            const lastAt = current.lastSampleAt.get(key) ?? -100;
            if (now - lastAt < 100) return;
            const samples = current.samples.get(key) ?? [];
            if (samples.length >= 300) return;
            const nextValue = Math.max(0, Math.min(100, Math.round(value)));
            const previous = samples.at(-1);
            if (
                previous &&
                previous.value === nextValue &&
                elapsed - previous.at_ms < 500
            ) {
                return;
            }
            samples.push({ at_ms: elapsed, value: nextValue });
            current.samples.set(key, samples);
            current.lastSampleAt.set(key, now);
        },
        [stop],
    );

    const save = async () => {
        if (!draft || !name.trim() || saving) return;
        setSaving(true);
        try {
            const definition = {
                ...draft.definition,
                name: name.trim(),
            };
            const result = await sendCommand("lovense:pattern_save", {
                pattern_id: null,
                name: name.trim(),
                description: "Recorded from the touch pad.",
                visibility: "private",
                tags: ["recorded", "touch"],
                definition,
            });
            if (result.status !== "ok") {
                toast.error(result.message ?? "Unable to save this gesture");
                return;
            }
            toast.success("Gesture saved to your pattern library");
            setDraft(null);
        } catch {
            toast.error("Save command timed out");
        } finally {
            setSaving(false);
        }
    };

    useEffect(() => cancel(), [targetSignature, cancel]);

    return {
        recording,
        draft,
        name,
        saving,
        setName,
        setDraft,
        start,
        stop,
        cancel,
        capture,
        save,
    };
}

export function TouchRecorderControls({
    recorder,
    disabled,
}: {
    recorder: ReturnType<typeof useTouchRecorder>;
    disabled?: boolean;
}) {
    return (
        <>
            <div className="mt-3 flex min-h-11 items-center justify-between gap-3 rounded-xl border bg-muted/20 px-3.5 py-2.5">
                <div className="flex items-center gap-2.5">
                    <span
                        className={
                            recorder.recording
                                ? "grid size-8 place-items-center rounded-lg bg-red-500/15 text-red-500"
                                : "grid size-8 place-items-center rounded-lg bg-violet-500/10 text-violet-500"
                        }
                    >
                        {recorder.recording ? (
                            <Disc3 className="size-4 animate-spin" />
                        ) : (
                            <Circle className="size-4" />
                        )}
                    </span>
                    <div>
                        <p className="text-xs font-medium">
                            {recorder.recording
                                ? "Recording your gesture"
                                : "Loop recorder"}
                        </p>
                        <p className="text-[10px] text-muted-foreground">
                            {recorder.recording
                                ? "Draw on the pad, then stop to save. 30 sec max."
                                : "Turn a finger movement into a reusable pattern."}
                        </p>
                    </div>
                </div>
                <Button
                    type="button"
                    variant={recorder.recording ? "destructive" : "outline"}
                    size="sm"
                    className="h-9 shrink-0 rounded-lg"
                    disabled={disabled && !recorder.recording}
                    onClick={
                        recorder.recording ? recorder.stop : recorder.start
                    }
                >
                    {recorder.recording ? (
                        <>
                            <Square className="size-3 fill-current" />
                            Finish
                        </>
                    ) : (
                        <>
                            <Circle className="size-3 fill-current" />
                            Record
                        </>
                    )}
                </Button>
            </div>

            <Dialog
                open={recorder.draft !== null}
                onOpenChange={(open) => {
                    if (!open && !recorder.saving) recorder.setDraft(null);
                }}
            >
                <DialogContent className="sm:max-w-[440px]">
                    <DialogHeader>
                        <DialogTitle>Save your gesture</DialogTitle>
                        <DialogDescription>
                            The movement becomes a looping pattern. You can
                            retarget its motors and refine every keyframe in the
                            visual editor.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-2">
                        <Label htmlFor="touch-recording-name">
                            Pattern name
                        </Label>
                        <Input
                            id="touch-recording-name"
                            value={recorder.name}
                            maxLength={80}
                            onChange={(event) =>
                                recorder.setName(event.target.value)
                            }
                            onKeyDown={(event) => {
                                if (event.key === "Enter") void recorder.save();
                            }}
                        />
                    </div>
                    <DialogFooter>
                        <Button
                            type="button"
                            variant="outline"
                            disabled={recorder.saving}
                            onClick={() => recorder.setDraft(null)}
                        >
                            Discard
                        </Button>
                        <Button
                            type="button"
                            className="bg-violet-600 text-white"
                            disabled={recorder.saving || !recorder.name.trim()}
                            onClick={() => void recorder.save()}
                        >
                            <Save className="size-4" />
                            {recorder.saving ? "Saving…" : "Save pattern"}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </>
    );
}
