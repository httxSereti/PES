import { Link } from "react-router";
import { ArrowLeft, Zap } from "lucide-react";

import { Button } from "@pes/ui/components/button";
import TriggerRuleForm from "@/components/common/events/trigger-rules/form/trigger-rule-form";

export default function NewTriggerRulesPage() {
    return (
        <div className="w-full space-y-4 px-5">
            <Button asChild variant="ghost" size="sm" className="w-fit">
                <Link to="/app/events/trigger-rules">
                    <ArrowLeft className="mr-1 h-4 w-4" /> Back
                </Link>
            </Button>

            <div className="flex items-center gap-2">
                <div className="rounded-lg border border-purple-800/40 bg-[#161226] p-2">
                    <Zap size={14} className="text-violet-400" />
                </div>
                <div>
                    <h1 className="font-mono text-sm">New Trigger Rule</h1>
                    <p className="font-mono text-xs text-muted-foreground/50">
                        Run one or more actions when an event fires
                    </p>
                </div>
            </div>

            <TriggerRuleForm />
        </div>
    );
}
