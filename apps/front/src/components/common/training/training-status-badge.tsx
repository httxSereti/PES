import { STATUS_META } from "@/lib/training";
import { cn } from "@pes/ui/lib/utils";

interface TrainingStatusBadgeProps {
  status: string;
  paused?: boolean;
}

export function TrainingStatusBadge({
  status,
  paused = false,
}: TrainingStatusBadgeProps) {
  const effectiveStatus = status === "running" && paused ? "paused" : status;
  const meta = STATUS_META[effectiveStatus] ?? {
    label: status,
    className: "border-zinc-500/30 bg-zinc-500/10 text-muted-foreground",
  };

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-[11px] font-medium capitalize",
        meta.className,
      )}
    >
      {meta.live && (
        <span className="relative flex h-1.5 w-1.5">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
          <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500" />
        </span>
      )}
      {meta.label}
    </span>
  );
}
