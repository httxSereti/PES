"use client"

import {
    BadgeCheck,
    Bell,
    ChevronsUpDown,
    CreditCard,
    LogOut,
    Settings2,
    Sparkles,
    SquareArrowOutUpRight,
} from "lucide-react"

import {
    Avatar,
    AvatarFallback,
    AvatarImage,
} from "@pes/ui/components/avatar"
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuGroup,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@pes/ui/components/dropdown-menu"
import {
    SidebarMenu,
    SidebarMenuButton,
    SidebarMenuItem,
    useSidebar,
} from "@pes/ui/components/sidebar"
import { useWebSocket } from "@/hooks/useWebSocket"
import { hasPermission } from "@/lib/permissions"
import { useAppDispatch, useAppSelector } from "@/store/hooks"
import { openSessionSettings } from "@/store/slices/sessionSlice"
import { Permission } from "@/types"
import { toast } from "sonner"

export function NavUser() {
    const { user } = useAppSelector((state) => state.auth);
    const activeSession = useAppSelector((state) => state.session.activeSession);
    const dispatch = useAppDispatch();
    const { sendCommand } = useWebSocket();
    const { isMobile } = useSidebar()

    if (!user)
        return

    const capitalizedRole = user.role.charAt(0).toUpperCase() + user.role.slice(1)
    const canManageSession = hasPermission(user, Permission.SESSION_MANAGE)

    const endSession = async () => {
        try {
            const data = await sendCommand('session:end');

            if (data.status === "ok") {
                toast.success("Session ended", {
                    description: data.message ?? "The session was ended",
                    position: "bottom-right",
                    closeButton: true,
                })
                return
            }

            toast.error("Failed to end session", {
                description: data.message ?? undefined,
                position: "bottom-right",
                closeButton: true,
            })
        } catch (error) {
            toast.error("Failed to end session", {
                description: "The server did not answer",
                position: "bottom-right",
                closeButton: true,
            })
            console.error('End session failed', error);
        }
    };

    return (
        <SidebarMenu>
            <SidebarMenuItem>
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <SidebarMenuButton
                            size="lg"
                            className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
                        >
                            <Avatar className="h-8 w-8 rounded-lg">
                                <AvatarImage src={"https://cdn02.chaster.app/app/uploads/avatars/tRF955zBdj1fGyVw.jpg"} alt={user?.display_name ?? undefined} />
                                <AvatarFallback className="rounded-lg">PES</AvatarFallback>
                            </Avatar>
                            <div className="grid flex-1 text-left text-sm leading-tight">
                                <span className="truncate font-medium">{user.display_name}</span>
                                <span className="truncate text-xs">{capitalizedRole}</span>
                            </div>
                            <ChevronsUpDown className="ml-auto size-4" />
                        </SidebarMenuButton>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent
                        className="w-(--radix-dropdown-menu-trigger-width) min-w-56 rounded-lg"
                        side={isMobile ? "bottom" : "right"}
                        align="end"
                        sideOffset={4}
                    >
                        <DropdownMenuLabel className="p-0 font-normal">
                            <div className="flex items-center gap-2 px-1 py-1.5 text-left text-sm">
                                <Avatar className="h-8 w-8 rounded-lg">
                                    <AvatarImage src={"https://cdn02.chaster.app/app/uploads/avatars/tRF955zBdj1fGyVw.jpg"} alt={user.display_name ?? undefined} />
                                    <AvatarFallback className="rounded-lg">CN</AvatarFallback>
                                </Avatar>
                                <div className="grid flex-1 text-left text-sm leading-tight">
                                    <span className="truncate font-medium">{user.display_name}</span>
                                    <span className="truncate text-xs">{capitalizedRole}</span>
                                </div>
                            </div>
                        </DropdownMenuLabel>
                        <DropdownMenuSeparator />
                        {canManageSession && (
                            <>
                                <DropdownMenuGroup>
                                    {activeSession ? (
                                        <DropdownMenuItem onClick={endSession}>
                                            <SquareArrowOutUpRight />
                                            End Session
                                        </DropdownMenuItem>
                                    ) : (
                                        <DropdownMenuItem onClick={() => dispatch(openSessionSettings())}>
                                            <Settings2 />
                                            Session settings
                                        </DropdownMenuItem>
                                    )}
                                </DropdownMenuGroup>
                                <DropdownMenuSeparator />
                            </>
                        )}
                        <DropdownMenuGroup>
                            <DropdownMenuItem>
                                <Sparkles />
                                Upgrade to Pro
                            </DropdownMenuItem>
                        </DropdownMenuGroup>
                        <DropdownMenuSeparator />
                        <DropdownMenuGroup>
                            <DropdownMenuItem>
                                <BadgeCheck />
                                Account
                            </DropdownMenuItem>
                            <DropdownMenuItem>
                                <CreditCard />
                                Billing
                            </DropdownMenuItem>
                            <DropdownMenuItem>
                                <Bell />
                                Notifications
                            </DropdownMenuItem>
                        </DropdownMenuGroup>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem>
                            <LogOut />
                            Log out
                        </DropdownMenuItem>
                    </DropdownMenuContent>
                </DropdownMenu>
            </SidebarMenuItem>
        </SidebarMenu>
    )
}
