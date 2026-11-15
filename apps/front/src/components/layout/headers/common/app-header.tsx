import { Button } from "@pes/ui/components/button";
import { useSidebar } from "@pes/ui/components/sidebar";
import { SidebarIcon } from "lucide-react";
import { Separator } from "@pes/ui/components/separator";
import { useWebSocket } from "@/hooks/useWebSocket";
import { HeaderStopButton } from "@/components/layout/headers/common/header-stop-button";
import { NotificationsBell } from "@/components/common/notifications/notifications-bell";

export function AppHeader() {
    const { toggleSidebar } = useSidebar()
    const { status } = useWebSocket()

    const dotColor =
        status === "connected"
            ? "bg-green-500"
            : "bg-red-500";


    return (
        <header className="bg-background sticky top-0 z-50 flex w-full items-center border-b">
            <div className="flex h-[48px] w-full items-center gap-2 px-4">
                <Button
                    className="h-8 w-8"
                    variant="ghost"
                    size="icon"
                    onClick={toggleSidebar}
                >
                    <SidebarIcon />
                </Button>
                <Separator orientation="vertical" className="mr-2 h-4" />
                <div className="flex items-center space-x-2">
                    <div className="ml-1">WebSocket</div>
                    <span className={`h-3 w-3 rounded-full ${dotColor}`} />
                </div>
                <div className="ml-auto flex items-center gap-2">
                    <NotificationsBell />
                    <HeaderStopButton />
                </div>
            </div>
        </header>
    )
}
