import * as React from "react";
import {
  Archive,
  BellIcon,
  Bookmark,
  Crown,
  Dumbbell,
  Frame,
  Hammer,
  HardDrive,
  History,
  Home,
  Map,
  PieChart,
  Settings2,
  SquareTerminal,
  Wifi,
} from "lucide-react";

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarRail,
} from "@pes/ui/components/sidebar";
import { NavMain } from "@/components/layout/sidebar/nav-main";
import { NavPlayground } from "@/components/layout/sidebar/nav-playground";
import { AppSidebarHeader } from "@/components/layout/sidebar/app-sidebar-header";
import { ControlPanel } from "@/components/layout/sidebar/control-panel";
import { NavAdmin } from "@/components/layout/sidebar/nav-admin";
import { Separator } from "@pes/ui/components/separator";

// This is sample data.
const data = {
  navMain: [
    {
      title: "Home",
      url: "/app/",
      icon: Home,
    },
    {
      title: "Events",
      url: "/app/events",
      icon: Archive,
    },
    {
      title: "Profiles",
      url: "/app/profiles",
      icon: Bookmark,
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
  ],
  navSecondary: [
    {
      title: "Sessions",
      url: "/app/sessions",
      icon: History,
    },
    {
      title: "Training",
      url: "/app/training",
      icon: Dumbbell,
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
      title: "Panel",
      url: "/",
      // icon: Hammer,
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
};

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  return (
    <Sidebar collapsible="icon" {...props}>
      <SidebarHeader>
        <AppSidebarHeader />
      </SidebarHeader>
      <SidebarContent>
        <NavMain items={data.navMain} />
        <div className="mx-2">
          <Separator />
        </div>
        <NavMain items={data.navSecondary} />
        <NavAdmin items={data.navAdmin} />
        {/* <NavPlayground items={data.navPlayground} /> */}
        {/* <NavProjects projects={data.projects} /> */}
      </SidebarContent>
      <SidebarFooter>
        <ControlPanel />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
