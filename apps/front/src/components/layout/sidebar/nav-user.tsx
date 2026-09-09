"use client"

import { ChevronsUpDown } from "lucide-react"

import {
    Avatar,
    AvatarFallback,
    AvatarImage,
} from "@pes/ui/components/avatar"
import {
    DropdownMenu,
    DropdownMenuTrigger,
} from "@pes/ui/components/dropdown-menu"
import {
    SidebarMenu,
    SidebarMenuButton,
    SidebarMenuItem,
} from "@pes/ui/components/sidebar"
import { useAppSelector } from "@/store/hooks"
import { UserMenuContent } from "./user-menu-content"

export function NavUser() {
    const { user } = useAppSelector((state) => state.auth);

    if (!user)
        return

    const capitalizedRole = user.role.charAt(0).toUpperCase() + user.role.slice(1)

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
                    <UserMenuContent />
                </DropdownMenu>
            </SidebarMenuItem>
        </SidebarMenu>
    )
}
