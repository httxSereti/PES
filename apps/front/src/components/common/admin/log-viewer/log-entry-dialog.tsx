import { useCallback, useMemo, type ReactNode } from "react";
import { Copy } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@pes/ui/components/button";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@pes/ui/components/dialog";
import { entryToJson, LEVEL_BADGE_COLORS } from "@/lib/logs";
import type { ParsedLogEntry } from "@/types/logs.types";

/** Tokenize a pretty-printed JSON string for lightweight syntax colors. */
function highlightJson(json: string): ReactNode[] {
    if (!json) return [];

    const tokenRegex =
        /("(?:\\.|[^"\\])*")\s*:|("(?:\\.|[^"\\])*")|(-?\d+\.?\d*(?:[eE][+-]?\d+)?)|(\btrue\b|\bfalse\b)|(\bnull\b)|([{}[\],:])/g;

    const result: ReactNode[] = [];
    let lastIndex = 0;
    let key = 0;

    for (const match of json.matchAll(tokenRegex)) {
        const matchIndex = match.index;
        if (matchIndex == null) continue;

        if (matchIndex > lastIndex) {
            result.push(json.slice(lastIndex, matchIndex));
        }

        const [
            fullMatch,
            keyMatch,
            stringMatch,
            numberMatch,
            boolMatch,
            nullMatch,
            punctMatch,
        ] = match;

        if (keyMatch) {
            result.push(
                <span key={key++} className="text-cyan-700 dark:text-cyan-400">
                    {keyMatch}
                </span>,
                ":",
            );
        } else if (stringMatch) {
            result.push(
                <span
                    key={key++}
                    className="text-emerald-700 dark:text-emerald-400"
                >
                    {stringMatch}
                </span>,
            );
        } else if (numberMatch) {
            result.push(
                <span
                    key={key++}
                    className="text-amber-700 dark:text-amber-400"
                >
                    {numberMatch}
                </span>,
            );
        } else if (boolMatch) {
            result.push(
                <span
                    key={key++}
                    className="text-purple-700 dark:text-purple-400"
                >
                    {boolMatch}
                </span>,
            );
        } else if (nullMatch) {
            result.push(
                <span key={key++} className="text-muted-foreground">
                    {nullMatch}
                </span>,
            );
        } else if (punctMatch) {
            result.push(
                <span key={key++} className="text-muted-foreground/70">
                    {punctMatch}
                </span>,
            );
        } else {
            result.push(fullMatch);
        }

        lastIndex = matchIndex + fullMatch.length;
    }

    if (lastIndex < json.length) {
        result.push(json.slice(lastIndex));
    }

    return result;
}

async function copyText(text: string, successMessage: string) {
    try {
        await navigator.clipboard.writeText(text);
        toast.success(successMessage);
    } catch {
        toast.error("Failed to copy to clipboard");
    }
}

export function LogEntryDialog({
    entry,
    onClose,
}: {
    entry: ParsedLogEntry | null;
    onClose: () => void;
}) {
    const prettyJson = useMemo(
        () => (entry ? entryToJson(entry) : ""),
        [entry],
    );
    const highlightedJson = useMemo(
        () => highlightJson(prettyJson),
        [prettyJson],
    );

    const handleCopyRaw = useCallback(() => {
        if (!entry) return;
        void copyText(entry.raw, "Raw log line copied");
    }, [entry]);

    const handleCopyJson = useCallback(() => {
        if (!prettyJson) return;
        void copyText(prettyJson, "Log entry copied as JSON");
    }, [prettyJson]);

    return (
        <Dialog
            open={entry !== null}
            onOpenChange={(open) => {
                if (!open) onClose();
            }}
        >
            <DialogContent className="sm:max-w-2xl">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        Log entry
                        {entry && (
                            <span
                                className={`rounded px-1.5 py-0.5 text-xs font-medium uppercase ${LEVEL_BADGE_COLORS[entry.level]}`}
                            >
                                {entry.level}
                            </span>
                        )}
                    </DialogTitle>
                    <DialogDescription>
                        {entry?.time
                            ? new Date(entry.time).toLocaleString("fr-FR")
                            : "Raw log line"}
                    </DialogDescription>
                </DialogHeader>

                <div className="max-h-[400px] overflow-auto rounded-md border bg-muted/30 p-4">
                    <pre className="font-mono text-sm whitespace-pre-wrap break-all">
                        {highlightedJson}
                    </pre>
                </div>

                <DialogFooter className="gap-2 sm:gap-2">
                    <Button variant="outline" size="sm" onClick={handleCopyRaw}>
                        <Copy className="mr-2 size-4" />
                        Copy raw
                    </Button>
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={handleCopyJson}
                    >
                        <Copy className="mr-2 size-4" />
                        Copy JSON
                    </Button>
                    <Button size="sm" onClick={onClose}>
                        Close
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
