import TriggerRuleForm from "@/components/common/events/trigger-rules/form/trigger-rule-form";

export function meta() {
    return [
        { title: "PES · New trigger rule" },
        { name: "description", content: "Create a trigger rule for events and actions." },
    ];
}

export default function NewTriggerRulesPage() {
    return (
        <div className="w-full px-5">
            <TriggerRuleForm />
        </div>
    );
}
