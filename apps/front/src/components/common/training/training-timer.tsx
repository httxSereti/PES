import { useEffect, useState } from "react";
import { formatDuration } from "@/lib/training";

interface TrainingTimerProps {
  startedAt: string | null;
  endedAt?: string | null;
  className?: string;
}

/** Ticks every second while the session is running. */
export function TrainingTimer({
  startedAt,
  endedAt,
  className,
}: TrainingTimerProps) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!startedAt || endedAt) return;
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [startedAt, endedAt]);

  if (!startedAt) return <span className={className}>—</span>;

  const end = endedAt ? new Date(endedAt).getTime() : now;
  const seconds = Math.max(
    0,
    Math.floor((end - new Date(startedAt).getTime()) / 1000),
  );

  return (
    <span className={`font-mono tabular-nums ${className ?? ""}`}>
      {formatDuration(seconds)}
    </span>
  );
}
