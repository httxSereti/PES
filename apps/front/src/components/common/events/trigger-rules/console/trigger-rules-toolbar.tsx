import type { RefObject } from "react";
import { Search } from "lucide-react";

import { Input } from "@pes/ui/components/input";
import { Kbd } from "@pes/ui/components/kbd";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@pes/ui/components/select";
import { cn } from "@pes/ui/lib/utils";

export type RuleStatusFilter = "all" | "enabled" | "disabled";
export type RuleSort = "priority" | "recent" | "updated" | "name";

export interface RuleSourceOption {
    id: string;
    label: string;
    count: number;
}

interface TriggerRulesToolbarProps {
    search: string;
    onSearchChange: (value: string) => void;
    status: RuleStatusFilter;
    onStatusChange: (value: RuleStatusFilter) => void;
    source: string;
    onSourceChange: (value: string) => void;
    sort: RuleSort;
    onSortChange: (value: RuleSort) => void;
    sources: RuleSourceOption[];
    counts: { all: number; enabled: number; disabled: number };
    searchRef: RefObject<HTMLInputElement | null>;
}

const SORT_LABELS: Record<RuleSort, string> = {
    priority: "Priority",
    recent: "Recently fired",
    updated: "Recently updated",
    name: "Name A–Z",
};

/** ⌘K on macOS, Ctrl+K elsewhere — mirrors the keydown handler in the console. */
function searchShortcut(): string {
    const platform = typeof navigator === "undefined" ? "" : navigator.platform;
    return /mac/i.test(platform) ? "⌘K" : "Ctrl+K";
}

export function TriggerRulesToolbar({
    search,
    onSearchChange,
    status,
    onStatusChange,
    source,
    onSourceChange,
    sort,
    onSortChange,
    sources,
    counts,
    searchRef,
}: TriggerRulesToolbarProps) {
    const statuses: Array<{ key: RuleStatusFilter; label: string; dot: string }> = [
        { key: "all", label: `All ${counts.all}`, dot: "bg-violet-500" },
        { key: "enabled", label: `Enabled ${counts.enabled}`, dot: "bg-emerald-500" },
        { key: "disabled", label: `Paused ${counts.disabled}`, dot: "bg-zinc-500" },
    ];

    return (
        <div className="flex flex-col gap-2 lg:flex-row lg:flex-wrap lg:items-center">
            <div className="relative w-full lg:w-72">
                <Search className="pointer-events-none absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input
                    ref={searchRef}
                    value={search}
                    onChange={(event) => onSearchChange(event.target.value)}
                    placeholder="Search name, event or label…"
                    aria-label="Search trigger rules"
                    className="h-9 pr-9 pl-8 sm:pr-14"
                />
                <Kbd className="pointer-events-none absolute top-1/2 right-2.5 hidden h-5 -translate-y-1/2 border border-border bg-transparent px-1.5 font-mono text-[10px] font-normal text-muted-foreground/70 sm:inline-flex">
                    {searchShortcut()}
                </Kbd>
            </div>

            <div
                role="group"
                aria-label="Filter rules by status"
                className="flex h-9 w-full items-center rounded-lg border border-border bg-muted/40 p-0.5 lg:w-auto"
            >
                {statuses.map((entry) => {
                    const active = status === entry.key;
                    return (
                        <button
                            key={entry.key}
                            type="button"
                            aria-pressed={active}
                            onClick={() => onStatusChange(entry.key)}
                            className={cn(
                                "flex h-full flex-1 items-center justify-center gap-1.5 rounded-md px-2.5 text-[11px] font-medium transition-colors lg:flex-none",
                                active
                                    ? "bg-background text-foreground shadow-xs"
                                    : "text-muted-foreground hover:text-foreground",
                            )}
                        >
                            <span
                                aria-hidden="true"
                                className={cn(
                                    "size-1.5 shrink-0 rounded-full",
                                    entry.dot,
                                    !active && "opacity-60",
                                )}
                            />
                            {entry.label}
                        </button>
                    );
                })}
            </div>

            <div className="flex flex-wrap items-center gap-2 lg:ml-auto">
                {sources.length > 1 && (
                    <Select value={source} onValueChange={onSourceChange}>
                        <SelectTrigger
                            size="sm"
                            aria-label="Filter by event source"
                            className="h-9 min-w-[130px] gap-2 px-3 text-xs [&_svg]:size-3.5"
                        >
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">All sources</SelectItem>
                            {sources.map((entry) => (
                                <SelectItem key={entry.id} value={entry.id}>
                                    {entry.label} ({entry.count})
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                )}

                <Select value={sort} onValueChange={(value) => onSortChange(value as RuleSort)}>
                    <SelectTrigger
                        size="sm"
                        aria-label="Sort trigger rules"
                        className="h-9 min-w-[140px] gap-2 px-3 text-xs [&_svg]:size-3.5"
                    >
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        {(Object.keys(SORT_LABELS) as RuleSort[]).map((key) => (
                            <SelectItem key={key} value={key}>
                                {SORT_LABELS[key]}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </div>
        </div>
    );
}
