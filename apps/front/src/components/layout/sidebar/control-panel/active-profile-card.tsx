import { UNITS } from "@/components/common/session/session.constants";
import { useWebSocket } from "@/hooks/useWebSocket";
import { useAppSelector } from "@/store/hooks";
import { selectActiveProfile } from "@/store/slices/profilesSlice";
import { Button } from "@pes/ui/components/button";
import { cn } from "@pes/ui/lib/utils";
import { Bookmark, Square } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { CountdownTimer } from "../session/session-timer";

export function ActiveProfileCard() {
  const activeProfile = useAppSelector(selectActiveProfile);
  const { sendCommand } = useWebSocket();
  const [stoppingProfile, setStoppingProfile] = useState(false);

  const stopProfile = async () => {
    setStoppingProfile(true);
    try {
      const data = await sendCommand("profiles:stop");

      if (data.status === "ok") {
        toast.success("Profile stopped", {
          description: "Previous settings were restored",
          position: "bottom-right",
          closeButton: true,
        });
        return;
      }

      toast.error("Failed to stop profile", {
        description: data.message ?? undefined,
        position: "bottom-right",
        closeButton: true,
      });
    } catch (error) {
      toast.error("Failed to stop profile", {
        description: "The server did not answer",
        position: "bottom-right",
        closeButton: true,
      });
      console.error("Stop profile failed", error);
    } finally {
      setStoppingProfile(false);
    }
  };

  if (!activeProfile) return null;

  return (
    <div className="rounded-lg border border-violet-500/30 bg-violet-500/5 p-2">
      <div className="flex items-center gap-2">
        <div className="grid size-8 shrink-0 place-items-center rounded-md bg-violet-500/15 text-violet-600 dark:text-violet-400">
          <Bookmark className="size-4" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium">
            {activeProfile.name}
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              {UNITS.map((unit) => (
                <span
                  key={unit.id}
                  title={unit.label}
                  className={cn(
                    "size-2 rounded-full",
                    activeProfile.units?.includes(unit.id)
                      ? "bg-violet-500"
                      : "bg-muted-foreground/30",
                  )}
                />
              ))}
            </span>
            <CountdownTimer endsAt={activeProfile.ends_at} />
          </div>
        </div>
        <Button
          variant="ghost"
          size="icon-sm"
          title="Stop profile"
          disabled={stoppingProfile}
          className="text-muted-foreground hover:text-destructive"
          onClick={() => void stopProfile()}
        >
          <Square />
        </Button>
        <div className="flex shrink-0 items-center gap-1.5">
          <span className="text-xs font-medium text-violet-600 tabular-nums dark:text-violet-400">
            {activeProfile.level_pct}%
          </span>
          <div
            className="flex h-9 w-1.5 flex-col justify-end overflow-hidden rounded-full bg-violet-500/15"
            title={`Level ${activeProfile.level_pct}%`}
          >
            <div
              className="w-full rounded-full bg-violet-500"
              style={{
                height: `${Math.min(100, activeProfile.level_pct * 0.7)}%`,
              }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
