import { Link, useParams } from "react-router";
import { ArrowLeft, Zap } from "lucide-react";

import { Button } from "@pes/ui/components/button";
import TriggerRuleForm from "@/components/common/events/trigger-rules/form/trigger-rule-form";
import { useAppSelector } from "@/store/hooks";
import { triggerRulesSelectors } from "@/store/slices/triggerRulesSlice";

const BACK_PATH = "/app/events/trigger-rules";

export default function EditTriggerRulesPage() {
    const { id } = useParams();
    const rule = useAppSelector((state) =>
        id ? triggerRulesSelectors.selectById(state, id) : undefined,
    );

    return (
        <div className="w-full space-y-4 px-5">
            <Button asChild variant="ghost" size="sm" className="w-fit">
                <Link to={BACK_PATH}>
                    <ArrowLeft className="mr-1 h-4 w-4" /> Back
                </Link>
            </Button>

            <div className="flex items-center gap-2">
                <div className="rounded-lg accent-tile p-2">
                    <Zap size={14} className="accent-tile-icon" />
                </div>
                <div>
                    <h1 className="font-mono text-sm">Edit Trigger Rule</h1>
                    <p className="font-mono text-xs text-muted-foreground/50">
                        {rule ? rule.name : "Update an existing rule, its actions and labels"}
                    </p>
                </div>
            </div>

            {rule ? (
                // key by id so the form re-initializes with the right defaults once the rule loads
                <TriggerRuleForm key={rule.id} rule={rule} />
            ) : (
                <div className="py-16 text-center text-sm text-muted-foreground/40 italic">
                    Trigger rule not found
                </div>
            )}
        </div>
    );
}
