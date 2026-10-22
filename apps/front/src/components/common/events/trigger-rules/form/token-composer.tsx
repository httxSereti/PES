import { useEffect, useRef, useState } from "react";
import { Plus, X } from "lucide-react";

import { cn } from "@pes/ui/lib/utils";

type TokenKind = "units" | "channels";

type TokenComposerProps = {
    id?: string;
    kind: TokenKind;
    value: string;
    onChange: (value: string) => void;
    ariaInvalid?: boolean;
    placeholder: string;
    quickAdd: string[];
    hint: string;
};

const PATTERNS: Record<TokenKind, RegExp> = {
    units: /^[1-3]+(?:RM|RO)?$/,
    channels: /^[AB]+(?:RM|RO)?$/,
};

const ERROR_MESSAGES: Record<TokenKind, string> = {
    units: "Use unit IDs 1–3, optionally followed by RM or RO.",
    channels: "Use channels A/B, optionally followed by RM or RO.",
};

export function TokenComposer({
    id,
    kind,
    value,
    onChange,
    ariaInvalid,
    placeholder,
    quickAdd,
    hint,
}: TokenComposerProps) {
    const [draft, setDraft] = useState("");
    const [error, setError] = useState<string | null>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    const current = value.trim();
    const invalid = Boolean(ariaInvalid || error);

    useEffect(() => {
        setDraft("");
        setError(null);
    }, [value]);

    function commit(raw: string) {
        const token = raw.trim().replace(/\s+/g, "").toUpperCase();
        if (!token) return;

        if (!PATTERNS[kind].test(token)) {
            setError(ERROR_MESSAGES[kind]);
            return;
        }

        setError(null);
        setDraft("");
        onChange(token);
        inputRef.current?.focus();
    }

    function remove() {
        setDraft("");
        setError(null);
        onChange("");
        inputRef.current?.focus();
    }

    function addPreset(token: string) {
        setDraft("");
        setError(null);
        onChange(token);
        inputRef.current?.focus();
    }

    return (
        <div className="space-y-2">
            <div
                onClick={() => inputRef.current?.focus()}
                className={cn(
                    "flex min-h-11 w-full flex-wrap items-center gap-1.5 rounded-lg border bg-background px-2.5 py-1.5 transition-colors",
                    "focus-within:border-violet-500/60 focus-within:ring-2 focus-within:ring-violet-500/15",
                    invalid && "border-destructive focus-within:border-destructive focus-within:ring-destructive/15",
                )}
            >
                {current && (
                    <span className="inline-flex max-w-full items-center gap-1 rounded-md border border-violet-500/30 bg-violet-500/10 px-2 py-1 font-mono text-[10px] text-violet-700 dark:text-violet-300">
                        <span className="truncate">{current}</span>
                        <button
                            type="button"
                            onClick={(event) => {
                                event.stopPropagation();
                                remove();
                            }}
                            className="rounded-sm text-violet-600/70 transition-colors hover:bg-violet-500/15 hover:text-violet-700 dark:text-violet-300/70 dark:hover:text-violet-200"
                            aria-label={`Remove ${current}`}
                        >
                            <X className="size-3" />
                        </button>
                    </span>
                )}
                <input
                    ref={inputRef}
                    id={id}
                    value={draft}
                    onChange={(event) => {
                        setDraft(event.target.value);
                        if (error) setError(null);
                    }}
                    onKeyDown={(event) => {
                        if (event.key === "Enter") {
                            event.preventDefault();
                            commit(draft);
                        }
                        if (event.key === ",") {
                            event.preventDefault();
                            setError("Use one group per field — commas are not needed.");
                        }
                        if (event.key === "Backspace" && !draft && current) {
                            event.preventDefault();
                            remove();
                        }
                        if (event.key === "Escape") {
                            setDraft("");
                            setError(null);
                        }
                    }}
                    onBlur={() => {
                        if (draft.trim()) commit(draft);
                    }}
                    aria-invalid={invalid}
                    placeholder={current ? "Replace…" : placeholder}
                    autoComplete="off"
                    spellCheck={false}
                    className="min-w-[100px] flex-1 bg-transparent px-1 py-1 text-sm outline-none placeholder:text-muted-foreground/45"
                />
            </div>

            <div className="flex flex-wrap items-center gap-1.5">
                <span className="font-mono text-[8px] uppercase tracking-widest text-muted-foreground/40">
                    Quick add
                </span>
                {quickAdd
                    .filter((token) => token !== current)
                    .map((token) => (
                        <button
                            key={token}
                            type="button"
                            onClick={() => addPreset(token)}
                            className="inline-flex items-center gap-1 rounded-md border border-border/70 bg-background/40 px-1.5 py-1 font-mono text-[9px] text-muted-foreground transition-colors hover:border-violet-500/40 hover:bg-violet-500/10 hover:text-foreground"
                        >
                            <Plus className="size-2.5" />
                            {token}
                        </button>
                    ))}
            </div>

            <p className="text-[10px] leading-snug text-muted-foreground/60">{hint}</p>
            {error && (
                <p role="alert" className="text-[10px] leading-snug text-destructive">
                    {error}
                </p>
            )}
        </div>
    );
}
