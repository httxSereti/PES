import { useMemo } from "react";
import {
    Bookmark,
    Gavel,
    Lock,
    Move,
    Volume2,
    Zap,
    type LucideIcon,
} from "lucide-react";
import { Link } from "react-router";

import { cn } from "@pes/ui/lib/utils";

import { formatClockTime } from "@/lib/format-date";
import { hasPermission } from "@/lib/permissions";
import { useAppSelector } from "@/store/hooks";
import { Permission, type TriggeredEvent } from "@/types";

type EventTone = {
    icon: LucideIcon;
    text: string;
    tile: string;
};

function eventTone(type: string): EventTone {
    if (type.startsWith("chaster")) {
        return {
            icon: type.includes("pillory") ? Gavel : Bookmark,
            text: "text-violet-600 dark:text-violet-300",
            tile: "bg-violet-500/12 text-violet-500 dark:text-violet-400",
        };
    }
    if (type.startsWith("sensor_sound")) {
        return {
            icon: Volume2,
            text: "text-teal-600 dark:text-teal-300",
            tile: "bg-teal-500/12 text-teal-500 dark:text-teal-400",
        };
    }
    if (type.startsWith("sensor")) {
        return {
            icon: Move,
            text: "text-teal-600 dark:text-teal-300",
            tile: "bg-teal-500/12 text-teal-500 dark:text-teal-400",
        };
    }
    if (type.startsWith("puryfi")) {
        return {
            icon: Lock,
            text: "text-pink-600 dark:text-pink-300",
            tile: "bg-pink-500/12 text-pink-500 dark:text-pink-400",
        };
    }
    return {
        icon: Zap,
        text: "text-amber-600 dark:text-amber-300",
        tile: "bg-amber-500/12 text-amber-500 dark:text-amber-400",
    };
}

function eventLabel(type: string): string {
    return type.replaceAll("_", " ");
}

function EventRow({ event }: { event: TriggeredEvent }) {
    const tone = eventTone(event.event_type);
    const Icon = tone.icon;
    const firstRule = event.triggered_rules[0]?.rule_name;

    return (
        <div className="flex items-center gap-2.5 border-b border-border/40 py-2 last:border-b-0">
            <span
                className={cn(
                    "grid size-7 shrink-0 place-items-center rounded-lg",
                    tone.tile,
                )}
            >
                <Icon className="size-3.5" />
            </span>
            <div className="min-w-0 flex-1">
                <p
                    className="truncate font-mono text-[10px] font-medium text-foreground"
                    title={event.event_type}
                >
                    {eventLabel(event.event_type)}
                </p>
                <p className="truncate text-[9px] text-muted-foreground">
                    {formatClockTime(event.triggered_at, false)}
                    {firstRule ? ` · ${firstRule}` : ""}
                </p>
            </div>
            {firstRule && (
                <span
                    className={cn(
                        "max-w-[92px] shrink-0 truncate rounded-full border border-border/50 bg-muted/30 px-2 py-0.5 font-mono text-[8px]",
                        tone.text,
                    )}
                    title={firstRule}
                >
                    {firstRule}
                </span>
            )}
        </div>
    );
}

export function HomeActivity() {
    const user = useAppSelector((state) => state.auth.user);
    const events = useAppSelector((state) => state.events.events);
    const canReadEvents = hasPermission(user, Permission.READ_EVENTS);

    const latest = useMemo(() => events.slice(-5).reverse(), [events]);

    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const eventsToday = events.filter(
        (event) =>
            new Date(event.triggered_at).getTime() >= startOfDay.getTime(),
    ).length;

    return (
        <section className="flex h-full flex-col gap-3 rounded-2xl border bg-card p-4">
            <div className="flex items-center gap-2">
                <h2 className="font-syne text-sm font-bold">Activity</h2>
                {canReadEvents && (
                    <span className="flex items-center gap-1 font-mono text-[8px] text-emerald-500">
                        <span className="size-1 rounded-full bg-emerald-500" />
                        live
                    </span>
                )}
                <Link
                    to="/app/events/triggered"
                    className={cn(
                        "ml-auto text-[10px] text-muted-foreground transition-colors hover:text-foreground",
                        !canReadEvents && "hidden",
                    )}
                >
                    View all →
                </Link>
            </div>

            {!canReadEvents ? (
                <div className="flex flex-1 flex-col items-center justify-center gap-2 py-8 text-center">
                    <Lock className="size-6 text-muted-foreground/40" />
                    <p className="text-xs text-muted-foreground">
                        The event feed needs event access.
                    </p>
                </div>
            ) : latest.length === 0 ? (
                <div className="flex flex-1 flex-col items-center justify-center gap-2 py-8 text-center">
                    <Zap className="size-6 text-muted-foreground/30" />
                    <p className="text-xs text-muted-foreground">
                        Waiting for the first event…
                    </p>
                </div>
            ) : (
                <div className="flex flex-col">
                    {latest.map((event) => (
                        <EventRow key={event.id} event={event} />
                    ))}
                </div>
            )}

            <div className="mt-auto flex items-center justify-between border-t border-border/50 pt-2.5 text-[9px] text-muted-foreground">
                <span className="font-mono">
                    {canReadEvents
                        ? `${eventsToday} events today`
                        : "restricted"}
                </span>
                {canReadEvents && (
                    <Link
                        to="/app/events/triggered"
                        className="transition-colors hover:text-foreground"
                    >
                        Event log →
                    </Link>
                )}
            </div>
        </section>
    );
}
