import type { Route } from ".react-router/types/src/pages/app/+types/profiles";
import { Profiles } from "@/components/common/profiles/profiles";

// eslint-disable-next-line no-empty-pattern
export function meta({ }: Route.MetaArgs) {
    return [
        { title: "PES - Profiles" },
        { name: "description", content: "Manage, apply and export saved EStim profiles" },
    ];
}

export default function ProfilesPage() {
    return (
        <Profiles />
    );
}
