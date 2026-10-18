import { Badge } from "@pes/ui/components/badge";
import { cn } from "@pes/ui/lib/utils";

/** "legacy" / "custom" pill used on cards, list rows and the inspector. */
export function ProfileTypeBadge({
    legacy,
    className,
}: {
    legacy: boolean;
    className?: string;
}) {
    return (
        <Badge
            variant="secondary"
            className={cn(
                "shrink-0 rounded-full border px-2 py-[3px] font-mono text-[10px] font-medium",
                legacy
                    ? "border-slate-500/30 bg-slate-500/15 text-slate-700 dark:text-slate-300"
                    : "border-purple-500/30 bg-purple-500/15 text-purple-700 dark:text-purple-200",
                className,
            )}
        >
            {legacy ? "legacy" : "custom"}
        </Badge>
    );
}

/** First-letter monogram — size, radius and text size come from `className`. */
export function ProfileMonogram({
    name,
    legacy,
    className,
}: {
    name: string;
    legacy: boolean;
    className?: string;
}) {
    return (
        <span
            className={cn(
                "flex shrink-0 items-center justify-center font-mono font-semibold",
                legacy
                    ? "bg-muted text-foreground/80"
                    : "bg-purple-500/15 text-purple-700 dark:text-purple-200",
                className,
            )}
        >
            {name.charAt(0).toUpperCase()}
        </span>
    );
}
