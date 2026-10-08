import { useWebSocket } from "@/hooks/useWebSocket";
import { useAppSelector } from "@/store/hooks";
import { sensorsSelectors } from "@/store/slices/sensorsSlice";
import { unitsSelectors } from "@/store/slices/unitsSlice";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@pes/ui/components/tooltip";
import { cn } from "@pes/ui/lib/utils";
import { Link } from "react-router";

import { SessionTimer } from "../session/session-timer";
import { getStatusMeta } from "./constants";
import { UserMenu } from "./user-menu";
import { useSessionInfo } from "./use-session-info";

export function CollapsedControlPanel() {
  const { status, reconnect } = useWebSocket();
  const units = useAppSelector(unitsSelectors.selectAll);
  const sensors = useAppSelector(sensorsSelectors.selectAll);
  const { activeSession, isLive, sessionHref } = useSessionInfo();

  const onlineUnits = units.filter((unit) => unit.cnx_ok).length;
  const onlineSensors = sensors.filter((sensor) => sensor.sensor_online).length;
  const statusMeta = getStatusMeta(status);

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

      <UserMenu collapsed />
    </div>
  );
}
