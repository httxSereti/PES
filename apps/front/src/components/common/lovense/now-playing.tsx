import { useEffect, useState } from "react";
import { Activity, ChevronRight, Repeat2, Square } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@pes/ui/components/button";
import { useWebSocket } from "@/hooks/useWebSocket";
import type {
    LovensePatternDetail,
    LovensePatternSummary,
    LovenseRunInfo,
} from "@/types";
import { PatternWaveform } from "./pattern-waveform";
import { formatRunTime } from "./player-utils";

interface NowPlayingProps {
    runs: LovenseRunInfo[];
    patterns: LovensePatternSummary[];
    details: Record<string, LovensePatternDetail>;
    onOpenLibrary: () => void;
}

function NowPlayingCard({
    run,
    pattern,
    detail,
    onOpenLibrary,
}: {
    run: LovenseRunInfo;
    pattern?: LovensePatternSummary;
    detail?: LovensePatternDetail;
    onOpenLibrary: () => void;
}) {
    const { sendCommand } = useWebSocket();
    const [anchor, setAnchor] = useState(() => ({
        runId: run.id,
        elapsed: run.elapsed_s,
        at: Date.now(),
    }));
    const [, setTick] = useState(0);

    useEffect(() => {
        setAnchor({ runId: run.id, elapsed: run.elapsed_s, at: Date.now() });
    }, [run.id, run.elapsed_s]);

    useEffect(() => {
        const interval = window.setInterval(
            () => setTick((value) => value + 1),
            1000,
        );
        return () => window.clearInterval(interval);
    }, []);

    const elapsed =
        anchor.runId === run.id
            ? anchor.elapsed + (Date.now() - anchor.at) / 1000
            : run.elapsed_s;
    const patternSeconds = (pattern?.duration_ms ?? 0) / 1000;
    const durationOption = Number(run.options.duration ?? -1);
    const loop = Boolean(run.options.loop ?? detail?.definition.loop ?? false);
    const loopCount = Number(run.options.loop_count ?? 0);
    const totalSeconds =
        durationOption > 0
            ? durationOption
            : !loop && patternSeconds > 0
              ? patternSeconds
              : loop && loopCount > 0 && patternSeconds > 0
                ? patternSeconds * loopCount
                : null;
    const progress = totalSeconds ? Math.min(1, elapsed / totalSeconds) : null;
    const loops =
        loop && patternSeconds > 0
            ? Math.max(run.loops, Math.floor(elapsed / patternSeconds))
            : run.loops;

    const stop = async () => {
        const result = await sendCommand("lovense:pattern_stop", {
            run_id: run.id,
            pattern_id: null,
            all: false,
        });
        if (result.status !== "ok")
            toast.error(result.message ?? "Unable to stop run");
    };

    return (
        <article className="relative overflow-hidden rounded-2xl border border-fuchsia-500/30 bg-card/90 shadow-[0_10px_35px_rgba(0,0,0,0.12)]">
            <div className="absolute inset-y-0 left-0 w-24 opacity-35 sm:w-40">
                <PatternWaveform
                    definition={detail?.definition ?? {}}
                    progress={progress}
                    className="size-full"
                />
            </div>
            <div className="relative flex items-center gap-3 p-3 pl-4 sm:pl-5">
                <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-fuchsia-500/15 text-fuchsia-500">
                    <Activity className="size-4 animate-pulse" />
                </span>
                <button
                    type="button"
                    onClick={onOpenLibrary}
                    className="min-w-0 flex-1 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fuchsia-500"
                >
                    <span className="flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-[0.18em] text-fuchsia-500">
                        Now playing
                        <ChevronRight className="size-3" />
                    </span>
                    <span className="mt-0.5 block truncate text-sm font-semibold">
                        {run.pattern_name}
                    </span>
                    <span className="mt-0.5 flex items-center gap-2 text-[10px] text-muted-foreground">
                        <span className="font-mono tabular-nums">
                            {formatRunTime(elapsed)}
                        </span>
                        {loop && (
                            <span className="flex items-center gap-1">
                                <Repeat2 className="size-3" />
                                Loop {loops + 1}
                            </span>
                        )}
                    </span>
                </button>
                <Button
                    type="button"
                    variant="destructive"
                    size="icon"
                    className="size-11 shrink-0 rounded-xl"
                    aria-label={`Stop ${run.pattern_name}`}
                    onClick={() => void stop()}
                >
                    <Square className="size-4 fill-current" />
                </Button>
            </div>
            {progress !== null && (
                <div className="relative h-1 bg-fuchsia-500/10">
                    <div
                        className="h-full bg-gradient-to-r from-violet-600 to-fuchsia-400 transition-[width] duration-1000"
                        style={{ width: `${progress * 100}%` }}
                    />
                </div>
            )}
        </article>
    );
}

export function NowPlaying({
    runs,
    patterns,
    details,
    onOpenLibrary,
}: NowPlayingProps) {
    if (runs.length === 0) return null;
    return (
        <section
            aria-label="Active patterns"
            className="grid gap-2 lg:grid-cols-2"
        >
            {runs.map((run) => (
                <NowPlayingCard
                    key={run.id}
                    run={run}
                    pattern={patterns.find(
                        (pattern) => pattern.id === run.pattern_id,
                    )}
                    detail={
                        run.pattern_id ? details[run.pattern_id] : undefined
                    }
                    onOpenLibrary={onOpenLibrary}
                />
            ))}
        </section>
    );
}
