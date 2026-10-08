import { useWebSocket } from "@/hooks/useWebSocket";
import { useAppSelector } from "@/store/hooks";
import { sensorsSelectors } from "@/store/slices/sensorsSlice";
import { unitsSelectors } from "@/store/slices/unitsSlice";
import { Button } from "@pes/ui/components/button";
import { cn } from "@pes/ui/lib/utils";
import { MonitorUp, Music, RefreshCw, Shapes, VideoOff } from "lucide-react";
import { useState } from "react";

import { getStatusMeta } from "./constants";

export function ConnectionCard() {
  const { status, reconnect } = useWebSocket();
  const units = useAppSelector(unitsSelectors.selectAll);
  const sensors = useAppSelector(sensorsSelectors.selectAll);

  const [camera, setCamera] = useState(false);
  const [sharing, setSharing] = useState(false);

  const onlineUnits = units.filter((unit) => unit.cnx_ok).length;
  const onlineSensors = sensors.filter((sensor) => sensor.sensor_online).length;
  const statusMeta = getStatusMeta(status);

  return (
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
  );
}
