import { useEffect, useState } from "react";
import { formatDuration } from "@/lib/training";

interface TrainingTimerProps {
  startedAt: string | null;
  endedAt?: string | null;
  pausedAt?: string | null;
  totalPausedSeconds?: number;
  className?: string;
}

/** Ticks every second while the session is running (and freezes when paused). */
export function TrainingTimer({
  startedAt,
  endedAt,
  pausedAt,
  totalPausedSeconds = 0,
  className,
}: TrainingTimerProps) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!startedAt || endedAt || pausedAt) return;
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [startedAt, endedAt, pausedAt]);

  if (!startedAt) return <span className={className}>—</span>;

  const end = endedAt
    ? new Date(endedAt).getTime()
    : pausedAt
      ? new Date(pausedAt).getTime()
      : now;
  const raw = Math.max(
    0,
    Math.floor((end - new Date(startedAt).getTime()) / 1000),
  );
  const seconds = Math.max(0, raw - totalPausedSeconds);

  return (
    <span className={`font-mono tabular-nums ${className ?? ""}`}>
      {formatDuration(seconds)}
    </span>
  );
}
