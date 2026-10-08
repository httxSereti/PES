import { useAppSelector } from "@/store/hooks";
import { Avatar, AvatarFallback, AvatarImage } from "@pes/ui/components/avatar";
import {
  DropdownMenu,
  DropdownMenuTrigger,
} from "@pes/ui/components/dropdown-menu";
import {
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@pes/ui/components/sidebar";
import { ChevronsUpDown, Settings } from "lucide-react";
import { toast } from "sonner";

import { UserMenuContent } from "../user-menu-content";

interface UserMenuProps {
  collapsed?: boolean;
}

export function UserMenu({ collapsed = false }: UserMenuProps) {
  const user = useAppSelector((state) => state.auth.user);

  if (!user) return null;

  const initials = user.display_name?.slice(0, 2).toUpperCase() ?? "PES";
  const capitalizedRole =
    user.role.charAt(0).toUpperCase() + user.role.slice(1);

  const openUserSettings = () => {
    toast.info("User settings", {
      description: "User settings are not available yet.",
      position: "bottom-right",
    });
  };

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton
              size="lg"
              className={
                collapsed
                  ? undefined
                  : "data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
              }
            >
              <Avatar className="h-8 w-8 rounded-lg">
                <AvatarImage
                  src="/fake_pfp.jpg"
                  alt={user.display_name ?? undefined}
                />
                <AvatarFallback className="rounded-lg">
                  {initials}
                </AvatarFallback>
              </Avatar>
              <div className="grid flex-1 text-left text-sm leading-tight">
                <span className="truncate font-medium">
                  {user.display_name}
                </span>
                <span className="truncate text-xs">{capitalizedRole}</span>
              </div>
              {!collapsed && <ChevronsUpDown className="ml-auto size-4" />}
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <UserMenuContent />
        </DropdownMenu>
        <SidebarMenuAction
          className={
            collapsed
              ? "group-data-[collapsible=icon]:flex group-data-[collapsible=icon]:top-0! group-data-[collapsible=icon]:right-0! group-data-[collapsible=icon]:rounded-lg group-data-[collapsible=icon]:bg-sidebar"
              : "top-1/2! right-2 size-8 -translate-y-1/2 [&>svg]:size-5"
          }
          title="User settings"
          onClick={openUserSettings}
        >
          <Settings />
        </SidebarMenuAction>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
