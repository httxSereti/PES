import { useEffect, useMemo, useState } from "react";
import type { Route } from ".react-router/types/src/pages/app/events/+types/dashboard";
import { useAppSelector } from "@/store/hooks";
import { triggerRulesSelectors } from "@/store/slices/triggerRulesSlice";
import { useEventCatalog } from "@/components/common/events/event-groups";
import { computeEventStats } from "@/lib/trigger-rules/event-stats";
import { computeRuleHealth, computeRulePerformance, computeSourceBreakdown } from "@/lib/trigger-rules/dashboard-data";
import DashboardStats from "@/components/common/events/dashboard/dashboard-stats";
import StreamPulse from "@/components/common/events/dashboard/stream-pulse";
import RuleHealth from "@/components/common/events/dashboard/rule-health";
import LatestEventsList from "@/components/common/events/dashboard/latest-events-list";
import LatestRulesList from "@/components/common/events/dashboard/latest-rules-list";
import EventsWiki from "@/components/common/events/dashboard/events-wiki";

// eslint-disable-next-line no-empty-pattern
export function meta({}: Route.MetaArgs) {
    return [
        { title: "PES | Events - Dashboard" },
        { name: "description", content: "Live event throughput, rule health and recent trigger activity" },
    ];
}

export default function EventsDashboardPage() {
    const events = useAppSelector((state) => state.events.events);
    const capacity = useAppSelector((state) => state.events.maxEvents);
    const rules = useAppSelector((state) => triggerRulesSelectors.selectAll(state));
    const { events: eventCatalog } = useEventCatalog();

    const [now, setNow] = useState(() => Date.now());

    // Relative timestamps and the throughput window need a nudge while idle.
    useEffect(() => {
        const timer = window.setInterval(() => setNow(Date.now()), 15_000);
        return () => window.clearInterval(timer);
    }, []);

    const stats = useMemo(() => computeEventStats(events, capacity, now), [events, capacity, now]);

    const sources = useMemo(() => computeSourceBreakdown(events, eventCatalog), [events, eventCatalog]);

    const performance = useMemo(() => computeRulePerformance(events, rules), [events, rules]);

    const health = useMemo(() => computeRuleHealth(performance), [performance]);

    const lastEventAt = useMemo(() => {
        let latest = 0;
        let iso: string | null = null;

        for (const event of events) {
            const time = new Date(event.triggered_at).getTime();
            if (!Number.isNaN(time) && time >= latest) {
                latest = time;
                iso = event.triggered_at;
            }
        }

        return iso;
    }, [events]);

    return (
        <div className="space-y-4 px-4 md:px-5">
            <DashboardStats stats={stats} health={health} />

            <div className="grid grid-cols-1 items-stretch gap-4 xl:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)]">
                <StreamPulse stats={stats} sources={sources} lastEventAt={lastEventAt} now={now} />
                <RuleHealth health={health} />
            </div>

            <div className="grid grid-cols-1 items-stretch gap-4 xl:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)]">
                <LatestEventsList events={events} now={now} />
                <LatestRulesList performance={performance} now={now} />
            </div>

            <EventsWiki />
        </div>
    );
}
