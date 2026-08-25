import type { Route } from ".react-router/types/src/pages/app/events/+types/dashboard";
import DashboardStats from "@/components/common/events/dashboard/dashboard-stats";
import LatestEventsList from "@/components/common/events/dashboard/latest-events-list";
import LatestRulesList from "@/components/common/events/dashboard/latest-rules-list";
import EventsWiki from "@/components/common/events/dashboard/events-wiki";

// eslint-disable-next-line no-empty-pattern
export function meta({ }: Route.MetaArgs) {
    return [
        { title: "PES | Events - Dashboard" },
        { name: "description", content: "Events overview, trigger rules & handbook" },
    ];
}

export default function EventsDashboardPage() {
    return (
        <div className="space-y-4 px-4 md:px-5">
            <DashboardStats />

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
                <LatestEventsList />
                <LatestRulesList />
            </div>

            <EventsWiki />
        </div>
    );
}
