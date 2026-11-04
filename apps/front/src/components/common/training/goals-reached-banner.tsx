import { useEffect, useState } from "react";
import type { EdgingSessionSummary } from "@/types";
import { sessionGoalsMet } from "@/lib/training";
import { CheckCheck } from "lucide-react";
import { Button } from "@pes/ui/components/button";

interface GoalsReachedBannerProps {
  session: EdgingSessionSummary;
  isHost: boolean;
  busy: boolean;
  onEnd: () => void;
}

/**
 * Shown as soon as every goal is reached, including duration goals that are
 * still running (the server only broadcasts when the session itself changes).
 */
export function GoalsReachedBanner({
  session,
  isHost,
  busy,
  onEnd,
}: GoalsReachedBannerProps) {
  const running = session.status === "running";
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!running || session.paused_at) return;
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [running, session.paused_at, session.started_at]);

  if (
    !running ||
    session.auto_stop_on_goal ||
    !sessionGoalsMet(session, now)
  ) {
    return null;
  }

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-lg border border-violet-500/30 bg-violet-500/10 px-4 py-3">
      <CheckCheck
        size={16}
        className="shrink-0 text-violet-600 dark:text-violet-400"
      />
      <p className="flex-1 min-w-40 text-sm">
        <span className="font-medium">All goals reached!</span>{" "}
        <span className="text-muted-foreground">
          {isHost
            ? "You can end the session or keep going."
            : "Waiting for the Host to end it or continue."}
        </span>
      </p>
      {isHost && (
        <Button size="sm" disabled={busy} onClick={onEnd}>
          <CheckCheck size={14} />
          End session (success)
        </Button>
      )}
    </div>
  );
}
