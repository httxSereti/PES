import { useMemo } from "react";
import { ArrowRight } from "lucide-react";
import { Link } from "react-router";
import { useAppSelector } from "@/store/hooks";
import type { TriggeredEvent } from "@/store/slices/eventsSlice";
import { EventTypeBadge, TriggeredRulesBadges } from "@/components/common/events/event-badges";
import { Card, CardContent, CardHeader, CardTitle } from "@pes/ui/components/card";

function LatestEventRow({ event }: { event: TriggeredEvent }) {
    const date = useMemo(() => new Date(event.triggered_at).toLocaleTimeString("fr-FR", {
        hour: "2-digit", minute: "2-digit", second: "2-digit",
    }), [event.triggered_at]);

    return (
        <div className="flex items-center gap-3 py-2 border-b border-border/40 last:border-b-0">
            <span className="text-[11px] text-muted-foreground/50 font-mono whitespace-nowrap tabular-nums">{date}</span>
            <EventTypeBadge type={event.event_type} />
            <span className="text-[11px] text-muted-foreground/50 font-mono truncate hidden sm:inline">
                {event.origin}
            </span>
            <div className="ml-auto shrink-0">
                <TriggeredRulesBadges rules={event.triggered_rules} />
            </div>
        </div>
    );
}

export default function LatestEventsList() {
    const events = useAppSelector(state => state.events.events);
    const latest = useMemo(() => [...events].slice(-10).reverse(), [events]);

    return (
        <Card>
            <CardHeader className="flex flex-row justify-between items-center pb-3">
                <CardTitle className="flex items-center gap-2 text-sm">
                    <span>Latest triggered events</span>
                    <span className="text-[10px] uppercase tracking-widest text-muted-foreground/50 font-normal">last 10</span>
                </CardTitle>
                <Link
                    to="/app/events/triggered"
                    className="flex items-center gap-1 text-xs text-muted-foreground/70 hover:text-violet-600 dark:hover:text-violet-400 transition-colors"
                >
                    view all
                    <ArrowRight size={11} />
                </Link>
            </CardHeader>
            <CardContent className="pt-0">
                {latest.length === 0 ? (
                    <p className="py-8 text-center text-sm text-muted-foreground/40 italic">
                        Waiting for events...
                    </p>
                ) : (
                    <div>
                        {latest.map(event => <LatestEventRow key={event.id} event={event} />)}
                    </div>
                )}
            </CardContent>
        </Card>
    );
}
