import { useEffect, useMemo, useRef, useState } from "react";
import {
    Activity,
    Copy,
    Download,
    Dices,
    Ellipsis,
    FileUp,
    Heart,
    Pencil,
    Play,
    Plus,
    Search,
    Square,
    Tag,
    Trash2,
} from "lucide-react";
import { toast } from "sonner";

import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@pes/ui/components/alert-dialog";
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
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@pes/ui/components/dropdown-menu";
import { Input } from "@pes/ui/components/input";
import { Label } from "@pes/ui/components/label";
import { Slider } from "@pes/ui/components/slider";
import { Switch } from "@pes/ui/components/switch";
import { cn } from "@pes/ui/lib/utils";

import { useWebSocket } from "@/hooks/useWebSocket";
import type {
    LovensePatternDetail,
    LovensePatternSummary,
    LovenseRunInfo,
} from "@/types";
import { formatPatternDuration } from "./player-utils";
import { PatternWaveform } from "./pattern-waveform";

const FAVORITES_KEY = "pes.lovense.pattern-favorites";

interface PatternLibraryProps {
    patterns: LovensePatternSummary[];
    details: Record<string, LovensePatternDetail>;
    runs: LovenseRunInfo[];
    selectedDeviceIds: string[];
    onBeforePlay: () => Promise<void>;
    onEdit: (pattern: LovensePatternSummary) => void;
    onCreate: () => void;
    onChanged: () => void;
}

function readFavorites() {
    if (typeof window === "undefined") return [] as string[];
    try {
        const value = JSON.parse(
            window.localStorage.getItem(FAVORITES_KEY) ?? "[]",
        );
        return Array.isArray(value) ? value.map(String) : [];
    } catch {
        return [] as string[];
    }
}

export function PatternLibrary({
    patterns,
    details,
    runs,
    selectedDeviceIds,
    onBeforePlay,
    onEdit,
    onCreate,
    onChanged,
}: PatternLibraryProps) {
    const { send, sendCommand } = useWebSocket();
    const [query, setQuery] = useState("");
    const [activeTag, setActiveTag] = useState<string | null>(null);
    const [favoritesOnly, setFavoritesOnly] = useState(false);
    const [favorites, setFavorites] = useState<string[]>(readFavorites);
    const [playPattern, setPlayPattern] =
        useState<LovensePatternSummary | null>(null);
    const [deletePattern, setDeletePattern] =
        useState<LovensePatternSummary | null>(null);
    const [scalePct, setScalePct] = useState(100);
    const [loop, setLoop] = useState(false);
    const [loopCount, setLoopCount] = useState(0);
    const [duration, setDuration] = useState(-1);
    const [fadeIn, setFadeIn] = useState(500);
    const [fadeOut, setFadeOut] = useState(500);
    const [replace, setReplace] = useState(false);
    const [playing, setPlaying] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const requestedDetails = useRef(new Set<string>());
    const detailsRef = useRef(details);
    detailsRef.current = details;

    useEffect(() => {
        window.localStorage.setItem(FAVORITES_KEY, JSON.stringify(favorites));
    }, [favorites]);

    useEffect(() => {
        for (const pattern of patterns) {
            const requestKey = `${pattern.id}:${pattern.updated_at ?? ""}`;
            const cached = details[pattern.id];
            if (cached?.updated_at === pattern.updated_at) continue;
            if (cached && !pattern.updated_at) continue;
            if (requestedDetails.current.has(requestKey)) continue;
            requestedDetails.current.add(requestKey);
            send("lovense:pattern_detail", { pattern_id: pattern.id });
        }
    }, [details, patterns, send]);

    const tags = useMemo(
        () =>
            Array.from(
                new Set(patterns.flatMap((pattern) => pattern.tags)),
            ).sort(),
        [patterns],
    );
    const filtered = useMemo(() => {
        const normalized = query.trim().toLowerCase();
        return patterns.filter((pattern) => {
            if (favoritesOnly && !favorites.includes(pattern.id)) return false;
            if (activeTag && !pattern.tags.includes(activeTag)) return false;
            if (!normalized) return true;
            return `${pattern.name} ${pattern.description} ${pattern.tags.join(" ")}`
                .toLowerCase()
                .includes(normalized);
        });
    }, [activeTag, favorites, favoritesOnly, patterns, query]);

    const openPlay = (pattern: LovensePatternSummary) => {
        const definition = detailsRef.current[pattern.id]?.definition ?? {};
        setLoop(Boolean(definition.loop ?? false));
        setFadeIn(Number(definition.fade_in_ms ?? 500));
        setFadeOut(Number(definition.fade_out_ms ?? 500));
        setScalePct(100);
        setLoopCount(0);
        setDuration(-1);
        setReplace(false);
        setPlayPattern(pattern);
    };

    const toggleFavorite = (patternId: string) => {
        setFavorites((current) =>
            current.includes(patternId)
                ? current.filter((id) => id !== patternId)
                : [...current, patternId],
        );
    };

    const play = async () => {
        if (!playPattern) return;
        if (selectedDeviceIds.length === 0) {
            toast.error("Select at least one toy in the Player tab");
            return;
        }
        setPlaying(true);
        try {
            await onBeforePlay();
            const result = await sendCommand("lovense:pattern_play", {
                pattern_id: playPattern.id,
                pattern_name: playPattern.name,
                targets: {
                    device_ids: selectedDeviceIds,
                    tags: [],
                    node_ids: [],
                    all: false,
                },
                duration,
                loop,
                loop_count: loop ? loopCount : 0,
                scale_pct: scalePct,
                replace,
                fade_in_ms: fadeIn,
                fade_out_ms: fadeOut,
                sync_offset_ms: 0,
            });
            if (result.status !== "ok") {
                toast.error(result.message ?? "Unable to start this pattern");
                return;
            }
            toast.success(`${playPattern.name} started`);
            setPlayPattern(null);
            onChanged();
        } catch {
            toast.error("Pattern command timed out");
        } finally {
            setPlaying(false);
        }
    };

    const stop = async (pattern: LovensePatternSummary) => {
        const result = await sendCommand("lovense:pattern_stop", {
            pattern_id: pattern.id,
            run_id: null,
            all: false,
        });
        if (result.status !== "ok")
            toast.error(result.message ?? "Unable to stop pattern");
    };

    const duplicate = async (pattern: LovensePatternSummary) => {
        const result = await sendCommand("lovense:pattern_duplicate", {
            pattern_id: pattern.id,
            name: `${pattern.name} copy`.slice(0, 80),
        });
        if (result.status !== "ok") {
            toast.error(result.message ?? "Unable to duplicate pattern");
            return;
        }
        toast.success("Pattern duplicated");
        onChanged();
    };

    const exportPattern = async (pattern: LovensePatternSummary) => {
        try {
            if (!detailsRef.current[pattern.id]) {
                await sendCommand("lovense:pattern_export", {
                    pattern_id: pattern.id,
                });
            }
            const detail = detailsRef.current[pattern.id];
            if (!detail) {
                toast.error(
                    "Pattern preview is still loading. Try again in a moment.",
                );
                return;
            }
            const blob = new Blob([JSON.stringify(detail, null, 2)], {
                type: "application/json",
            });
            const url = URL.createObjectURL(blob);
            const anchor = document.createElement("a");
            anchor.href = url;
            anchor.download = `${pattern.name.replace(/[^a-z0-9]+/gi, "-").toLowerCase() || "pattern"}.json`;
            anchor.click();
            URL.revokeObjectURL(url);
        } catch {
            toast.error("Unable to export pattern");
        }
    };

    const importPattern = async (file: File | undefined) => {
        if (!file) return;
        if (file.size > 2_000_000) {
            toast.error("Pattern file is too large");
            return;
        }
        try {
            const document = JSON.parse(await file.text()) as Record<
                string,
                unknown
            >;
            const result = await sendCommand("lovense:pattern_import", {
                document,
            });
            if (result.status !== "ok") {
                toast.error(result.message ?? "Unable to import pattern");
                return;
            }
            toast.success("Pattern imported");
            onChanged();
        } catch {
            toast.error("This file is not a valid pattern JSON");
        } finally {
            if (fileInputRef.current) fileInputRef.current.value = "";
        }
    };

    const confirmDelete = async () => {
        if (!deletePattern) return;
        const result = await sendCommand("lovense:pattern_delete", {
            pattern_id: deletePattern.id,
        });
        if (result.status !== "ok") {
            toast.error(result.message ?? "Unable to delete pattern");
            return;
        }
        toast.success("Pattern deleted");
        setDeletePattern(null);
        onChanged();
    };

    return (
        <div className="space-y-5">
            <section className="rounded-[24px] border border-violet-500/20 bg-gradient-to-br from-violet-500/[0.09] via-card to-fuchsia-500/[0.04] p-4 sm:p-5">
                <div className="flex flex-wrap items-center gap-3">
                    <div className="min-w-0 flex-1">
                        <h2 className="font-syne text-lg font-extrabold">
                            Pattern library
                        </h2>
                        <p className="mt-1 text-xs text-muted-foreground">
                            Find a rhythm, choose your toys, then make it yours.
                        </p>
                    </div>
                    <Button
                        type="button"
                        variant="outline"
                        className="h-11 rounded-xl"
                        disabled={patterns.length === 0}
                        onClick={() => {
                            const pool =
                                filtered.length > 0 ? filtered : patterns;
                            const randomPattern =
                                pool[Math.floor(Math.random() * pool.length)];
                            if (randomPattern) openPlay(randomPattern);
                        }}
                    >
                        <Dices className="size-4 text-violet-500" />
                        Surprise
                    </Button>
                    <Button
                        type="button"
                        className="h-11 rounded-xl bg-violet-600 text-white hover:bg-violet-500"
                        onClick={onCreate}
                    >
                        <Plus className="size-4" />
                        Create
                    </Button>
                </div>

                <div className="mt-4 flex gap-2">
                    <div className="relative min-w-0 flex-1">
                        <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                        <Input
                            value={query}
                            onChange={(event) => setQuery(event.target.value)}
                            placeholder="Search patterns or tags…"
                            className="h-11 rounded-xl border-violet-500/15 bg-background/60 pl-10"
                        />
                    </div>
                    <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        aria-label="Show favorites only"
                        aria-pressed={favoritesOnly}
                        className={cn(
                            "size-11 shrink-0 rounded-xl",
                            favoritesOnly &&
                                "border-fuchsia-500/40 bg-fuchsia-500/10 text-fuchsia-500",
                        )}
                        onClick={() => setFavoritesOnly((current) => !current)}
                    >
                        <Heart
                            className={cn(
                                "size-4",
                                favoritesOnly && "fill-current",
                            )}
                        />
                    </Button>
                    <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        aria-label="Import pattern"
                        className="size-11 shrink-0 rounded-xl"
                        onClick={() => fileInputRef.current?.click()}
                    >
                        <FileUp className="size-4" />
                    </Button>
                    <input
                        ref={fileInputRef}
                        type="file"
                        accept="application/json,.json"
                        className="hidden"
                        onChange={(event) =>
                            void importPattern(event.target.files?.[0])
                        }
                    />
                </div>

                {tags.length > 0 && (
                    <div className="-mx-1 mt-3 flex gap-2 overflow-x-auto px-1 pb-1">
                        <button
                            type="button"
                            onClick={() => setActiveTag(null)}
                            className={cn(
                                "h-8 shrink-0 rounded-full border px-3 text-[11px] font-medium",
                                !activeTag
                                    ? "border-violet-500/40 bg-violet-500/15 text-violet-500"
                                    : "text-muted-foreground",
                            )}
                        >
                            All
                        </button>
                        {tags.map((tag) => (
                            <button
                                key={tag}
                                type="button"
                                onClick={() =>
                                    setActiveTag((current) =>
                                        current === tag ? null : tag,
                                    )
                                }
                                className={cn(
                                    "flex h-8 shrink-0 items-center gap-1.5 rounded-full border px-3 text-[11px] font-medium",
                                    activeTag === tag
                                        ? "border-violet-500/40 bg-violet-500/15 text-violet-500"
                                        : "text-muted-foreground",
                                )}
                            >
                                <Tag className="size-3" />
                                {tag}
                            </button>
                        ))}
                    </div>
                )}
            </section>

            {filtered.length === 0 ? (
                <div className="grid min-h-64 place-items-center rounded-[24px] border border-dashed p-8 text-center">
                    <div>
                        <Heart className="mx-auto mb-3 size-7 text-muted-foreground/40" />
                        <p className="text-sm font-semibold">
                            No pattern found
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">
                            Change your filters or create a new rhythm.
                        </p>
                        <Button
                            type="button"
                            variant="outline"
                            className="mt-4"
                            onClick={onCreate}
                        >
                            Create a pattern
                        </Button>
                    </div>
                </div>
            ) : (
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2 2xl:grid-cols-3">
                    {filtered.map((pattern) => {
                        const run = runs.find(
                            (item) => item.pattern_id === pattern.id,
                        );
                        const favorite = favorites.includes(pattern.id);
                        return (
                            <article
                                key={pattern.id}
                                className={cn(
                                    "group overflow-hidden rounded-[24px] border bg-card/80 transition-colors",
                                    run
                                        ? "border-fuchsia-500/40"
                                        : "hover:border-violet-500/30",
                                )}
                            >
                                <div className="relative h-36 overflow-hidden border-b border-violet-500/10 bg-[#100d18]">
                                    <PatternWaveform
                                        definition={
                                            details[pattern.id]?.definition ??
                                            {}
                                        }
                                        className="absolute inset-0 size-full"
                                    />
                                    <div className="absolute left-3 top-3 flex items-center gap-2">
                                        {run && (
                                            <Badge className="gap-1.5 border border-fuchsia-400/30 bg-fuchsia-500/20 text-[10px] text-fuchsia-200 backdrop-blur-md">
                                                <Activity className="size-3 animate-pulse" />
                                                PLAYING
                                            </Badge>
                                        )}
                                        {pattern.built_in && (
                                            <Badge
                                                variant="outline"
                                                className="bg-black/20 text-[9px] text-white/60 backdrop-blur-md"
                                            >
                                                CURATED
                                            </Badge>
                                        )}
                                    </div>
                                    <button
                                        type="button"
                                        aria-label={`${favorite ? "Remove" : "Add"} ${pattern.name} ${favorite ? "from" : "to"} favorites`}
                                        onClick={() =>
                                            toggleFavorite(pattern.id)
                                        }
                                        className={cn(
                                            "absolute right-3 top-3 grid size-9 place-items-center rounded-full border border-white/10 bg-black/25 backdrop-blur-md transition-colors",
                                            favorite
                                                ? "text-fuchsia-400"
                                                : "text-white/55 hover:text-white",
                                        )}
                                    >
                                        <Heart
                                            className={cn(
                                                "size-4",
                                                favorite && "fill-current",
                                            )}
                                        />
                                    </button>
                                </div>

                                <div className="p-4">
                                    <div className="flex items-start gap-3">
                                        <div className="min-w-0 flex-1">
                                            <h3 className="truncate text-base font-semibold">
                                                {pattern.name}
                                            </h3>
                                            <p className="mt-1 line-clamp-2 min-h-8 text-xs leading-relaxed text-muted-foreground">
                                                {pattern.description ||
                                                    "A custom rhythm for your toys."}
                                            </p>
                                        </div>
                                        <span className="shrink-0 rounded-lg bg-muted/40 px-2 py-1 font-mono text-[10px] text-muted-foreground">
                                            {formatPatternDuration(
                                                pattern.duration_ms,
                                            )}
                                        </span>
                                    </div>
                                    {pattern.tags.length > 0 && (
                                        <div className="mt-3 flex flex-wrap gap-1.5">
                                            {pattern.tags
                                                .slice(0, 3)
                                                .map((tag) => (
                                                    <Badge
                                                        key={tag}
                                                        variant="secondary"
                                                        className="text-[9px] font-normal"
                                                    >
                                                        {tag}
                                                    </Badge>
                                                ))}
                                        </div>
                                    )}
                                    <div className="mt-4 flex items-center gap-2">
                                        {run ? (
                                            <Button
                                                type="button"
                                                variant="destructive"
                                                className="h-11 flex-1 rounded-xl"
                                                onClick={() =>
                                                    void stop(pattern)
                                                }
                                            >
                                                <Square className="size-4 fill-current" />
                                                Stop
                                            </Button>
                                        ) : (
                                            <Button
                                                type="button"
                                                className="h-11 flex-1 rounded-xl bg-violet-600 text-white hover:bg-violet-500"
                                                onClick={() =>
                                                    openPlay(pattern)
                                                }
                                            >
                                                <Play className="size-4 fill-current" />
                                                Play
                                            </Button>
                                        )}
                                        <Button
                                            type="button"
                                            variant="outline"
                                            size="icon"
                                            className="size-11 rounded-xl"
                                            aria-label={`Edit ${pattern.name}`}
                                            onClick={() => onEdit(pattern)}
                                        >
                                            <Pencil className="size-4" />
                                        </Button>
                                        <DropdownMenu>
                                            <DropdownMenuTrigger asChild>
                                                <Button
                                                    type="button"
                                                    variant="outline"
                                                    size="icon"
                                                    className="size-11 rounded-xl"
                                                    aria-label={`More actions for ${pattern.name}`}
                                                >
                                                    <Ellipsis className="size-4" />
                                                </Button>
                                            </DropdownMenuTrigger>
                                            <DropdownMenuContent align="end">
                                                <DropdownMenuItem
                                                    onSelect={() =>
                                                        void duplicate(pattern)
                                                    }
                                                >
                                                    <Copy className="size-4" />
                                                    Duplicate
                                                </DropdownMenuItem>
                                                <DropdownMenuItem
                                                    onSelect={() =>
                                                        void exportPattern(
                                                            pattern,
                                                        )
                                                    }
                                                >
                                                    <Download className="size-4" />
                                                    Export JSON
                                                </DropdownMenuItem>
                                                {!pattern.built_in && (
                                                    <DropdownMenuItem
                                                        variant="destructive"
                                                        onSelect={() =>
                                                            setDeletePattern(
                                                                pattern,
                                                            )
                                                        }
                                                    >
                                                        <Trash2 className="size-4" />
                                                        Delete
                                                    </DropdownMenuItem>
                                                )}
                                            </DropdownMenuContent>
                                        </DropdownMenu>
                                    </div>
                                </div>
                            </article>
                        );
                    })}
                </div>
            )}

            <Dialog
                open={playPattern !== null}
                onOpenChange={(open) => {
                    if (!open && !playing) setPlayPattern(null);
                }}
            >
                <DialogContent className="max-h-[92dvh] overflow-y-auto rounded-t-[26px] sm:max-w-[520px]">
                    <DialogHeader>
                        <DialogTitle className="font-syne text-xl">
                            {playPattern?.name}
                        </DialogTitle>
                        <DialogDescription>
                            Playing on {selectedDeviceIds.length} selected{" "}
                            {selectedDeviceIds.length === 1 ? "toy" : "toys"}.
                            Server intensity caps still apply.
                        </DialogDescription>
                    </DialogHeader>
                    {playPattern && (
                        <div className="space-y-5">
                            <div className="h-32 overflow-hidden rounded-2xl border border-violet-500/15 bg-[#100d18]">
                                <PatternWaveform
                                    definition={
                                        details[playPattern.id]?.definition ??
                                        {}
                                    }
                                    className="size-full"
                                />
                            </div>
                            <div>
                                <div className="mb-3 flex items-center justify-between">
                                    <Label>Intensity scale</Label>
                                    <span className="font-mono text-sm font-semibold text-violet-500">
                                        {scalePct}%
                                    </span>
                                </div>
                                <Slider
                                    min={0}
                                    max={150}
                                    step={5}
                                    value={[scalePct]}
                                    onValueChange={(value) =>
                                        setScalePct(value[0] ?? 100)
                                    }
                                    className="[&_[data-slot=slider-range]]:bg-violet-500 [&_[data-slot=slider-thumb]]:size-5 [&_[data-slot=slider-thumb]]:border-violet-500"
                                />
                            </div>
                            <div>
                                <Label>Duration</Label>
                                <div className="mt-2 grid grid-cols-4 gap-2">
                                    {[
                                        [-1, "Natural"],
                                        [30, "30 sec"],
                                        [60, "1 min"],
                                        [300, "5 min"],
                                    ].map(([value, label]) => (
                                        <button
                                            key={value}
                                            type="button"
                                            onClick={() =>
                                                setDuration(Number(value))
                                            }
                                            className={cn(
                                                "h-10 rounded-xl border text-[11px] font-medium",
                                                duration === Number(value)
                                                    ? "border-violet-500/50 bg-violet-500/10 text-violet-500"
                                                    : "text-muted-foreground",
                                            )}
                                        >
                                            {label}
                                        </button>
                                    ))}
                                </div>
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                                <label className="space-y-1.5">
                                    <Label>Fade in (ms)</Label>
                                    <Input
                                        type="number"
                                        min={0}
                                        max={10000}
                                        step={100}
                                        value={fadeIn}
                                        onChange={(event) =>
                                            setFadeIn(
                                                Math.max(
                                                    0,
                                                    Math.min(
                                                        10000,
                                                        Number(
                                                            event.target.value,
                                                        ),
                                                    ),
                                                ),
                                            )
                                        }
                                    />
                                </label>
                                <label className="space-y-1.5">
                                    <Label>Fade out (ms)</Label>
                                    <Input
                                        type="number"
                                        min={0}
                                        max={10000}
                                        step={100}
                                        value={fadeOut}
                                        onChange={(event) =>
                                            setFadeOut(
                                                Math.max(
                                                    0,
                                                    Math.min(
                                                        10000,
                                                        Number(
                                                            event.target.value,
                                                        ),
                                                    ),
                                                ),
                                            )
                                        }
                                    />
                                </label>
                            </div>
                            <div className="space-y-3 rounded-2xl border bg-muted/20 p-4">
                                <div className="flex items-center justify-between gap-4">
                                    <div>
                                        <Label>Loop pattern</Label>
                                        <p className="mt-1 text-[11px] text-muted-foreground">
                                            Repeat the full timeline.
                                        </p>
                                    </div>
                                    <Switch
                                        checked={loop}
                                        onCheckedChange={setLoop}
                                    />
                                </div>
                                {loop && (
                                    <div>
                                        <Label>Number of loops</Label>
                                        <div className="mt-2 grid grid-cols-4 gap-2">
                                            {[0, 3, 5, 10].map((count) => (
                                                <button
                                                    key={count}
                                                    type="button"
                                                    onClick={() =>
                                                        setLoopCount(count)
                                                    }
                                                    className={cn(
                                                        "h-9 rounded-lg border text-[11px]",
                                                        loopCount === count
                                                            ? "border-violet-500/50 bg-violet-500/10 text-violet-500"
                                                            : "text-muted-foreground",
                                                    )}
                                                >
                                                    {count === 0
                                                        ? "Unlimited"
                                                        : `${count}×`}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                )}
                                <div className="flex items-center justify-between gap-4 border-t pt-3">
                                    <div>
                                        <Label>Take over active outputs</Label>
                                        <p className="mt-1 text-[11px] text-muted-foreground">
                                            Off respects a pattern already using
                                            these motors.
                                        </p>
                                    </div>
                                    <Switch
                                        checked={replace}
                                        onCheckedChange={setReplace}
                                    />
                                </div>
                            </div>
                        </div>
                    )}
                    <DialogFooter>
                        <Button
                            type="button"
                            variant="outline"
                            disabled={playing}
                            onClick={() => setPlayPattern(null)}
                        >
                            Cancel
                        </Button>
                        <Button
                            type="button"
                            className="h-11 bg-violet-600 text-white"
                            disabled={playing || selectedDeviceIds.length === 0}
                            onClick={() => void play()}
                        >
                            <Play className="size-4 fill-current" />
                            {playing ? "Starting…" : "Start pattern"}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <AlertDialog
                open={deletePattern !== null}
                onOpenChange={(open) => !open && setDeletePattern(null)}
            >
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>
                            Delete “{deletePattern?.name}”?
                        </AlertDialogTitle>
                        <AlertDialogDescription>
                            This removes the pattern from your library. Active
                            runs of this pattern will be stopped.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={() => void confirmDelete()}>
                            Delete
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
}
