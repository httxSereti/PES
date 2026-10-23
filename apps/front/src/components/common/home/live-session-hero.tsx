import { useMemo, useState } from "react";
import { ArrowRight, CircleDashed, CircleStop, Square } from "lucide-react";
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
} from "@pes/ui/components/alert-dialog";
import { Button } from "@pes/ui/components/button";
import { cn } from "@pes/ui/lib/utils";

import {
    FIELD_LABELS,
    unitFieldSortKey,
} from "@/components/common/ramps/ramp.constants";
import { ProfileMonogram } from "@/components/common/profiles/profile-badges";
import { useSessionInfo } from "@/components/layout/sidebar/control-panel/use-session-info";
import {
    CountdownTimer,
    SessionTimer,
} from "@/components/layout/sidebar/session/session-timer";
import { useWebSocket } from "@/hooks/useWebSocket";
import { hasPermission } from "@/lib/permissions";
import { useAppSelector } from "@/store/hooks";
import { rampsSelectors } from "@/store/slices/rampsSlice";
import { unitsSelectors } from "@/store/slices/unitsSlice";
import { selectActiveProfile } from "@/store/slices/profilesSlice";
import {
    Permission,
    type Ramp,
    type RampTarget,
    type UnitSettings,
} from "@/types";

const FIELD_TONES = {
    ch_A: {
        text: "text-violet-500 dark:text-violet-400",
        bar: "bg-violet-500",
        track: "bg-violet-500/15",
    },
    ch_B: {
        text: "text-blue-500 dark:text-blue-400",
        bar: "bg-blue-500",
        track: "bg-blue-500/15",
    },
    adj_1: {
        text: "text-amber-500 dark:text-amber-400",
        bar: "bg-amber-500",
        track: "bg-amber-500/15",
    },
    adj_2: {
        text: "text-emerald-500 dark:text-emerald-400",
        bar: "bg-emerald-500",
        track: "bg-emerald-500/15",
    },
};

function fieldShortLabel(field: string): string {
    switch (field) {
        case "ch_A":
            return "A";
        case "ch_B":
            return "B";
        case "adj_1":
            return "ADJ 1";
        case "adj_2":
            return "ADJ 2";
        default:
            return field;
    }
}

function liveFieldValue(
    unit: UnitSettings | undefined,
    field: string,
    fallback: number,
): number {
    if (!unit) return fallback;

    switch (field) {
        case "ch_A":
            return unit.ch_A;
        case "ch_B":
            return unit.ch_B;
        case "adj_1":
            return unit.adj_1;
        case "adj_2":
            return unit.adj_2;
        default:
            return fallback;
    }
}

function rampPercent(ramp: Ramp, unit: UnitSettings | undefined): number {
    const liveValue = liveFieldValue(unit, ramp.field, ramp.value);
    if (ramp.max_value > 0) {
        return Math.min(
            100,
            Math.max(0, Math.round((liveValue / ramp.max_value) * 100)),
        );
    }
    return Math.min(100, Math.max(0, Math.round(ramp.progress)));
}

export function LiveSessionHero() {
    const user = useAppSelector((state) => state.auth.user);
    const units = useAppSelector(unitsSelectors.selectAll);
    const ramps = useAppSelector(rampsSelectors.selectAll);
    const activeProfile = useAppSelector(selectActiveProfile);
    const { activeSession, isLive, sessionHref, SessionIcon } =
        useSessionInfo();
    const { sendCommand } = useWebSocket();

    const [profilePending, setProfilePending] = useState(false);
    const [endingSession, setEndingSession] = useState(false);
    const [endOpen, setEndOpen] = useState(false);

    const canWrite = hasPermission(user, Permission.WRITE_UNITS);
    const canManageSession = hasPermission(user, Permission.SESSION_MANAGE);
    const canReadProfiles = hasPermission(user, Permission.READ_PROFILES);

    const unitById = useMemo(
        () => new Map(units.map((unit) => [unit.id, unit])),
        [units],
    );
    const sortedRamps = useMemo(
        () =>
            [...ramps].sort((a, b) =>
                unitFieldSortKey(a.unit, a.field).localeCompare(
                    unitFieldSortKey(b.unit, b.field),
                ),
            ),
        [ramps],
    );
    const visibleRamps = sortedRamps.slice(0, 5);

    const stopProfile = async () => {
        if (!activeProfile || profilePending) return;
        setProfilePending(true);
        try {
            const result = await sendCommand("profiles:stop", {});
            if (result.status !== "ok") {
                throw new Error(result.message ?? "Command failed");
            }
            toast.success(`Profile "${activeProfile.name}" stopped`, {
                description: "Previous settings restored.",
                position: "bottom-right",
            });
        } catch (error) {
            toast.error("Failed to stop profile", {
                description:
                    error instanceof Error ? error.message : "Unknown error",
                position: "bottom-right",
            });
        } finally {
            setProfilePending(false);
        }
    };

    const endSession = async () => {
        if (endingSession) return;
        setEndingSession(true);
        try {
            const result = await sendCommand("session:end");
            if (result.status !== "ok") {
                throw new Error(result.message ?? "Command failed");
            }
            toast.success("Session ended", {
                description: result.message ?? "The session was ended.",
                position: "bottom-right",
            });
            setEndOpen(false);
        } catch (error) {
            toast.error("Failed to end session", {
                description:
                    error instanceof Error ? error.message : "Unknown error",
                position: "bottom-right",
            });
        } finally {
            setEndingSession(false);
        }
    };

    const profileUnitCount = activeProfile?.units?.length ?? 0;

    return (
        <section className="flex h-full flex-col gap-4 rounded-2xl border border-violet-500/25 bg-gradient-to-br from-violet-500/[0.08] via-card to-card p-4 sm:p-5">
            <div className="flex flex-wrap items-center gap-2">
                <span className="flex items-center gap-1.5 font-mono text-[10px] tracking-[0.14em] text-violet-500 uppercase dark:text-violet-400">
                    {isLive ? (
                        <span className="relative flex size-2">
                            <span className="absolute inline-flex size-full animate-ping rounded-full bg-violet-400 opacity-75" />
                            <span className="relative inline-flex size-2 rounded-full bg-violet-500" />
                        </span>
                    ) : (
                        <CircleDashed className="size-3.5" />
                    )}
                    {isLive ? "Live session" : "No live session"}
                </span>
                <span className="min-w-0 truncate text-xs text-muted-foreground">
                    {activeSession?.name ?? "Manual control"}
                </span>
                <span className="ml-auto flex items-center gap-2 font-mono text-[10px] text-muted-foreground">
                    <SessionIcon className="size-3.5" />
                    {isLive ? (
                        <SessionTimer
                            startedAt={activeSession?.started_at ?? null}
                        />
                    ) : (
                        "idle"
                    )}
                </span>
            </div>

            <div className="flex flex-col gap-5 lg:flex-row lg:items-center">
                <div className="flex min-w-0 flex-1 flex-col gap-3">
                    <div className="font-mono text-4xl leading-none font-semibold tracking-tight tabular-nums sm:text-5xl">
                        {isLive ? (
                            <SessionTimer
                                startedAt={activeSession?.started_at ?? null}
                                className="text-4xl leading-none font-semibold tracking-tight sm:text-5xl"
                            />
                        ) : (
                            <span className="font-syne text-4xl font-extrabold sm:text-5xl">
                                Idle
                            </span>
                        )}
                    </div>

                    {activeProfile ? (
                        <>
                            <div className="flex flex-wrap items-center gap-2 text-xs">
                                <ProfileMonogram
                                    name={activeProfile.name}
                                    legacy={false}
                                    className="size-6 rounded-md text-[10px]"
                                />
                                <span className="font-semibold text-foreground">
                                    {activeProfile.name}
                                </span>
                                <span className="text-muted-foreground">
                                    at {activeProfile.level_pct}%
                                </span>
                                <span className="text-muted-foreground/50">
                                    ·
                                </span>
                                <span className="font-mono text-muted-foreground">
                                    {activeProfile.ends_at ? (
                                        <CountdownTimer
                                            endsAt={activeProfile.ends_at}
                                        />
                                    ) : (
                                        "∞"
                                    )}{" "}
                                    left
                                </span>
                                {profileUnitCount > 0 && (
                                    <span className="font-mono text-muted-foreground">
                                        · {profileUnitCount} unit
                                        {profileUnitCount === 1 ? "" : "s"}
                                    </span>
                                )}
                            </div>
                            <div className="h-1 w-full max-w-xs overflow-hidden rounded-full bg-muted">
                                <div
                                    className="h-full rounded-full bg-violet-500 transition-[width]"
                                    style={{
                                        width: `${Math.min(
                                            100,
                                            Math.max(
                                                0,
                                                activeProfile.level_pct,
                                            ),
                                        )}%`,
                                    }}
                                />
                            </div>
                        </>
                    ) : (
                        <p className="text-xs text-muted-foreground">
                            No profile running.
                            {canReadProfiles && (
                                <Link
                                    to="/app/profiles"
                                    className="ml-1 text-violet-500 hover:underline dark:text-violet-400"
                                >
                                    Browse profiles →
                                </Link>
                            )}
                        </p>
                    )}

                    <div className="flex flex-wrap items-center gap-2">
                        {activeProfile && canWrite && (
                            <Button
                                variant="outline"
                                size="sm"
                                className="cursor-pointer"
                                disabled={profilePending}
                                onClick={() => void stopProfile()}
                            >
                                <Square className="size-3.5" />
                                {profilePending ? "Stopping…" : "Stop profile"}
                            </Button>
                        )}
                        {isLive && (
                            <Button
                                asChild
                                variant="ghost"
                                size="sm"
                                className="cursor-pointer"
                            >
                                <Link to={sessionHref}>
                                    Open session
                                    <ArrowRight className="size-3.5" />
                                </Link>
                            </Button>
                        )}
                        {isLive && canManageSession && (
                            <Button
                                variant="outline"
                                size="sm"
                                className="cursor-pointer text-destructive hover:text-destructive"
                                onClick={() => setEndOpen(true)}
                            >
                                <CircleStop className="size-3.5" />
                                End session
                            </Button>
                        )}
                    </div>
                </div>

                <div className="flex min-w-0 flex-col gap-2 border-t border-border/50 pt-4 lg:w-[46%] lg:border-t-0 lg:border-l lg:pt-0 lg:pl-5">
                    <div className="flex items-center gap-2">
                        <span className="font-mono text-[9px] tracking-[0.14em] text-muted-foreground/60 uppercase">
                            Ramp lanes
                        </span>
                        <span className="font-mono text-[9px] text-emerald-500">
                            {sortedRamps.length} live
                        </span>
                        <Link
                            to="/app/units"
                            className="ml-auto text-[10px] text-muted-foreground hover:text-foreground"
                        >
                            Units →
                        </Link>
                    </div>

                    {visibleRamps.length === 0 ? (
                        <div className="flex flex-1 flex-col justify-center gap-1 py-4">
                            <p className="text-xs text-muted-foreground">
                                No ramps running.
                            </p>
                            <Link
                                to="/app/units"
                                className="text-xs text-violet-500 hover:underline dark:text-violet-400"
                            >
                                Open units to start one →
                            </Link>
                        </div>
                    ) : (
                        <div className="flex flex-col">
                            {visibleRamps.map((ramp) => {
                                const tone =
                                    FIELD_TONES[
                                        ramp.field as keyof typeof FIELD_TONES
                                    ] ?? FIELD_TONES.ch_A;
                                const pct = rampPercent(
                                    ramp,
                                    unitById.get(ramp.unit),
                                );

                                return (
                                    <Link
                                        key={`${ramp.unit}.${ramp.field}`}
                                        to="/app/units"
                                        title={`${ramp.unit} · ${FIELD_LABELS[ramp.field as RampTarget["field"]] ?? ramp.field}`}
                                        className="group flex items-center gap-2.5 rounded-md px-1.5 py-1.5 transition-colors hover:bg-muted/35"
                                    >
                                        <span
                                            className={cn(
                                                "w-16 shrink-0 font-mono text-[10px]",
                                                tone.text,
                                            )}
                                        >
                                            {ramp.unit} ·{" "}
                                            {fieldShortLabel(ramp.field)}
                                        </span>
                                        <span className="w-14 shrink-0 truncate font-mono text-[9px] text-muted-foreground">
                                            {ramp.mode.toUpperCase()}
                                        </span>
                                        <span
                                            className={cn(
                                                "relative h-1 flex-1 overflow-hidden rounded-full",
                                                tone.track,
                                            )}
                                        >
                                            <span
                                                className={cn(
                                                    "absolute inset-y-0 left-0 rounded-full",
                                                    tone.bar,
                                                )}
                                                style={{ width: `${pct}%` }}
                                            />
                                        </span>
                                        <span className="w-8 text-right font-mono text-[10px] tabular-nums">
                                            {pct}%
                                        </span>
                                        {ramp.paused && (
                                            <span className="font-mono text-[8px] text-amber-500">
                                                paused
                                            </span>
                                        )}
                                    </Link>
                                );
                            })}
                            {sortedRamps.length > visibleRamps.length && (
                                <Link
                                    to="/app/units"
                                    className="mt-1 self-start text-[10px] text-muted-foreground hover:text-foreground"
                                >
                                    +{sortedRamps.length - visibleRamps.length}{" "}
                                    more ramp
                                    {sortedRamps.length -
                                        visibleRamps.length ===
                                    1
                                        ? ""
                                        : "s"}{" "}
                                    →
                                </Link>
                            )}
                        </div>
                    )}
                </div>
            </div>

            <AlertDialog open={endOpen} onOpenChange={setEndOpen}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>End the session?</AlertDialogTitle>
                        <AlertDialogDescription>
                            This ends “{activeSession?.name ?? "the session"}”
                            and stops all running units.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                            disabled={endingSession}
                            onClick={() => void endSession()}
                        >
                            <CircleStop className="size-4" />
                            {endingSession ? "Ending…" : "End session"}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </section>
    );
}
