import * as React from "react"
import {
  Archive,
  BellIcon,
  Crown,
  Frame,
  HardDrive,
  Home,
  Map,
  MessageCircleQuestion,
  PieChart,
  Settings2,
  SquareTerminal,
  Wifi,
} from "lucide-react"


import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarRail,
} from "@pes/ui/components/sidebar"
import { NavMain } from "@/components/layout/sidebar/nav-main"
import { NavPlayground } from "@/components/layout/sidebar/nav-playground"
import { NavUser } from "@/components/layout/sidebar/nav-user"
import { AppSidebarHeader } from "@/components/layout/sidebar/app-sidebar-header"
import { NavFooter } from "@/components/layout/sidebar/nav-footer"
import { NavAdmin } from "@/components/layout/sidebar/nav-admin"

// This is sample data.
const data = {
  navMain: [
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
  ],
  navPlayground: [
    {
      title: "Playground",
      url: "/",
      icon: SquareTerminal,
      isActive: true,
      items: [
        {
          title: "Units",
          url: "/app/units",
          icon: Map,
        },
        {
          title: "Sensors",
          url: "/app/sensors",
        },
        {
          title: "Settings",
          url: "/app/settings",
        },
      ],
    },
  ],
  navAdmin: [
    {
      title: "Administration Panel",
      url: "/",
      icon: Crown,
      isActive: true,
      items: [
        {
          title: "Dashboard",
          url: "/app/admin/",
        },
        {
          title: "Users",
          url: "/app/admin/users",
        },
        {
          title: "Settings",
          url: "/app/admin/settings",
        },
      ],
    },
  ],
  projects: [
    {
      name: "Design Engineering",
      url: "#",
      icon: Frame,
    },
    {
      name: "Sales & Marketing",
      url: "#",
      icon: PieChart,
    },
    {
      name: "Travel",
      url: "#",
      icon: Map,
    },
  ],
  navFooter: [
    {
      title: "Notifications",
      url: "#",
      icon: BellIcon,
    },
    {
      title: "Settings",
      url: "#",
      icon: Settings2,
    },
    {
      title: "Guide",
      url: "#",
      icon: MessageCircleQuestion,
    },
  ],
}

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  return (
    <Sidebar collapsible="icon" {...props}>
      <SidebarHeader>
        <AppSidebarHeader />
      </SidebarHeader>
      <SidebarContent>
        <NavMain items={data.navMain} />
        <NavAdmin items={data.navAdmin} />
        <NavPlayground items={data.navPlayground} />
        {/* <NavProjects projects={data.projects} /> */}
        <NavFooter items={data.navFooter} className="mt-auto" />
      </SidebarContent>
      <SidebarFooter>
        <NavUser />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  )
}
