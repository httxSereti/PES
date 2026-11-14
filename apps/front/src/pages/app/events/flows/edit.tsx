import { useParams } from "react-router";

import FlowEditorPage from "@/components/common/events/flows/flow-editor-page";
import { useAppSelector } from "@/store/hooks";
import { triggerRulesSelectors } from "@/store/slices/triggerRulesSlice";

export function meta() {
    return [
        { title: "PES · Flow editor" },
        { name: "description", content: "Edit an event flow, its conditions and actions." },
    ];
}

export default function EditFlowPage() {
    const { id } = useParams();
    const rule = useAppSelector((state) => (id ? triggerRulesSelectors.selectById(state, id) : undefined));

    return (
        <div>
            {rule ? (
                <FlowEditorPage key={rule.id} rule={rule} />
            ) : (
                <div className="py-16 text-center text-sm text-muted-foreground/40 italic">
                    Flow not found
                </div>
            )}
        </div>
    );
}
