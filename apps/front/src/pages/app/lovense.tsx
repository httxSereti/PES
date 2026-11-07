import type { Route } from ".react-router/types/src/pages/app/+types/lovense";
import { Lovense } from "@/components/common/lovense/lovense";

// eslint-disable-next-line no-empty-pattern
export function meta({}: Route.MetaArgs) {
    return [
        { title: "PES - Toy Player" },
        {
            name: "description",
            content:
                "Touch control, patterns and immersive playback for Lovense and Buttplug toys",
        },
    ];
}

export default function LovensePage() {
    return <Lovense />;
}
