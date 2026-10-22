import type { Route } from ".react-router/types/src/pages/app/events/trigger-rules/+types/index";
import TriggerRulesConsole from "@/components/common/events/trigger-rules/console/trigger-rules-console";

// eslint-disable-next-line no-empty-pattern
export function meta({ }: Route.MetaArgs) {
    return [
        { title: "PES - Trigger Rules" },
        { name: "description", content: "Trigger rules and actions" },
    ];
}

export default function TriggerRulesPage() {
    return <TriggerRulesConsole />;
}
