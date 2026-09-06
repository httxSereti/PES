import type { Route } from ".react-router/types/src/pages/app/events/+types/triggered-events";
import { useAppSelector } from "@/store/hooks";
import EventsTable from "@/components/common/events/events-table";
import { Skeleton } from "@pes/ui/components/skeleton";

// eslint-disable-next-line no-empty-pattern
export function meta({ }: Route.MetaArgs) {
    return [
        { title: "PES | Triggered Events" },
        { name: "description", content: "Realtime event stream" },
    ];
}

export default function TriggeredEventsPage() {
    const events = useAppSelector(state => state.events.events);

    if (!events) {
        return (
            <div className="space-y-4 px-4 md:px-5">
                <Skeleton className="h-[35px] w-full rounded-xl" />
                <Skeleton className="h-[525px] w-full rounded-xl" />
            </div>
        )
    }
    return (
        <>
            <EventsTable />
        </>
    )
}