import { useAppSelector } from "@/store/hooks";
import { Card } from "@pes/ui/components/card";
import { useSidebar } from "@pes/ui/components/sidebar";
import { Info, X } from "lucide-react";
import { SessionTimer } from "./session-timer";
import { Link } from "react-router";
import { SESSION_TYPE_META } from "@/components/common/session/session.constants";
import { Tooltip, TooltipContent, TooltipTrigger } from "@pes/ui/components/tooltip";
export function SessionCard({ className }: { className?: string }) {
    const { open } = useSidebar();
    const activeSession = useAppSelector((state) => state.session.activeSession);

    if (!activeSession || !activeSession.started_at)
        return null;

    const sessionType = SESSION_TYPE_META.find((meta) => meta.value === activeSession.type);

    if (!open) {
        return (
            <Tooltip>
                <TooltipTrigger className="cursor-pointer" asChild>
                    <Link to={`/app/sessions/${activeSession.id}`}>
                        <div className={`flex py-3 flex-col rounded-md border dark:border-violet-800 dark:bg-violet-950/50`}>
                            <div className="flex flex-row  justify-center items-center">
                                <span className="relative flex h-1.5 w-1.5">
                                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-violet-400 opacity-75" />
                                    <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-violet-500" />
                                </span>
                            </div>
                        </div>
                    </Link>
                </TooltipTrigger>
                <TooltipContent side="right" className="pr-1.5">
                    <div className="flex flex-row gap-1">
                        <p>Session live since</p>
                        <SessionTimer className="text-violet-700 dark:text-violet-700" startedAt={activeSession.started_at} />
                    </div>
                </TooltipContent>
            </Tooltip>
        )
    }



    return (
        <div className={`flex flex-col py-4 px-4 space-y-2 rounded-md border accent-tile dark:border-violet-800 dark:bg-violet-950/50 ${className || ''}`}>
            <div className="flex flex-row justify-between items-center space-x-2">
                <div className="flex flex-row items-center space-x-2">
                    <span className="relative flex h-1.5 w-1.5">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-violet-400 opacity-75" />
                        <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-violet-500" />
                    </span>
                    {sessionType?.label && (
                        <span className="text-violet-500 dark:text-white">
                            {sessionType.label}
                        </span>
                    )}
                </div>
                <SessionTimer className="text-violet-500 dark:text-violet-400" startedAt={activeSession.started_at} />
            </div>
            <div className="flex flex-col">
                <div className="flex flex-row justify-end">
                    <Link to={`/app/sessions/${activeSession.id}`} className="text-xs text-violet-500 hover:underline dark:text-violet-400">
                        View details
                    </Link>
                </div>

            </div>
        </div>
    );
}