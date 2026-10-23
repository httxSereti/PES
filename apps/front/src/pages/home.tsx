import type { Route } from "../pages/+types/home";
import { HomeDashboard } from "@/components/common/home/dashboard";

// eslint-disable-next-line no-empty-pattern
export function meta({}: Route.MetaArgs) {
    return [
        { title: "PES | Home" },
        {
            name: "description",
            content:
                "Studio cockpit — live session, units, profiles and sensors at a glance",
        },
    ];
}

export default function Home() {
    return <HomeDashboard />;
}
