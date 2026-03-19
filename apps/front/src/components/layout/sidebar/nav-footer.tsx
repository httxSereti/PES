import { useWebSocket } from "@/hooks/useWebSocket"
import type { CoreStopMessage } from "@/types"
import { SidebarGroup, SidebarGroupContent, SidebarMenu, SidebarMenuButton, SidebarMenuItem } from "@pes/ui/components/sidebar"
import { CirclePower, type LucideIcon } from "lucide-react"
import * as React from "react"
import { Link } from "react-router"
import { toast } from "sonner"

export function NavFooter({
    items,
    ...props
}: {
    items: {
        title: string
        url: string
        icon: LucideIcon
    }[]
} & React.ComponentPropsWithoutRef<typeof SidebarGroup>) {
    const { sendCommand } = useWebSocket()

    const stopApplication = async () => {
        try {
            const data: CoreStopMessage = await sendCommand('core:stop');

            if (data.status === "ok") {
                toast.success("Emergency stop", {
                    description: "Successfully stopped all units and cleared queue",
                    position: "top-center",
                    closeButton: true
                })
                return
            }

            throw new Error("Command hasn't succeed!")
        } catch (error) {
            toast.error("Emergency stop failed", {
                description: "Failed to stop all units and clear queue",
                position: "top-center",
                closeButton: true
            })
            console.error('Emergency stop failed', error);
        }
    };

    return (
        <SidebarGroup {...props}>
            <SidebarGroupContent>
                <SidebarMenu>
                    {items.map((item) => (
                        <SidebarMenuItem key={item.title}>
                            <SidebarMenuButton asChild>
                                <Link to={item.url}>
                                    <item.icon />
                                    <span>{item.title}</span>
                                </Link>
                            </SidebarMenuButton>
                        </SidebarMenuItem>
                    ))}
                    {/* Emergency Stop all devices. */}
                    <SidebarMenuItem>
                        <SidebarMenuButton className="cursor-pointer" onClick={stopApplication}>
                            <>
                                <CirclePower className="h-[1.2rem] w-[1.2rem] scale-100" />
                                <span className="justify-center text-center">Stop</span>
                            </>
                        </SidebarMenuButton>
                    </SidebarMenuItem>
                </SidebarMenu>
            </SidebarGroupContent>
        </SidebarGroup>
    )
}
