import FlowEditorPage from "@/components/common/events/flows/flow-editor-page";

export function meta() {
    return [
        { title: "PES · New flow" },
        { name: "description", content: "Create a new event flow." },
    ];
}

export default function NewFlowPage() {
    return <FlowEditorPage />;
}
