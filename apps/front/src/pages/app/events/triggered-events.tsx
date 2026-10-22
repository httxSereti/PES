import type { Route } from ".react-router/types/src/pages/app/events/+types/triggered-events";
import EventConsole from "@/components/common/events/console/event-console";

// eslint-disable-next-line no-empty-pattern
export function meta({ }: Route.MetaArgs) {
    return [
        { title: "PES | Triggered Events" },
        { name: "description", content: "Realtime event stream" },
    ];
}

export default function TriggeredEventsPage() {
    return <EventConsole />;
}
