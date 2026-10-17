import { useMemo } from "react";
import { ArrowRight } from "lucide-react";
import { Link } from "react-router";
import { Card, CardContent, CardHeader, CardTitle } from "@pes/ui/components/card";
import {
    EventTypeBadge,
    TriggeredRulesBadges,
} from "@/components/common/events/event-badges";
import { useAppSelector } from "@/store/hooks";
import type { TriggeredEvent } from "@/types";

const MAX_ITEMS = 6;

function ActivityRow({ event }: { event: TriggeredEvent }) {
    const time = useMemo(
        () =>
            new Date(event.triggered_at).toLocaleTimeString("fr-FR", {
                hour: "2-digit",
                minute: "2-digit",
                second: "2-digit",
            }),
        [event.triggered_at],
    );

    return (
        <div className="flex flex-col gap-1.5 border-b border-border/40 py-2 last:border-b-0">
            <div className="flex items-center gap-2">
                <span className="font-mono text-[11px] tabular-nums text-muted-foreground/50 whitespace-nowrap">
                    {time}
                </span>
                <EventTypeBadge type={event.event_type} />
            </div>
            <TriggeredRulesBadges rules={event.triggered_rules} />
        </div>
    );
}

/** Latest triggered events, sized for the home page side rail. */
export function RecentActivity() {
    const events = useAppSelector((state) => state.events.events);
    const latest = useMemo(
        () => [...events].slice(-MAX_ITEMS).reverse(),
        [events],
    );

    return (
        <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-3">
                <CardTitle className="flex items-center gap-2 text-sm">
                    <span>Recent activity</span>
                    <span className="font-normal text-[10px] uppercase tracking-widest text-muted-foreground/50">
                        last {MAX_ITEMS}
                    </span>
                </CardTitle>
                <Link
                    to="/app/events/triggered"
                    className="flex items-center gap-1 text-xs text-muted-foreground/70 transition-colors hover:text-violet-600 dark:hover:text-violet-400"
                >
                    view all
                    <ArrowRight size={11} />
                </Link>
            </CardHeader>
            <CardContent className="pt-0">
                {latest.length === 0 ? (
                    <p className="py-8 text-center text-sm italic text-muted-foreground/40">
                        Waiting for events...
                    </p>
                ) : (
                    <div>
                        {latest.map((event) => (
                            <ActivityRow key={event.id} event={event} />
                        ))}
                    </div>
                )}
            </CardContent>
        </Card>
    );
}
