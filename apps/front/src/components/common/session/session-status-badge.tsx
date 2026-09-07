import { cn } from "@pes/ui/lib/utils";

const STATUS_META: Record<
  string,
  { label: string; className: string; live?: boolean }
> = {
  running: {
    label: "Running",
    className:
      "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
    live: true,
  },
  ended: {
    label: "Ended",
    className:
      "border-zinc-500/30 bg-zinc-500/10 text-zinc-600 dark:text-zinc-300",
  },
};

export function SessionStatusBadge({ status }: { status: string }) {
  const meta = STATUS_META[status] ?? {
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
