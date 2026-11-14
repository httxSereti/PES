import { Link } from "react-router";
import { ArrowLeft, Workflow } from "lucide-react";

import { Button } from "@pes/ui/components/button";

import TriggerRuleForm from "@/components/common/events/trigger-rules/form/trigger-rule-form";
import type { TriggerRule } from "@/types";

export default function FlowEditorPage({ rule }: { rule?: TriggerRule }) {
    return (
        <div className="w-full px-5">
            <div className="mb-4 flex items-center justify-between gap-3">
                <Button asChild variant="ghost" size="sm">
                    <Link to="/app/events/flows">
                        <ArrowLeft className="mr-1.5 size-3.5" />
                        Back to flows
                    </Link>
                </Button>
                {rule && (
                    <Button asChild variant="outline" size="sm">
                        <Link to={`/app/events/flows/${rule.id}/canvas`}>
                            <Workflow className="mr-1.5 size-3.5" />
                            Canvas view
                        </Link>
                    </Button>
                )}
            </div>
            <TriggerRuleForm key={rule?.id ?? "new"} rule={rule} mode="flow" />
        </div>
    );
}
