import { useRef } from "react";

import { Input } from "@pes/ui/components/input";
import { cn } from "@pes/ui/lib/utils";

const MAGIC_NUMBER_PRESETS = [
    { value: "30", title: "Set to 30" },
    { value: "+5", title: "Add 5" },
    { value: "-5", title: "Subtract 5" },
    { value: "%+5", title: "Add 5%" },
    { value: "%-5", title: "Subtract 5%" },
    { value: "[5-10]", title: "Random 5–10" },
    { value: "%+[5-10]", title: "Add a random 5–10%" },
    { value: "%-[5-10]", title: "Subtract a random 5–10%" },
] as const;

type MagicNumberInputProps = {
    id?: string;
    value: string;
    onChange: (value: string) => void;
    invalid?: boolean;
};

export function MagicNumberInput({ id, value, onChange, invalid }: MagicNumberInputProps) {
    const inputRef = useRef<HTMLInputElement>(null);

    return (
        <div className="space-y-2">
            <Input
                ref={inputRef}
                id={id}
                value={value}
                onChange={(event) => onChange(event.target.value)}
                aria-invalid={invalid}
                placeholder="30, +5, %-[5-10]"
                autoComplete="off"
                className="font-mono"
            />
            <div className="flex flex-wrap items-center gap-1.5">
                <span className="font-mono text-[8px] uppercase tracking-widest text-muted-foreground/40">
                    Quick add
                </span>
                {MAGIC_NUMBER_PRESETS.map((preset) => {
                    const active = value === preset.value;
                    return (
                        <button
                            key={preset.value}
                            type="button"
                            onClick={() => {
                                onChange(preset.value);
                                inputRef.current?.focus();
                            }}
                            aria-pressed={active}
                            title={preset.title}
                            className={cn(
                                "rounded-md border px-2 py-1 font-mono text-[10px] transition-colors",
                                active
                                    ? "border-violet-500/40 bg-violet-500/10 text-violet-700 dark:text-violet-300"
                                    : "border-border/70 bg-background/40 text-muted-foreground hover:border-violet-500/40 hover:bg-violet-500/10 hover:text-foreground",
                            )}
                        >
                            {preset.value}
                        </button>
                    );
                })}
            </div>
        </div>
    );
}
