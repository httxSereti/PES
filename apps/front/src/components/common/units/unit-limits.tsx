import { useEffect, useState } from "react";
import { Pencil } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@pes/ui/components/button";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@pes/ui/components/dialog";
import { Input } from "@pes/ui/components/input";
import { cn } from "@pes/ui/lib/utils";

import { useWebSocket } from "@/hooks/useWebSocket";
import { hasPermission } from "@/lib/permissions";
import { useAppSelector } from "@/store/hooks";
import { unitsSelectors } from "@/store/slices/unitsSlice";
import { Permission, type UsageLimit } from "@/types";

type Channel = "A" | "B";

type LimitsDraft = Record<Channel, UsageLimit>;

const FALLBACK_LIMIT: UsageLimit = { start: 0, warn: 0, max: 100 };
const CHANNELS: Channel[] = ["A", "B"];
const FIELDS = [
    { key: "start", label: "Start" },
    { key: "warn", label: "Warn" },
    { key: "max", label: "Max" },
] as const;

function toDraft(
    limitA: UsageLimit | undefined,
    limitB: UsageLimit | undefined,
): LimitsDraft {
    return {
        A: { ...(limitA ?? FALLBACK_LIMIT) },
        B: { ...(limitB ?? FALLBACK_LIMIT) },
    };
}

function clampValue(raw: string): number {
    const parsed = Number.parseInt(raw, 10);
    if (!Number.isFinite(parsed)) return 0;
    return Math.min(100, Math.max(0, parsed));
}

function isValidLimit(limit: UsageLimit): boolean {
    return (
        Number.isInteger(limit.start) &&
        Number.isInteger(limit.warn) &&
        Number.isInteger(limit.max) &&
        limit.start >= 0 &&
        limit.start <= limit.warn &&
        limit.warn <= limit.max &&
        limit.max <= 100
    );
}

/**
 * Host-only editor for the persisted per-unit/channel limits.
 * The collapsed row shows the current max for both channels.
 */
export function UnitLimits({ unitId }: { unitId: string }) {
    const user = useAppSelector((state) => state.auth.user);
    const unit = useAppSelector((state) =>
        unitsSelectors.selectById(state, unitId),
    );
    const { sendCommand } = useWebSocket();

    const [open, setOpen] = useState(false);
    const [pending, setPending] = useState(false);
    const [draft, setDraft] = useState<LimitsDraft>(() =>
        toDraft(unit?.ch_A_limit, unit?.ch_B_limit),
    );

    useEffect(() => {
        if (open) setDraft(toDraft(unit?.ch_A_limit, unit?.ch_B_limit));
    }, [open, unit?.ch_A_limit, unit?.ch_B_limit]);

    if (!unit || !hasPermission(user, Permission.HOST)) return null;

    const invalid = !isValidLimit(draft.A) || !isValidLimit(draft.B);

    const updateValue = (
        channel: Channel,
        field: keyof UsageLimit,
        raw: string,
    ) => {
        const value = clampValue(raw);
        setDraft((current) => ({
            ...current,
            [channel]: { ...current[channel], [field]: value },
        }));
    };

    const save = async () => {
        if (pending || invalid) return;

        setPending(true);
        try {
            const result = await sendCommand("units:update_limits", {
                [unitId]: {
                    ch_A_limit: draft.A,
                    ch_B_limit: draft.B,
                },
            });

            if (result.status !== "ok") {
                throw new Error(result.message ?? "Command failed");
            }

            toast.success(`${unitId} limits updated`, {
                description: "Saved and applied to the live channels.",
                position: "bottom-right",
            });
            setOpen(false);
        } catch (error) {
            toast.error(`Failed to update ${unitId} limits`, {
                description:
                    error instanceof Error ? error.message : "Unknown error",
                position: "bottom-right",
            });
        } finally {
            setPending(false);
        }
    };

    return (
        <div className="flex items-center justify-between gap-2">
            <span className="font-mono-dm text-[10px] text-muted-foreground uppercase tracking-wider">
                Limits
            </span>
            <Dialog open={open} onOpenChange={setOpen}>
                <DialogTrigger asChild>
                    <Button
                        variant="outline"
                        size="sm"
                        className="font-mono-dm h-7 gap-1.5 px-2 text-[10px]"
                    >
                        <Pencil className="size-3" />A{" "}
                        {unit.ch_A_limit?.max ?? "—"} · B{" "}
                        {unit.ch_B_limit?.max ?? "—"}
                    </Button>
                </DialogTrigger>
                <DialogContent className="sm:max-w-[480px]">
                    <DialogHeader>
                        <DialogTitle>Channel limits · {unitId}</DialogTitle>
                        <DialogDescription>
                            Host-only values, saved across restarts. A live
                            level above <span className="font-mono">max</span>{" "}
                            is clamped immediately.
                        </DialogDescription>
                    </DialogHeader>

                    <div className="flex flex-col gap-3">
                        {CHANNELS.map((channel) => {
                            const isA = channel === "A";
                            const usage = isA ? unit.ch_A_use : unit.ch_B_use;
                            const limit = draft[channel];
                            const valid = isValidLimit(limit);

                            return (
                                <div
                                    key={channel}
                                    className="rounded-xl border border-border/50 bg-muted/20 p-3"
                                >
                                    <div className="mb-3 flex items-center justify-between gap-2">
                                        <span
                                            className={cn(
                                                "font-mono text-[10px] tracking-[0.5px] uppercase",
                                                isA
                                                    ? "text-violet-600 dark:text-violet-400"
                                                    : "text-blue-600 dark:text-blue-400",
                                            )}
                                        >
                                            Channel {channel}
                                        </span>
                                        <span className="font-mono text-[10px] text-muted-foreground">
                                            {usage || "—"}
                                        </span>
                                    </div>

                                    <div className="grid grid-cols-3 gap-2">
                                        {FIELDS.map(({ key, label }) => (
                                            <label
                                                key={key}
                                                className="flex flex-col gap-1"
                                            >
                                                <span className="font-mono text-[9px] tracking-wide text-muted-foreground uppercase">
                                                    {label}
                                                </span>
                                                <Input
                                                    type="number"
                                                    min={0}
                                                    max={100}
                                                    value={limit[key]}
                                                    aria-label={`Channel ${channel} ${label}`}
                                                    onChange={(event) =>
                                                        updateValue(
                                                            channel,
                                                            key,
                                                            event.target.value,
                                                        )
                                                    }
                                                    className="h-8 text-center font-mono text-xs"
                                                />
                                            </label>
                                        ))}
                                    </div>

                                    {!valid && (
                                        <p className="mt-2 font-mono text-[9px] text-amber-500">
                                            Requires start ≤ warn ≤ max ≤ 100.
                                        </p>
                                    )}
                                </div>
                            );
                        })}
                    </div>

                    <DialogFooter>
                        <Button
                            variant="outline"
                            onClick={() => setOpen(false)}
                            disabled={pending}
                        >
                            Cancel
                        </Button>
                        <Button onClick={save} disabled={pending || invalid}>
                            {pending ? "Saving…" : "Save limits"}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
