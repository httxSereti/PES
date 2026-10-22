import { useMemo } from "react";
import { ArrowRight, Radio } from "lucide-react";
import { Link } from "react-router";
import { Card, CardContent, CardHeader, CardTitle } from "@pes/ui/components/card";
import { cn } from "@pes/ui/lib/utils";
import { EventTypeBadge, TriggeredRulesBadges } from "@/components/common/events/event-badges";
import { formatRelativeTime } from "@/lib/format-date";
import { describeEvent, eventTone } from "@/lib/trigger-rules/describe-event";
import { eventIcon, TONE_TILE } from "@/lib/trigger-rules/event-visual";
import type { TriggeredEvent } from "@/types";

const MAX_ITEMS = 7;

function ActivityRow({ event, now }: { event: TriggeredEvent; now: number }) {
    const described = useMemo(() => describeEvent(event), [event]);
    const tone = eventTone(event.event_type, event.origin);
    const Icon = eventIcon(event.event_type);
    const rules = event.triggered_rules ?? [];

    return (
        <div className="flex gap-3 border-b border-border/40 py-2.5 last:border-b-0">
            <span
                className={cn(
                    "mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-md border",
                    TONE_TILE[tone],
                )}
            >
                <Icon size={13} />
            </span>

            <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                    <span
                        className={cn(
                            "min-w-0 truncate text-[13px] font-medium leading-tight",
                            rules.length > 0 ? "text-foreground/90" : "text-muted-foreground/65",
                        )}
                    >
                        {described.title}
                    </span>
                    <span className="ml-auto shrink-0 font-mono text-[9.5px] tabular-nums text-muted-foreground/40">
                        {formatRelativeTime(event.triggered_at, now)}
                    </span>
                </div>

                <div className="mt-1 flex min-w-0 flex-wrap items-center gap-1.5">
                    <EventTypeBadge
                        type={event.event_type}
                        title={event.event_type}
                        className="max-w-[170px] shrink-0"
                    />
                    {described.detail && (
                        <span className="min-w-0 flex-1 truncate font-mono text-[9.5px] text-muted-foreground/40">
                            {described.detail}
                        </span>
                    )}
                </div>

                {rules.length > 0 && (
                    <div className="mt-1.5">
                        <TriggeredRulesBadges rules={rules} />
                    </div>
                )}
            </div>
        </div>
    );
}

export default function LatestEventsList({ events, now }: { events: TriggeredEvent[]; now: number }) {
    const latest = useMemo(() => [...events].slice(-MAX_ITEMS).reverse(), [events]);

    return (
        <Card className="h-full gap-0 py-0">
            <CardHeader className="flex flex-row items-center justify-between gap-3 px-5 pb-3 pt-5">
                <CardTitle className="flex flex-wrap items-center gap-2 text-sm">
                    <span className="relative flex size-2 shrink-0">
                        <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                        <span className="relative inline-flex size-2 rounded-full bg-emerald-500" />
                    </span>
                    Recent activity
                    <span className="rounded-full border border-border/60 bg-muted/40 px-2 py-px font-mono text-[9px] font-normal uppercase tracking-widest text-muted-foreground/50">
                        last {MAX_ITEMS}
                    </span>
                </CardTitle>
                <Link
                    to="/app/events/triggered"
                    className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground/70 transition-colors hover:text-violet-600 dark:hover:text-violet-400"
                >
                    view stream
                    <ArrowRight size={11} />
                </Link>
            </CardHeader>

            <CardContent className="px-5 pb-4">
                {latest.length === 0 ? (
                    <div className="flex min-h-44 flex-col items-center justify-center gap-2.5 text-center">
                        <Radio size={20} className="text-muted-foreground/20" />
                        <p className="text-sm text-muted-foreground/60">Waiting for the first event…</p>
                        <p className="max-w-xs font-mono text-[10px] text-muted-foreground/35">
                            Chaster webhooks, sensor alarms and integration events will appear here in real time.
                        </p>
                    </div>
                ) : (
                    <div>
                        {latest.map((event) => (
                            <ActivityRow key={event.id} event={event} now={now} />
                        ))}
                    </div>
                )}
            </CardContent>
        </Card>
    );
}
