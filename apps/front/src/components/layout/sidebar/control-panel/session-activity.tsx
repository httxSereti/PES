import { useWebSocket } from "@/hooks/useWebSocket";
import { hasPermission } from "@/lib/permissions";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import { openSessionSettings } from "@/store/slices/sessionSlice";
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
import { Button } from "@pes/ui/components/button";
import { cn } from "@pes/ui/lib/utils";
import { CircleStop, Eye, Play } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router";
import { toast } from "sonner";

import { SessionTimer } from "../session/session-timer";
import { useSessionInfo } from "./use-session-info";

export function SessionActivity() {
  const dispatch = useAppDispatch();
  const user = useAppSelector((state) => state.auth.user);
  const { sendCommand } = useWebSocket();
  const { activeSession, isLive, SessionIcon, sessionHref } = useSessionInfo();
  const [stopConfirmOpen, setStopConfirmOpen] = useState(false);

  const canManageSession = hasPermission(user, Permission.SESSION_MANAGE);

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

  return (
    <>
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
    </>
  );
}
