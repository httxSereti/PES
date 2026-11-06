import type { Route } from ".react-router/types/src/pages/app/+types/lovense";
import { Lovense } from "@/components/common/lovense/lovense";

// eslint-disable-next-line no-empty-pattern
export function meta({ }: Route.MetaArgs) {
    return [
        { title: "PES - Lovense" },
        { name: "description", content: "Control Lovense and Buttplug devices" },
    ];
}

export default function LovensePage() {
    return <Lovense />;
}
