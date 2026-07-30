import { ChevronRight, type LucideIcon } from "lucide-react"
import { Link, useLocation } from "react-router"

import {
    Collapsible,
    CollapsibleContent,
    CollapsibleTrigger,
} from "@pes/ui/components/collapsible"
import {
    SidebarGroup,
    SidebarGroupLabel,
    SidebarMenu,
    SidebarMenuButton,
    SidebarMenuItem,
    SidebarMenuSub,
    SidebarMenuSubButton,
    SidebarMenuSubItem,
} from "@pes/ui/components/sidebar"
import { useAppSelector } from "@/store/hooks"
import { hasPermission } from "@/lib/permissions"
import { Permission } from "@/types"

export function NavAdmin({
    items,
}: {
    items: {
        title: string
        url: string
        icon?: LucideIcon
        isActive?: boolean
        items?: {
            title: string
            url: string
        }[]
    }[]
}) {
    const location = useLocation()
    const user = useAppSelector((state) => state.auth.user);

    const isLinkActive = (url: string) => {
        return location.pathname === url || location.pathname.startsWith(url + '/')
    }

    const isParentActive = (item: typeof items[0]) => {
        if (isLinkActive(item.url)) return true
        return item.items?.some(subItem => isLinkActive(subItem.url)) ?? false
    }

    // check if admin
    if (!hasPermission(user, Permission.ADMIN)) {
        return null;
    }

    return (
        <SidebarGroup>
            <SidebarGroupLabel>Administration</SidebarGroupLabel>
            <SidebarMenu>
                {items.map((item) => (
                    <Collapsible
                        key={item.title}
                        asChild
                        defaultOpen={item.isActive || isParentActive(item)}
                        className="group/collapsible"
                    >
                        <SidebarMenuItem>
                            <CollapsibleTrigger asChild>
                                <SidebarMenuButton
                                    tooltip={item.title}
                                    isActive={isParentActive(item)}
                                >
                                    {item.icon && <item.icon />}
                                    <span>{item.title}</span>
                                    <ChevronRight className="ml-auto transition-transform duration-200 group-data-[state=open]/collapsible:rotate-90" />
                                </SidebarMenuButton>
                            </CollapsibleTrigger>
                            <CollapsibleContent>
                                <SidebarMenuSub>
                                    {item.items?.map((subItem) => (
                                        <SidebarMenuSubItem key={subItem.title}>
                                            <SidebarMenuSubButton
                                                asChild
                                                isActive={isLinkActive(subItem.url)}
                                            >
                                                <Link to={subItem.url}>
                                                    <span>{subItem.title}</span>
                                                </Link>
                                            </SidebarMenuSubButton>
                                        </SidebarMenuSubItem>
                                    ))}
                                </SidebarMenuSub>
                            </CollapsibleContent>
                        </SidebarMenuItem>
                    </Collapsible>
                ))}
            </SidebarMenu>
        </SidebarGroup>
    )
}
