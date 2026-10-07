import { SESSION_TYPE_META } from "@/components/common/session/session.constants";
import { useWebSocket } from "@/hooks/useWebSocket";
import { hasPermission } from "@/lib/permissions";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import { openSessionSettings } from "@/store/slices/sessionSlice";
import { sensorsSelectors } from "@/store/slices/sensorsSlice";
import { unitsSelectors } from "@/store/slices/unitsSlice";
import { Permission } from "@/types";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@pes/ui/components/alert-dialog";
import { Avatar, AvatarFallback, AvatarImage } from "@pes/ui/components/avatar";
import { Button } from "@pes/ui/components/button";
import {
  DropdownMenu,
  DropdownMenuTrigger,
} from "@pes/ui/components/dropdown-menu";
import {
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@pes/ui/components/sidebar";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@pes/ui/components/tooltip";
import { cn } from "@pes/ui/lib/utils";
import {
  ChevronsUpDown,
  CircleDashed,
  CircleStop,
  Eye,
  MonitorUp,
  Music,
  Play,
  RefreshCw,
  Settings,
  Shapes,
  VideoOff,
} from "lucide-react";
import { useState } from "react";
import { Link } from "react-router";
import { toast } from "sonner";

import { SessionTimer } from "./session/session-timer";
import { UserMenuContent } from "./user-menu-content";

const STATUS_META = {
  connected: { label: "Connected", dot: "bg-emerald-500" },
  connecting: { label: "Connecting…", dot: "bg-amber-500" },
  error: { label: "Connection error", dot: "bg-red-500" },
  disconnected: { label: "Disconnected", dot: "bg-red-500" },
} as const;

export function ControlPanel() {
  const { open } = useSidebar();
  const { status, reconnect, sendCommand } = useWebSocket();
  const dispatch = useAppDispatch();
  const user = useAppSelector((state) => state.auth.user);
  const activeSession = useAppSelector((state) => state.session.activeSession);
  const units = useAppSelector(unitsSelectors.selectAll);
  const sensors = useAppSelector(sensorsSelectors.selectAll);

  const [camera, setCamera] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [stopConfirmOpen, setStopConfirmOpen] = useState(false);

  const isLive =
    activeSession?.status === "running" && !!activeSession.started_at;
  const sessionMeta = isLive
    ? SESSION_TYPE_META.find((meta) => meta.value === activeSession.type)
    : undefined;
  const SessionIcon = sessionMeta?.icon ?? CircleDashed;
  const sessionHref = isLive
    ? `/app/sessions/${activeSession.id}`
    : "/app/sessions";
  const canManageSession = hasPermission(user, Permission.SESSION_MANAGE);

  const onlineUnits = units.filter((unit) => unit.cnx_ok).length;
  const onlineSensors = sensors.filter((sensor) => sensor.sensor_online).length;
  const statusMeta =
    STATUS_META[status as keyof typeof STATUS_META] ?? STATUS_META.disconnected;

  const initials = user?.display_name?.slice(0, 2).toUpperCase() ?? "PES";
  const capitalizedRole = user
    ? user.role.charAt(0).toUpperCase() + user.role.slice(1)
    : "";

  const endSession = async () => {
    try {
      const data = await sendCommand("session:end");

      if (data.status === "ok") {
        toast.success("Session ended", {
          description: data.message ?? "The session was ended",
          position: "bottom-right",
          closeButton: true,
        });
        return;
      }

      toast.error("Failed to end session", {
        description: data.message ?? undefined,
        position: "bottom-right",
        closeButton: true,
      });
    } catch (error) {
      toast.error("Failed to end session", {
        description: "The server did not answer",
        position: "bottom-right",
        closeButton: true,
      });
      console.error("End session failed", error);
    }
  };

  const openUserSettings = () => {
    toast.info("User settings", {
      description: "User settings are not available yet.",
      position: "bottom-right",
    });
  };

  if (!open) {
    return (
      <div className="flex flex-col items-center gap-1">
        <Tooltip>
          <TooltipTrigger asChild>
            <Link
              to={sessionHref}
              className="flex size-8 items-center justify-center rounded-md transition-colors hover:bg-sidebar-accent"
            >
              <span className="relative flex size-2">
                {isLive && (
                  <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                )}
                <span
                  className={cn(
                    "relative inline-flex size-2 rounded-full",
                    isLive ? "bg-emerald-500" : "bg-muted-foreground/40",
                  )}
                />
              </span>
            </Link>
          </TooltipTrigger>
          <TooltipContent side="right">
            {isLive ? (
              <span className="flex items-center gap-1">
                Session live since
                <SessionTimer startedAt={activeSession.started_at} />
              </span>
            ) : (
              "No active session"
            )}
          </TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              onClick={reconnect}
              disabled={status === "connecting"}
              className="flex size-8 items-center justify-center rounded-md transition-colors hover:bg-sidebar-accent"
            >
              <span className={cn("size-2 rounded-full", statusMeta.dot)} />
            </button>
          </TooltipTrigger>
          <TooltipContent side="right">
            {statusMeta.label} · {onlineUnits}/{units.length} units ·{" "}
            {onlineSensors}/{sensors.length} sensors
          </TooltipContent>
        </Tooltip>

        {user && (
          <SidebarMenu>
            <SidebarMenuItem>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <SidebarMenuButton size="lg">
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
                      <span className="truncate text-xs">
                        {capitalizedRole}
                      </span>
                    </div>
                    <ChevronsUpDown className="ml-auto size-4" />
                  </SidebarMenuButton>
                </DropdownMenuTrigger>
                <UserMenuContent />
              </DropdownMenu>
              <SidebarMenuAction
                className="group-data-[collapsible=icon]:flex group-data-[collapsible=icon]:top-0! group-data-[collapsible=icon]:right-0! group-data-[collapsible=icon]:rounded-lg group-data-[collapsible=icon]:bg-sidebar"
                title="User settings"
                onClick={openUserSettings}
              >
                <Settings />
              </SidebarMenuAction>
            </SidebarMenuItem>
          </SidebarMenu>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {/* Activity: live session */}
      <div className="rounded-lg border bg-sidebar-accent/50 p-2">
        <div className="flex items-center gap-2">
          <div
            className={cn(
              "grid size-8 shrink-0 place-items-center rounded-md",
              isLive
                ? "bg-primary/15 text-primary"
                : "bg-muted text-muted-foreground",
            )}
          >
            <SessionIcon className="size-4" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-medium">
              {isLive ? activeSession.name : "No session"}
            </div>
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              {isLive ? (
                <>
                  <span className="relative flex size-1.5 shrink-0">
                    <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                    <span className="relative inline-flex size-1.5 rounded-full bg-emerald-500" />
                  </span>
                  <SessionTimer startedAt={activeSession.started_at} />
                </>
              ) : (
                "Idle"
              )}
            </div>
          </div>
          <Button asChild variant="ghost" size="icon-sm" title="View session">
            <Link to={sessionHref}>
              <Eye />
            </Link>
          </Button>
          {!isLive && canManageSession && (
            <Button
              variant="ghost"
              size="icon-sm"
              title="Create session"
              className="text-muted-foreground hover:text-foreground"
              onClick={() => dispatch(openSessionSettings())}
            >
              <Play />
            </Button>
          )}
          {isLive && canManageSession && (
            <Button
              variant="ghost"
              size="icon-sm"
              title="End session"
              className="text-muted-foreground hover:text-destructive"
              onClick={() => setStopConfirmOpen(true)}
            >
              <CircleStop />
            </Button>
          )}
        </div>
      </div>

      <AlertDialog open={stopConfirmOpen} onOpenChange={setStopConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>End the session?</AlertDialogTitle>
            <AlertDialogDescription>
              This will end “{activeSession?.name}” and stop all running units.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => void endSession()}>
              <CircleStop />
              End session
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* WebSocket connection */}
      <div className="rounded-lg border bg-sidebar-accent/50 p-2">
        <div className="flex items-center gap-2">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5 text-sm font-medium">
              <span
                className={cn("size-2 shrink-0 rounded-full", statusMeta.dot)}
              />
              {statusMeta.label}
            </div>
            <div className="truncate text-xs text-muted-foreground">
              {onlineUnits}/{units.length} units · {onlineSensors}/
              {sensors.length} sensors online
            </div>
          </div>
          <Button
            variant="ghost"
            size="icon-sm"
            title="Reconnect"
            disabled={status === "connecting"}
            onClick={reconnect}
          >
            <RefreshCw
              className={cn(status === "connecting" && "animate-spin")}
            />
          </Button>
        </div>

        <div className="mt-2 grid grid-cols-4 gap-2">
          <Button
            variant={camera ? "secondary" : "outline"}
            size="icon-sm"
            title="Turn on camera"
            aria-pressed={camera}
            onClick={() => setCamera((value) => !value)}
          >
            <VideoOff />
          </Button>
          <Button
            variant={sharing ? "secondary" : "outline"}
            size="icon-sm"
            title="Share your screen"
            aria-pressed={sharing}
            onClick={() => setSharing((value) => !value)}
          >
            <MonitorUp />
          </Button>
          <Button variant="outline" size="icon-sm" title="Start an activity">
            <Shapes />
          </Button>
          <Button variant="outline" size="icon-sm" title="Soundboard">
            <Music />
          </Button>
        </div>
      </div>

      {/* User */}
      {user && (
        <SidebarMenu>
          <SidebarMenuItem>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <SidebarMenuButton
                  size="lg"
                  className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
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
                </SidebarMenuButton>
              </DropdownMenuTrigger>
              <UserMenuContent />
            </DropdownMenu>
            <SidebarMenuAction
              className="top-1/2! right-2 size-8 -translate-y-1/2 [&>svg]:size-5"
              title="User settings"
              onClick={openUserSettings}
            >
              <Settings />
            </SidebarMenuAction>
          </SidebarMenuItem>
        </SidebarMenu>
      )}
    </div>
  );
}
