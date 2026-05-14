import type { Route } from ".react-router/types/src/pages/app/admin/+types/dashboard";
import { Wifi } from "lucide-react";

// eslint-disable-next-line no-empty-pattern
export function meta({ }: Route.MetaArgs) {
    return [
        { title: "PES | Events" },
        { name: "description", content: "Events page" },
    ];
}

export default function EventsPage() {
    return (
        <div className="space-y-4">
            <div className="px-5 mb-8 flex justify-between gap-4">
                <div className="flex-col">
                    <h1 className="font-syne text-xl sm:text-2xl lg:text-[26px] font-extrabold">
                        Events
                    </h1>
                    <div className="text-muted-foreground text-xs">Realtime events</div>
                </div>
                <div className="ml-auto flex items-center gap-2">
                    <div className="flex items-center gap-2 px-3 py-1.5 rounded-md bg-[#161226] border border-purple-800/40">
                        <Wifi size={11} className="text-violet-400" />
                    </div>
                </div>
            </div>
            <div className="w-full px-5 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 mb-5">
            </div>
        </div>
    );
}