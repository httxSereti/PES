import { useState, type ReactNode } from "react";
import {
    ArrowUpRight,
    BookmarkPlus,
    ListChecks,
    Radar,
    ScrollText,
    SlidersHorizontal,
    Square,
} from "lucide-react";
import { Link } from "react-router";
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
    AlertDialogTrigger,
} from "@pes/ui/components/alert-dialog";
import { cn } from "@pes/ui/lib/utils";

import { useWebSocket } from "@/hooks/useWebSocket";
import { hasPermission } from "@/lib/permissions";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import { selectQueueStatus } from "@/store/slices/queueSlice";
import { openProfileSave } from "@/store/slices/profilesSlice";
import { Permission } from "@/types";

type TileTone = "danger" | "accent" | "neutral";

const TILE_TONES: Record<
    TileTone,
    { card: string; icon: string; label: string }
> = {
    danger: {
        card: "border-rose-500/25 bg-rose-500/[0.07] hover:bg-rose-500/[0.12]",
        icon: "text-rose-500 dark:text-rose-400",
        label: "text-rose-600 dark:text-rose-300",
    },
    accent: {
        card: "border-violet-500/25 bg-violet-500/[0.07] hover:bg-violet-500/[0.12]",
        icon: "text-violet-500 dark:text-violet-400",
        label: "text-violet-600 dark:text-violet-300",
    },
    neutral: {
        card: "border-border/50 bg-muted/10 hover:bg-muted/25",
        icon: "text-muted-foreground",
        label: "text-foreground",
    },
};

function TileContent({
    icon,
    label,
    sub,
    tone,
}: {
    icon: ReactNode;
    label: string;
    sub: string;
    tone: TileTone;
}) {
    const styles = TILE_TONES[tone];
    return (
        <>
            <span className="flex w-full items-center">
                <span className={styles.icon}>{icon}</span>
                <ArrowUpRight
                    className={cn("ml-auto size-3 opacity-40", styles.icon)}
                />
            </span>
            <span className="mt-auto flex flex-col gap-0.5 text-left">
                <span className={cn("text-[11px] font-semibold", styles.label)}>
                    {label}
                </span>
                <span className="text-[9px] text-muted-foreground">{sub}</span>
            </span>
        </>
    );
}

function ActionLink({
    to,
    icon,
    label,
    sub,
    tone,
}: {
    to: string;
    icon: ReactNode;
    label: string;
    sub: string;
    tone: TileTone;
}) {
    return (
        <Link
            to={to}
            className={cn(
                "flex min-h-[68px] flex-col rounded-xl border p-2.5 transition-colors",
                TILE_TONES[tone].card,
            )}
        >
            <TileContent icon={icon} label={label} sub={sub} tone={tone} />
        </Link>
    );
}

function ActionButton({
    icon,
    label,
    sub,
    tone,
    onClick,
}: {
    icon: ReactNode;
    label: string;
    sub: string;
    tone: TileTone;
    onClick: () => void;
}) {
    return (
        <button
            type="button"
            className={cn(
                "flex min-h-[68px] cursor-pointer flex-col rounded-xl border p-2.5 text-left transition-colors",
                TILE_TONES[tone].card,
            )}
            onClick={onClick}
        >
            <TileContent icon={icon} label={label} sub={sub} tone={tone} />
        </button>
    );
}

function StopAllTile() {
    const { sendCommand } = useWebSocket();
    const [open, setOpen] = useState(false);
    const [stopping, setStopping] = useState(false);

    const stopAll = async () => {
        if (stopping) return;
        setStopping(true);
        try {
            const result = await sendCommand("core:stop");
            if (result.status !== "ok") {
                throw new Error(result.message ?? "Command failed");
            }
            toast.success("Emergency stop", {
                description: "All units stopped and the action queue cleared.",
                position: "bottom-right",
            });
            setOpen(false);
        } catch (error) {
            toast.error("Emergency stop failed", {
                description:
                    error instanceof Error ? error.message : "Unknown error",
                position: "bottom-right",
            });
        } finally {
            setStopping(false);
        }
    };

    return (
        <AlertDialog open={open} onOpenChange={setOpen}>
            <AlertDialogTrigger asChild>
                <button
                    type="button"
                    className={cn(
                        "flex min-h-[68px] cursor-pointer flex-col rounded-xl border p-2.5 text-left transition-colors",
                        TILE_TONES.danger.card,
                    )}
                >
                    <TileContent
                        icon={<Square className="size-4" />}
                        label="Stop all"
                        sub="Zero every channel"
                        tone="danger"
                    />
                </button>
            </AlertDialogTrigger>
            <AlertDialogContent>
                <AlertDialogHeader>
                    <AlertDialogTitle>Stop all units?</AlertDialogTitle>
                    <AlertDialogDescription>
                        This cancels every running ramp, sets all channels to
                        zero, and clears the action queue.
                    </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                        disabled={stopping}
                        onClick={() => void stopAll()}
                    >
                        <Square className="size-4" />
                        {stopping ? "Stopping…" : "Stop all"}
                    </AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
    );
}

export function QuickActions() {
    const dispatch = useAppDispatch();
    const user = useAppSelector((state) => state.auth.user);
    const queue = useAppSelector(selectQueueStatus);

    const canWriteUnits = hasPermission(user, Permission.WRITE_UNITS);
    const canWriteProfiles = hasPermission(user, Permission.WRITE_PROFILES);
    const canReadEvents = hasPermission(user, Permission.READ_EVENTS);
    const canSeeQueue = hasPermission(user, Permission.ADMIN);

    return (
        <section className="flex h-full flex-col gap-3 rounded-2xl border bg-card p-4">
            <div className="flex items-center gap-2">
                <h2 className="font-syne text-sm font-bold">Quick actions</h2>
                <span className="font-mono text-[8px] tracking-[0.12em] text-muted-foreground/50 uppercase">
                    pinned
                </span>
            </div>

            <div className="grid flex-1 grid-cols-2 gap-2">
                {canWriteUnits && <StopAllTile />}

                {canWriteProfiles && (
                    <ActionButton
                        icon={<BookmarkPlus className="size-4" />}
                        label="Save profile"
                        sub="Snapshot current rig"
                        tone="accent"
                        onClick={() => dispatch(openProfileSave())}
                    />
                )}

                <ActionLink
                    to="/app/units"
                    icon={<SlidersHorizontal className="size-4" />}
                    label="Open units"
                    sub="Deep control"
                    tone="neutral"
                />

                {canReadEvents ? (
                    <ActionLink
                        to="/app/events/triggered"
                        icon={<ScrollText className="size-4" />}
                        label="Event log"
                        sub="Recent triggers"
                        tone="neutral"
                    />
                ) : (
                    <ActionLink
                        to="/app/sensors"
                        icon={<Radar className="size-4" />}
                        label="Open sensors"
                        sub="Room readings"
                        tone="neutral"
                    />
                )}
            </div>

            {canSeeQueue && (
                <div
                    className={cn(
                        "mt-auto flex items-center gap-2 rounded-lg border px-2.5 py-2 font-mono text-[8px]",
                        queue?.paused
                            ? "border-amber-500/25 bg-amber-500/[0.07] text-amber-600 dark:text-amber-400"
                            : "border-border/50 bg-muted/10 text-muted-foreground",
                    )}
                >
                    <ListChecks className="size-3.5 shrink-0" />
                    {queue ? (
                        <>
                            <span>
                                {queue.paused ? "paused · " : ""}
                                {queue.waiting} waiting · {queue.total_done}{" "}
                                done
                            </span>
                            <span className="ml-auto text-muted-foreground/50">
                                queue
                            </span>
                        </>
                    ) : (
                        <>
                            <span>Action queue</span>
                            <span className="ml-auto text-muted-foreground/50">
                                waiting…
                            </span>
                        </>
                    )}
                </div>
            )}
        </section>
    );
}
