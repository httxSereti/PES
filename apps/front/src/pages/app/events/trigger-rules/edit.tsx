import { useParams } from "react-router";

import TriggerRuleForm from "@/components/common/events/trigger-rules/form/trigger-rule-form";
import { useAppSelector } from "@/store/hooks";
import { triggerRulesSelectors } from "@/store/slices/triggerRulesSlice";

export function meta() {
    return [
        { title: "PES · Edit trigger rule" },
        { name: "description", content: "Edit a trigger rule, its events and actions." },
    ];
}

export default function EditTriggerRulesPage() {
    const { id } = useParams();
    const rule = useAppSelector((state) => (id ? triggerRulesSelectors.selectById(state, id) : undefined));

    return (
        <div className="w-full px-5">
            {rule ? (
                // key by id so the form re-initializes with the right defaults once the rule loads
                <TriggerRuleForm key={rule.id} rule={rule} />
            ) : (
                <div className="py-16 text-center text-sm text-muted-foreground/40 italic">Trigger rule not found</div>
            )}
        </div>
    );
}
