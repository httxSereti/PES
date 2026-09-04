import type { EdgingEdge } from "@/types";
import { difficultyMeta, OUTCOME_META } from "@/lib/training";
import { formatDateTime } from "@/lib/format-date";
import { X } from "lucide-react";

interface EdgeTimelineProps {
  edges: EdgingEdge[];
  /** Elapsed seconds from the session start shown next to each edge. */
  startedAt: string | null;
}

export function EdgeTimeline({ edges, startedAt }: EdgeTimelineProps) {
  if (edges.length === 0) {
    return (
      <p className="py-6 text-center text-xs text-muted-foreground">
        No edges recorded yet.
      </p>
    );
  }

  const start = startedAt ? new Date(startedAt).getTime() : null;

  return (
    <ol className="relative flex flex-col gap-1 border-l border-border/60 pl-4 ml-1.5">
      {edges.map((edge) => {
        const meta = difficultyMeta(edge.difficulty);
        const outcome = OUTCOME_META[edge.outcome as keyof typeof OUTCOME_META];
        const elapsed = start
          ? Math.max(
              0,
              Math.round((new Date(edge.recorded_at).getTime() - start) / 1000),
            )
          : null;

        return (
          <li key={edge.id} className="relative py-1.5">
            <span
              className="absolute -left-[21.5px] top-2.5 h-2 w-2 rounded-full ring-2 ring-background"
              style={{ background: meta.dot }}
            />
            <div className="flex flex-wrap items-center gap-2">
              <span className={`text-[11px] font-semibold ${meta.text}`}>
                {meta.label}
              </span>
              <span className="text-[11px] text-muted-foreground/60">
                {formatDateTime(edge.recorded_at)}
              </span>
              {elapsed !== null && (
                <span className="font-mono text-[10px] tabular-nums text-muted-foreground/50">
                  +{Math.floor(elapsed / 60)}:
                  {String(elapsed % 60).padStart(2, "0")}
                </span>
              )}
              <span
                className={`ml-auto inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] font-medium ${outcome.className}`}
              >
                {outcome.label === "Failed" && <X size={10} />}
                {outcome.label}
              </span>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
