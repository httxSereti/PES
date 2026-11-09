import { useEffect, useMemo, useRef, useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import {
    Activity,
    BookmarkPlus,
    Check,
    CircleCheck,
    Minus,
    Plus,
    RefreshCw,
    RotateCcw,
    ShieldCheck,
    SlidersHorizontal,
    TriangleAlert,
    X,
} from "lucide-react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import * as z from "zod";

import { Button } from "@pes/ui/components/button";
import {
    Dialog,
    DialogClose,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from "@pes/ui/components/dialog";
import { Input } from "@pes/ui/components/input";
import { Switch } from "@pes/ui/components/switch";
import { Textarea } from "@pes/ui/components/textarea";
import { cn } from "@pes/ui/lib/utils";

import { useWebSocket } from "@/hooks/useWebSocket";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import {
    closeProfileSave,
    profilesSelectors,
} from "@/store/slices/profilesSlice";
import { rampsSelectors } from "@/store/slices/rampsSlice";
import { unitsSelectors } from "@/store/slices/unitsSlice";
import type { ProfileSavePayload } from "@/types";
import { MODE_2B } from "@/types/units.types";
import type { UnitSettings } from "@/types/units.types";

const profileSaveSchema = z.object({
    name: z
        .string()
        .min(1, "Name is required")
        .max(32, "Name must be at most 32 characters")
        .regex(/^[A-Za-z0-9_-]+$/, "Letters, digits, '-' and '_' only"),
    description: z
        .string()
        .max(200, "Description must be at most 200 characters"),
    include_ramps: z.boolean(),
    overwrite: z.boolean(),
});

type FormValues = z.infer<typeof profileSaveSchema>;
type ChannelKey = "ch_A" | "ch_B";
type ChannelLevels = Record<ChannelKey, number>;
type LevelsByUnit = Record<string, ChannelLevels>;

const DEFAULT_VALUES: FormValues = {
    name: "",
    description: "",
    include_ramps: true,
    overwrite: false,
};

function channelLimit(unit: UnitSettings, key: ChannelKey): number {
    const limit = key === "ch_A" ? unit.ch_A_limit : unit.ch_B_limit;
    return Math.max(0, Math.min(100, limit?.max ?? 100));
}

function liveLevels(unit: UnitSettings): ChannelLevels {
    return {
        ch_A: Math.min(
            channelLimit(unit, "ch_A"),
            Math.max(0, Math.round(unit.ch_A)),
        ),
        ch_B: Math.min(
            channelLimit(unit, "ch_B"),
            Math.max(0, Math.round(unit.ch_B)),
        ),
    };
}

function snapshotLevels(units: UnitSettings[]): LevelsByUnit {
    return Object.fromEntries(units.map((unit) => [unit.id, liveLevels(unit)]));
}

function unitNumber(unitId: string): string {
    const digits = unitId.match(/\d+/)?.[0] ?? unitId;
    return digits.padStart(2, "0");
}

function submitShortcut(): string {
    const platform = typeof navigator === "undefined" ? "" : navigator.platform;
    return /mac/i.test(platform) ? "⌘↵" : "Ctrl↵";
}

function ChannelStepper({
    channel,
    unitLabel,
    usage,
    value,
    max,
    edited,
    onChange,
}: {
    channel: "A" | "B";
    unitLabel: string;
    usage: string;
    value: number;
    max: number;
    edited: boolean;
    onChange: (value: number) => void;
}) {
    const channelTone =
        channel === "A"
            ? "text-violet-600 dark:text-violet-400"
            : "text-blue-600 dark:text-blue-400";
    const barTone = channel === "A" ? "bg-violet-500" : "bg-blue-500";

    return (
        <div className="flex min-w-0 flex-col gap-1">
            <span
                className={cn(
                    "truncate font-mono text-[9px] tracking-wide uppercase",
                    channelTone,
                )}
            >
                {channel} · {usage || "—"}
            </span>

            <div className="flex items-center gap-1">
                <Button
                    type="button"
                    variant="outline"
                    size="icon-xs"
                    aria-label={`Decrease ${unitLabel} channel ${channel} level`}
                    disabled={max <= 0 || value <= 0}
                    onClick={() => onChange(value - 1)}
                    className="size-7 border-border/80 bg-background/60 p-0 text-muted-foreground sm:size-6"
                >
                    <Minus className="size-3.5 sm:size-3" />
                </Button>

                <div
                    title={
                        max < 100
                            ? `Capped at ${max}% by the ${usage} usage limit`
                            : "0–100%"
                    }
                    className={cn(
                        "flex h-7 w-11 items-center justify-center gap-0.5 rounded-md border bg-background/70 focus-within:border-violet-500 focus-within:ring-1 focus-within:ring-violet-500/30 sm:h-6 sm:w-10",
                        edited
                            ? "border-violet-500/70 bg-violet-500/5"
                            : "border-border",
                    )}
                >
                    <input
                        type="number"
                        min={0}
                        max={max}
                        step={1}
                        value={value}
                        aria-label={`${unitLabel} channel ${channel} level`}
                        onFocus={(event) => event.currentTarget.select()}
                        onChange={(event) =>
                            onChange(Number(event.target.value))
                        }
                        className={cn(
                            "w-6 bg-transparent p-0 text-center font-mono text-xs font-semibold outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none sm:w-5 sm:text-[11px]",
                            edited
                                ? "text-violet-700 dark:text-violet-300"
                                : "text-foreground",
                        )}
                    />
                    <span className="font-mono text-[8px] text-muted-foreground/70 sm:text-[7px]">
                        %
                    </span>
                </div>

                <Button
                    type="button"
                    variant="outline"
                    size="icon-xs"
                    aria-label={`Increase ${unitLabel} channel ${channel} level`}
                    disabled={max <= 0 || value >= max}
                    onClick={() => onChange(value + 1)}
                    className="size-7 border-border/80 bg-background/60 p-0 text-muted-foreground sm:size-6"
                >
                    <Plus className="size-3.5 sm:size-3" />
                </Button>
            </div>

            <div className="h-1 w-full overflow-hidden rounded-full bg-muted sm:h-0.5">
                <div
                    className={cn(
                        "h-full rounded-full transition-[width]",
                        value === 0 ? "bg-muted-foreground/30" : barTone,
                    )}
                    style={{
                        width: `${max > 0 ? Math.min(100, (value / max) * 100) : 0}%`,
                    }}
                />
            </div>
        </div>
    );
}

export function SaveProfileDialog() {
    const dispatch = useAppDispatch();
    const { sendCommand } = useWebSocket();

    const open = useAppSelector((state) => state.profiles.saveDialogOpen);
    const profiles = useAppSelector(profilesSelectors.selectAll);
    const units = useAppSelector(unitsSelectors.selectAll);
    const ramps = useAppSelector(rampsSelectors.selectAll);

    const [submitting, setSubmitting] = useState(false);
    const [levels, setLevels] = useState<LevelsByUnit>({});
    const [initialLevels, setInitialLevels] = useState<LevelsByUnit>({});
    const [capturedAt, setCapturedAt] = useState(() => new Date());
    const openedRef = useRef(false);
    const formRef = useRef<HTMLFormElement>(null);

    const form = useForm<FormValues>({
        resolver: zodResolver(profileSaveSchema),
        defaultValues: DEFAULT_VALUES,
    });

    const name = form.watch("name");
    const description = form.watch("description");
    const includeRamps = form.watch("include_ramps");
    const overwrite = form.watch("overwrite");

    // Names are case-insensitive on the server filesystem (Windows)
    const existing = profiles.find(
        (profile) => profile.name.toLowerCase() === name.trim().toLowerCase(),
    );

    // Snapshot the live levels when the dialog opens. Later live updates must
    // not overwrite edits the user is making in the receipt.
    useEffect(() => {
        if (open && !openedRef.current) {
            const snapshot = snapshotLevels(units);
            setLevels(snapshot);
            setInitialLevels(snapshot);
            setCapturedAt(new Date());
            form.reset(DEFAULT_VALUES);
        }
        openedRef.current = open;
    }, [open, units, form]);

    const currentLevel = (unit: UnitSettings, key: ChannelKey): number => {
        const initial = initialLevels[unit.id]?.[key];
        const live = liveLevels(unit)[key];
        const raw = levels[unit.id]?.[key] ?? initial ?? live;
        return Math.min(channelLimit(unit, key), Math.max(0, Math.round(raw)));
    };

    const setLevel = (
        unit: UnitSettings,
        key: ChannelKey,
        rawValue: number,
    ) => {
        const next = Math.min(
            channelLimit(unit, key),
            Math.max(0, Math.round(rawValue)),
        );
        setLevels((previous) => ({
            ...previous,
            [unit.id]: {
                ...(previous[unit.id] ?? liveLevels(unit)),
                [key]: next,
            },
        }));
    };

    const isEdited = (unit: UnitSettings, key: ChannelKey): boolean => {
        const initial = initialLevels[unit.id]?.[key];
        return initial !== undefined && currentLevel(unit, key) !== initial;
    };

    let editedCount = 0;
    for (const unit of units) {
        if (isEdited(unit, "ch_A")) editedCount += 1;
        if (isEdited(unit, "ch_B")) editedCount += 1;
    }
    const hasEdits = editedCount > 0;
    const totalChannels = units.length * 2;
    const totalRamps = includeRamps ? ramps.length : 0;
    const capturedTime = capturedAt.toLocaleTimeString([], {
        hour12: false,
    });
    const shortcut = submitShortcut();

    const signatureBars = useMemo(() => {
        const source =
            units.length > 0
                ? units.flatMap((unit) => {
                      const initial = initialLevels[unit.id];
                      const live = liveLevels(unit);
                      const current = levels[unit.id] ?? initial ?? live;
                      return [
                          Math.min(
                              channelLimit(unit, "ch_A"),
                              Math.max(0, Math.round(current.ch_A)),
                          ),
                          Math.min(
                              channelLimit(unit, "ch_B"),
                              Math.max(0, Math.round(current.ch_B)),
                          ),
                      ];
                  })
                : [0];

        return Array.from({ length: 36 }, (_, index) => {
            const base = source[index % source.length] ?? 0;
            const wobble = 0.55 + 0.45 * Math.abs(Math.sin(index * 0.83 + 1));
            return Math.max(3, Math.round(base * wobble));
        });
    }, [initialLevels, levels, units]);

    // ⌘/Ctrl+Enter commits the dialog from anywhere inside it.
    useEffect(() => {
        if (!open) return;

        const handleKeyDown = (event: KeyboardEvent) => {
            if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
                event.preventDefault();
                formRef.current?.requestSubmit();
            }
        };

        window.addEventListener("keydown", handleKeyDown);
        return () => window.removeEventListener("keydown", handleKeyDown);
    }, [open]);

    const onSubmit = form.handleSubmit(async (values) => {
        if (units.length === 0) return;

        if (existing && !values.overwrite) {
            toast.error("Profile already exists", {
                description: "Enable overwrite to replace it.",
                position: "bottom-right",
            });
            return;
        }

        // Freeze the levels shown in the receipt. Sending the full channel
        // snapshot (not just edits) keeps the saved profile faithful to the
        // preview even if the live rig changes while the dialog is open.
        const levelSnapshot: Record<string, ChannelLevels> = {};
        for (const unit of units) {
            levelSnapshot[unit.id] = {
                ch_A: currentLevel(unit, "ch_A"),
                ch_B: currentLevel(unit, "ch_B"),
            };
        }

        const payload: ProfileSavePayload = {
            name: values.name.trim(),
            description: values.description.trim() || null,
            include_ramps: values.include_ramps,
            overwrite: values.overwrite,
        };
        if (units.length > 0) {
            payload.levels = levelSnapshot;
        }

        setSubmitting(true);
        try {
            const result = await sendCommand("profiles:save", payload);

            if (result.status === "ok") {
                toast.success(`Profile "${values.name.trim()}" saved`, {
                    description:
                        editedCount > 0
                            ? `${editedCount} adjusted level${editedCount === 1 ? "" : "s"} stored with the profile.`
                            : "It is now available for trigger rules and the profile list.",
                    position: "bottom-right",
                });
                dispatch(closeProfileSave());
                return;
            }

            toast.error("Failed to save profile", {
                description: result.message ?? undefined,
                position: "bottom-right",
            });
        } catch (error) {
            toast.error("Failed to save profile", {
                description: error instanceof Error ? error.message : undefined,
                position: "bottom-right",
            });
        } finally {
            setSubmitting(false);
        }
    });

    return (
        <Dialog
            open={open}
            onOpenChange={(value) => {
                if (!value) dispatch(closeProfileSave());
            }}
        >
            <DialogContent
                showCloseButton={false}
                className="max-h-[calc(100dvh-2rem)] gap-0 overflow-hidden rounded-[18px] border-border bg-card p-0 shadow-2xl sm:max-w-[700px] dark:bg-[#121212]"
            >
                <form
                    ref={formRef}
                    onSubmit={onSubmit}
                    className="flex max-h-[calc(100dvh-2rem)] min-h-0 flex-col"
                >
                    <DialogHeader className="flex shrink-0 flex-row items-center gap-3 border-b border-border/70 px-5 py-4 text-left">
                        <div className="accent-tile flex size-9 shrink-0 items-center justify-center rounded-[10px]">
                            <BookmarkPlus className="accent-tile-icon size-4" />
                        </div>

                        <div className="min-w-0 flex-1">
                            <DialogTitle className="text-[17px] leading-tight font-semibold">
                                Save current settings
                            </DialogTitle>
                            <DialogDescription className="text-[11px] leading-snug">
                                Adjust the captured levels, then commit the
                                profile.
                            </DialogDescription>
                        </div>

                        <div className="hidden h-6 items-center gap-1.5 rounded-full border border-violet-500/30 bg-violet-500/10 px-2.5 font-mono text-[8px] tracking-[0.12em] text-violet-700 sm:flex dark:text-violet-300">
                            <SlidersHorizontal className="size-3" />
                            EDIT &amp; COMMIT
                        </div>

                        <DialogClose asChild>
                            <Button
                                type="button"
                                variant="outline"
                                size="icon-sm"
                                className="size-7 border-border/80 bg-background/60 text-muted-foreground"
                            >
                                <X className="size-3.5" />
                                <span className="sr-only">Close</span>
                            </Button>
                        </DialogClose>
                    </DialogHeader>

                    <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
                        <div className="relative">
                            <div className="relative rounded-[14px] border border-border bg-background dark:bg-[#0E0E0E]">
                                <div className="relative rounded-t-[14px] border-b border-border/60 bg-violet-500/[0.06] px-4 py-3.5">
                                    <div className="flex items-center justify-between gap-2">
                                        <label
                                            htmlFor="profile-name"
                                            className="font-mono text-[9px] tracking-[0.12em] text-violet-600 dark:text-violet-300"
                                        >
                                            PROFILE NAME
                                        </label>
                                        <span className="font-mono text-[9px] text-muted-foreground/60">
                                            {name.length} / 32
                                        </span>
                                    </div>

                                    <Input
                                        id="profile-name"
                                        autoComplete="off"
                                        maxLength={32}
                                        placeholder="e.g. NightRide"
                                        aria-invalid={
                                            !!form.formState.errors.name
                                        }
                                        className="mt-1 h-auto rounded-none border-0 border-b border-violet-500/30 bg-transparent px-0 py-1 text-2xl font-semibold shadow-none focus-visible:border-violet-500 focus-visible:ring-0 sm:text-3xl md:text-3xl dark:bg-transparent"
                                        {...form.register("name")}
                                    />

                                    <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[10px]">
                                        {name.trim().length === 0 ? (
                                            <span className="text-muted-foreground">
                                                1–32 characters · letters,
                                                digits, &apos;-&apos; or
                                                &apos;_&apos;
                                            </span>
                                        ) : existing ? (
                                            <span className="flex items-center gap-1 text-amber-600 dark:text-amber-400">
                                                <TriangleAlert className="size-3" />
                                                Already in your library · enable
                                                overwrite below
                                            </span>
                                        ) : (
                                            <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
                                                <CircleCheck className="size-3" />
                                                Available name
                                                <span className="text-muted-foreground/70">
                                                    · single letters work with
                                                    WOF codes
                                                </span>
                                            </span>
                                        )}
                                    </div>
                                    {form.formState.errors.name && (
                                        <p className="mt-1 text-[10px] text-destructive">
                                            {form.formState.errors.name.message}
                                        </p>
                                    )}

                                    <div className="mt-3 flex items-center justify-between gap-2">
                                        <div className="flex items-center gap-2">
                                            <label
                                                htmlFor="profile-note"
                                                className="font-mono text-[9px] tracking-[0.12em] text-muted-foreground"
                                            >
                                                NOTE
                                            </label>
                                            <span className="font-mono text-[8px] text-muted-foreground/50">
                                                OPTIONAL
                                            </span>
                                        </div>
                                        <span className="font-mono text-[9px] text-muted-foreground/60">
                                            {description.length} / 200
                                        </span>
                                    </div>

                                    <Textarea
                                        id="profile-note"
                                        rows={1}
                                        maxLength={200}
                                        placeholder="What this profile feels like..."
                                        aria-invalid={
                                            !!form.formState.errors.description
                                        }
                                        className="mt-1 min-h-0 resize-none rounded-sm border-0 bg-transparent px-0 py-0 text-[11px] leading-relaxed shadow-none focus-visible:bg-violet-500/[0.04] focus-visible:ring-0 md:text-[11px] dark:bg-transparent"
                                        {...form.register("description")}
                                    />
                                    {form.formState.errors.description && (
                                        <p className="mt-1 text-[10px] text-destructive">
                                            {
                                                form.formState.errors
                                                    .description.message
                                            }
                                        </p>
                                    )}

                                    <div className="absolute -bottom-[7px] -left-[7px] z-10 size-3.5 rounded-full bg-card dark:bg-[#121212]" />
                                    <div className="absolute -right-[7px] -bottom-[7px] z-10 size-3.5 rounded-full bg-card dark:bg-[#121212]" />
                                </div>

                                <div className="flex items-center justify-between gap-2 px-4 py-2.5">
                                    <p className="font-mono text-[9px] tracking-[0.12em] text-muted-foreground">
                                        CAPTURED LEVELS
                                    </p>
                                    <p className="font-mono text-[8px] tracking-wide text-muted-foreground/70">
                                        {totalChannels} CHANNELS
                                        {hasEdits
                                            ? ` · ${editedCount} EDITED`
                                            : ` · ${totalRamps} RAMPS`}
                                    </p>
                                </div>

                                {hasEdits && (
                                    <div className="flex items-center gap-2 border-y border-violet-500/20 bg-violet-500/[0.07] px-4 py-2">
                                        <SlidersHorizontal className="size-3 text-violet-500 dark:text-violet-300" />
                                        <span className="text-[10px] text-violet-700 dark:text-violet-300">
                                            {editedCount} level
                                            {editedCount === 1 ? "" : "s"}{" "}
                                            adjusted from live
                                        </span>
                                        <span className="flex-1" />
                                        <button
                                            type="button"
                                            onClick={() =>
                                                setLevels(initialLevels)
                                            }
                                            className="inline-flex items-center gap-1 font-mono text-[8px] tracking-wide uppercase text-violet-600 hover:text-violet-500 dark:text-violet-300"
                                        >
                                            <RotateCcw className="size-2.5" />
                                            Reset to live
                                        </button>
                                    </div>
                                )}

                                {units.length === 0 ? (
                                    <p className="px-4 py-6 text-center text-xs text-muted-foreground">
                                        No unit settings available yet.
                                    </p>
                                ) : (
                                    units.map((unit) => {
                                        const label = `Unit ${unitNumber(unit.id)}`;
                                        const mode =
                                            MODE_2B[unit.mode]?.id ??
                                            `mode ${unit.mode}`;
                                        const power = unit.level_h
                                            ? "high"
                                            : "low";
                                        const dynamic = unit.level_d
                                            ? " · dynamic"
                                            : "";
                                        const modeLabel =
                                            `${mode} · ${power}${dynamic}`.toUpperCase();
                                        const unitRampCount = includeRamps
                                            ? ramps.filter(
                                                  (ramp) =>
                                                      ramp.unit === unit.id,
                                              ).length
                                            : 0;

                                        return (
                                            <div
                                                key={unit.id}
                                                className="flex flex-col gap-2.5 border-b border-border/60 px-4 py-3 sm:flex-row sm:items-center"
                                            >
                                                <div className="flex min-w-0 flex-1 items-center gap-2.5">
                                                    <div className="flex size-7 shrink-0 items-center justify-center rounded-md border border-violet-500/25 bg-violet-500/10 font-mono text-[9px] font-semibold text-violet-600 dark:text-violet-300">
                                                        {unitNumber(unit.id)}
                                                    </div>
                                                    <div className="min-w-0">
                                                        <p className="text-[11px] font-semibold text-foreground">
                                                            {label}
                                                        </p>
                                                        <div className="flex items-center gap-1.5">
                                                            <span className="truncate font-mono text-[8px] tracking-wide text-muted-foreground uppercase">
                                                                {modeLabel}
                                                            </span>
                                                            <span
                                                                className={cn(
                                                                    "rounded-full border px-1.5 py-px font-mono text-[7px]",
                                                                    unitRampCount >
                                                                        0
                                                                        ? "border-violet-500/25 bg-violet-500/10 text-violet-600 dark:text-violet-300"
                                                                        : "border-border bg-muted/40 text-muted-foreground/60",
                                                                )}
                                                            >
                                                                {unitRampCount}{" "}
                                                                RAMP
                                                                {unitRampCount ===
                                                                1
                                                                    ? ""
                                                                    : "S"}
                                                            </span>
                                                        </div>
                                                    </div>
                                                </div>

                                                <div className="grid w-full grid-cols-2 gap-2.5 sm:w-[220px]">
                                                    <ChannelStepper
                                                        channel="A"
                                                        unitLabel={label}
                                                        usage={unit.ch_A_use}
                                                        value={currentLevel(
                                                            unit,
                                                            "ch_A",
                                                        )}
                                                        max={channelLimit(
                                                            unit,
                                                            "ch_A",
                                                        )}
                                                        edited={isEdited(
                                                            unit,
                                                            "ch_A",
                                                        )}
                                                        onChange={(value) =>
                                                            setLevel(
                                                                unit,
                                                                "ch_A",
                                                                value,
                                                            )
                                                        }
                                                    />
                                                    <ChannelStepper
                                                        channel="B"
                                                        unitLabel={label}
                                                        usage={unit.ch_B_use}
                                                        value={currentLevel(
                                                            unit,
                                                            "ch_B",
                                                        )}
                                                        max={channelLimit(
                                                            unit,
                                                            "ch_B",
                                                        )}
                                                        edited={isEdited(
                                                            unit,
                                                            "ch_B",
                                                        )}
                                                        onChange={(value) =>
                                                            setLevel(
                                                                unit,
                                                                "ch_B",
                                                                value,
                                                            )
                                                        }
                                                    />
                                                </div>
                                            </div>
                                        );
                                    })
                                )}

                                <div className="flex items-center gap-1.5 px-4 py-2 text-[10px] text-muted-foreground">
                                    <Check className="size-3 text-emerald-500" />
                                    {hasEdits
                                        ? `${editedCount} level${editedCount === 1 ? "" : "s"} edited · saved to this profile`
                                        : "All connected units captured"}
                                </div>

                                <div className="border-t border-dashed border-border/80" />

                                <div className="flex items-center gap-2.5 px-4 py-2.5">
                                    <div className="flex size-6 shrink-0 items-center justify-center rounded-md border bg-muted/30 text-muted-foreground">
                                        <Activity className="size-3" />
                                    </div>
                                    <div className="min-w-0 flex-1">
                                        <p className="text-[11px] font-medium text-foreground">
                                            Include active ramps
                                        </p>
                                        <p className="text-[9px] text-muted-foreground">
                                            {includeRamps
                                                ? totalRamps > 0
                                                    ? `${totalRamps} running ramp${totalRamps === 1 ? "" : "s"} frozen with the levels`
                                                    : "No active ramps right now"
                                                : "Ramps stay out of this snapshot"}
                                        </p>
                                    </div>
                                    <Switch
                                        checked={includeRamps}
                                        onCheckedChange={(checked) =>
                                            form.setValue(
                                                "include_ramps",
                                                checked,
                                                {
                                                    shouldDirty: true,
                                                },
                                            )
                                        }
                                    />
                                </div>

                                <div className="flex items-center gap-2.5 border-t border-border/60 px-4 py-2.5">
                                    <div className="flex size-6 shrink-0 items-center justify-center rounded-md border bg-muted/30 text-muted-foreground">
                                        <RefreshCw className="size-3" />
                                    </div>
                                    <div className="min-w-0 flex-1">
                                        <p className="text-[11px] font-medium text-foreground">
                                            Overwrite if name exists
                                        </p>
                                        <p
                                            className={cn(
                                                "text-[9px]",
                                                existing
                                                    ? "text-amber-600 dark:text-amber-400"
                                                    : "text-muted-foreground",
                                            )}
                                        >
                                            {existing
                                                ? `"${existing.name}" will be replaced`
                                                : "No matching profile in your library"}
                                        </p>
                                    </div>
                                    <Switch
                                        checked={overwrite}
                                        disabled={!existing}
                                        onCheckedChange={(checked) =>
                                            form.setValue(
                                                "overwrite",
                                                checked,
                                                { shouldDirty: true },
                                            )
                                        }
                                    />
                                </div>

                                <div className="flex items-center gap-2.5 border-t border-border/60 px-4 py-2.5">
                                    <span className="font-mono text-[8px] tracking-[0.12em] text-muted-foreground/70">
                                        SIGNATURE
                                    </span>
                                    <div className="flex h-5 flex-1 items-center gap-[2px]">
                                        {signatureBars.map((bar, index) => (
                                            <span
                                                key={index}
                                                className={cn(
                                                    "w-[2px] rounded-full",
                                                    hasEdits
                                                        ? "bg-violet-500/80"
                                                        : "bg-violet-500/50",
                                                )}
                                                style={{
                                                    height: `${Math.max(
                                                        3,
                                                        Math.round(
                                                            3 +
                                                                (bar / 100) *
                                                                    15,
                                                        ),
                                                    )}px`,
                                                }}
                                            />
                                        ))}
                                    </div>
                                    <span className="font-mono text-[8px] text-muted-foreground/60">
                                        {capturedTime}
                                    </span>
                                </div>

                                <div className="flex items-center justify-between border-t border-border/60 px-4 py-2 font-mono text-[8px] tracking-wide text-muted-foreground/70 uppercase">
                                    <span>
                                        SNAPSHOT #
                                        {String(profiles.length + 1).padStart(
                                            3,
                                            "0",
                                        )}
                                    </span>
                                    <span>{capturedTime} · LOCAL</span>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="flex shrink-0 flex-col gap-2 border-t border-border/70 px-5 py-3 sm:flex-row sm:items-center">
                        <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground sm:flex-1">
                            <ShieldCheck className="size-3.5" />
                            Saves to profile only · live session untouched
                        </div>
                        <div className="flex flex-1 gap-2 sm:flex-none">
                            <DialogClose asChild>
                                <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    className="flex-1 sm:flex-none"
                                >
                                    Cancel
                                </Button>
                            </DialogClose>
                            <Button
                                type="submit"
                                size="sm"
                                disabled={
                                    submitting ||
                                    units.length === 0 ||
                                    (existing != null && !overwrite)
                                }
                                className="flex-1 bg-purple-500 px-4 text-white hover:bg-purple-600 sm:flex-none"
                            >
                                <BookmarkPlus className="size-3.5" />
                                {submitting
                                    ? "Saving..."
                                    : hasEdits
                                      ? "Save adjusted profile"
                                      : "Save profile"}
                                <span className="font-mono text-[9px] opacity-70">
                                    {shortcut}
                                </span>
                            </Button>
                        </div>
                    </div>
                </form>
            </DialogContent>
        </Dialog>
    );
}
