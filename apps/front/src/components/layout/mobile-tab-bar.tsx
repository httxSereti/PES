"use client"

import { Archive, HardDrive, Home, UserRound, Wifi, type LucideIcon } from "lucide-react"
import { Link, useLocation } from "react-router"
import { cn } from "@pes/ui/lib/utils"
import {
    DropdownMenu,
    DropdownMenuTrigger,
} from "@pes/ui/components/dropdown-menu"
import { UserMenuContent } from "@/components/layout/sidebar/user-menu-content"

const tabs: { title: string; url: string; icon: LucideIcon }[] = [
    {
        title: "Home",
        url: "/app/",
        icon: Home,
    },
    {
        title: "Units",
        url: "/app/units",
        icon: HardDrive,
    },
    {
        title: "Sensors",
        url: "/app/sensors",
        icon: Wifi,
    },
    {
        title: "Events",
        url: "/app/events",
        icon: Archive,
    },
]

export function MobileTabBar() {
    const location = useLocation()

    const isActive = (url: string) =>
        location.pathname === url || location.pathname.startsWith(url + "/")

    return (
        <nav className="bg-background/95 supports-[backdrop-filter]:bg-background/80 fixed inset-x-0 bottom-0 z-50 border-t backdrop-blur md:hidden">
            <div className="grid h-16 grid-cols-5">
                {tabs.map((tab) => (
                    <Link
                        key={tab.title}
                        to={tab.url}
                        className={cn(
                            "flex flex-col items-center justify-center gap-1 text-xs font-medium transition-colors",
                            isActive(tab.url)
                                ? "text-primary"
                                : "text-muted-foreground hover:text-foreground"
                        )}
                    >
                        <tab.icon className="size-5" />
                        {tab.title}
                    </Link>
                ))}
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <button
                            type="button"
                            className="text-muted-foreground hover:text-foreground flex flex-col items-center justify-center gap-1 text-xs font-medium transition-colors"
                        >
                            <UserRound className="size-5" />
                            Profile
                        </button>
                    </DropdownMenuTrigger>
                    <UserMenuContent side="top" align="center" />
                </DropdownMenu>
            </div>
        </nav>
    )
}