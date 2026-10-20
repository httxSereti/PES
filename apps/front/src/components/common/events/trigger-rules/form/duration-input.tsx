import { Infinity as InfinityIcon } from "lucide-react";

import { Input } from "@pes/ui/components/input";
import { cn } from "@pes/ui/lib/utils";

type DurationInputProps = {
    id?: string;
    value: number | string;
    onChange: (value: number | "") => void;
    invalid?: boolean;
};

export function DurationInput({ id, value, onChange, invalid }: DurationInputProps) {
    const isInfinite = Number(value) === -1;

    return (
        <div
            className={cn(
                "flex h-9 w-full items-center overflow-hidden rounded-lg border border-input bg-transparent shadow-xs transition-[color,box-shadow]",
                "focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/50 dark:bg-input/30",
                invalid && "border-destructive ring-destructive/20 dark:ring-destructive/40",
            )}
        >
            <Input
                id={id}
                type="number"
                min={-1}
                step={1}
                value={value}
                onChange={(event) => onChange(event.target.value === "" ? "" : Number(event.target.value))}
                aria-invalid={invalid}
                placeholder="-1"
                className="duration-input order-2 h-9 min-w-0 flex-1 rounded-lg border-0 bg-transparent px-3 shadow-none focus-visible:border-0 focus-visible:ring-0 dark:bg-transparent"
            />
            <span className="order-4 shrink-0 pr-3 font-mono text-[9px] uppercase tracking-wide text-muted-foreground/50">
                sec
            </span>
            <span className="order-3 mx-2 h-5 w-px shrink-0 bg-border" />
            <button
                type="button"
                onClick={() => onChange(-1)}
                aria-pressed={isInfinite}
                aria-label="No expiry (-1)"
                title="No expiry (-1)"
                className={cn(
                    "order-1 ml-1 inline-flex h-7 shrink-0 items-center gap-1.5 rounded-md px-2 font-mono text-[10px] transition-colors",
                    isInfinite
                        ? "bg-violet-500/15 text-violet-700 dark:text-violet-300"
                        : "text-muted-foreground/60 hover:bg-muted hover:text-foreground",
                )}
            >
                <InfinityIcon className="size-4" />
                <span className="hidden sm:inline">No expiry</span>
            </button>
        </div>
    );
}
