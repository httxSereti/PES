import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, ImageOff, Layers, Plus, Search, SlidersHorizontal, X } from "lucide-react";

import { Badge } from "@pes/ui/components/badge";
import { Button } from "@pes/ui/components/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@pes/ui/components/dialog";
import { Input } from "@pes/ui/components/input";
import { cn } from "@pes/ui/lib/utils";

import { useAppSelector } from "@/store/hooks";
import { triggerRulesSelectors } from "@/store/slices/triggerRulesSlice";
import { ActionType } from "@/types/events.types";

import { useActionCatalog, type ActionCatalogEntry } from "./action-groups";
import { ActionSourceBadge, actionIcon } from "./action-visuals";
import { EventSourceIcon, sourceMeta } from "./event-visuals";

type ActionExplorerProps = {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    value?: ActionType;
    mode: "add" | "change";
    onSelect: (type: ActionType) => void;
};

export function ActionExplorer({ open, onOpenChange, value, mode, onSelect }: ActionExplorerProps) {
    const { actions, sources } = useActionCatalog();
    const rules = useAppSelector(triggerRulesSelectors.selectAll);
    const [focused, setFocused] = useState<string | null>(value ?? null);
    const [query, setQuery] = useState("");
    const [source, setSource] = useState("all");
    const [group, setGroup] = useState<string | null>(null);
    const [collapsedSections, setCollapsedSections] = useState<Set<string>>(() => new Set());
    const searchRef = useRef<HTMLInputElement>(null);

    const actionList = useMemo(() => Object.values(actions), [actions]);

    const sourceGroups = useMemo(() => {
        if (source === "all") return [];
        const counts = new Map<string, number>();
        for (const action of actionList) {
            if (action.integrationId !== source) continue;
            const key = action.group || "Actions";
            counts.set(key, (counts.get(key) ?? 0) + 1);
        }
        return Array.from(counts.entries()).map(([label, count]) => ({ label, count }));
    }, [actionList, source]);

    const isSearching = query.trim().length > 0;

    const filtered = useMemo(() => {
        const needle = query.trim().toLowerCase();
        return actionList.filter((action) => {
            if (source !== "all" && action.integrationId !== source) return false;
            if (group && (action.group || "Actions") !== group) return false;
            if (!needle) return true;
            const payloadFields = Object.keys(action.payloadSchema).join(" ");
            return `${action.label} ${action.description} ${action.id} ${action.group} ${action.integrationName} ${payloadFields}`
                .toLowerCase()
                .includes(needle);
        });
    }, [actionList, group, query, source]);

    const sections = useMemo(() => {
        const map = new Map<string, ActionCatalogEntry[]>();
        for (const action of filtered) {
            const key = source === "all" ? action.integrationName : action.group || "Actions";
            const list = map.get(key);
            if (list) list.push(action);
            else map.set(key, [action]);
        }
        return Array.from(map.entries()).map(([label, actions]) => ({ label, actions }));
    }, [filtered, source]);

    const focusedAction =
        (focused ? actions[focused] : undefined) ??
        (filtered[0] ? actions[filtered[0].id] : undefined) ??
        (value ? actions[value] : undefined);

    const usedBy = focusedAction
        ? rules.filter((rule) => rule.actions.some((action) => action.action_type === focusedAction.id)).length
        : 0;

    useEffect(() => {
        if (!open) return;
        setFocused(value ?? ActionType.LEVEL);
        setQuery("");
        setSource("all");
        setGroup(null);
        setCollapsedSections(new Set());
        const timer = window.setTimeout(() => searchRef.current?.focus(), 60);
        return () => window.clearTimeout(timer);
        // Reset only when the dialog opens; catalog/value updates while open
        // must not discard the current preview.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open]);

    useEffect(() => {
        const first = filtered[0];
        if (!first) return;
        if (focused && filtered.some((action) => action.id === focused)) return;
        setFocused(first.id);
    }, [filtered, focused]);

    function toggleSection(label: string) {
        setCollapsedSections((current) => {
            const next = new Set(current);
            if (next.has(label)) next.delete(label);
            else next.add(label);
            return next;
        });
    }

    function confirm() {
        if (!focusedAction) return;
        onSelect(focusedAction.id);
        onOpenChange(false);
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent
                showCloseButton={false}
                style={{
                    maxWidth: "1120px",
                    width: "min(1120px, calc(100vw - 2rem))",
                    height: "min(840px, calc(100vh - 2rem))",
                    padding: 0,
                    gap: 0,
                    display: "flex",
                    flexDirection: "column",
                }}
                className="max-w-none overflow-hidden"
            >
                <div className="flex items-center gap-3 border-b px-4 py-3 text-left sm:px-6 sm:py-4">
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-violet-500/25 bg-violet-500/10 sm:size-10">
                        <SlidersHorizontal className="size-4 text-violet-600 sm:size-[18px] dark:text-violet-400" />
                    </span>
                    <div className="min-w-0 flex-1">
                        <DialogTitle className="text-base sm:text-lg">Choose an action</DialogTitle>
                        <DialogDescription className="text-xs sm:text-sm">
                            {mode === "add"
                                ? "Pick what should happen after the event fires."
                                : "Change this action type. Its position is preserved."}
                        </DialogDescription>
                    </div>
                    <div className="ml-auto flex shrink-0 items-center gap-2">
                        <Badge
                            variant="outline"
                            className="hidden font-mono text-xs text-muted-foreground sm:inline-flex"
                        >
                            {actionList.length} actions
                        </Badge>
                        <Button
                            type="button"
                            variant="ghost"
                            size="icon-sm"
                            onClick={() => onOpenChange(false)}
                            aria-label="Close action picker"
                        >
                            <X className="size-4" />
                        </Button>
                    </div>
                </div>

                <div className="flex items-center gap-3 border-b px-4 py-3 sm:px-6">
                    <div className="relative flex-1">
                        <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
                        <Input
                            ref={searchRef}
                            value={query}
                            onChange={(event) => setQuery(event.target.value)}
                            placeholder="Search actions, payload fields and sources…"
                            className="h-9 pl-9 text-sm"
                        />
                    </div>
                    <span className="shrink-0 font-mono text-xs text-muted-foreground">
                        {filtered.length} action{filtered.length === 1 ? "" : "s"}
                    </span>
                </div>

                <div className="flex min-h-0 flex-1 flex-col lg:grid lg:grid-cols-[200px_360px_minmax(0,1fr)]">
                    <aside className="hidden min-h-0 flex-col overflow-y-auto border-r bg-muted/20 p-2.5 lg:flex">
                        <p className="px-2 pb-1 pt-1 font-mono text-[11px] uppercase tracking-widest text-muted-foreground/50">
                            Sources
                        </p>
                        <button
                            type="button"
                            onClick={() => {
                                setSource("all");
                                setGroup(null);
                            }}
                            className={cn(
                                "flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm transition-colors hover:bg-muted/60",
                                source === "all" && "bg-violet-500/10 text-violet-700 dark:text-violet-300",
                            )}
                        >
                            <span className="flex size-7 items-center justify-center rounded-md border bg-background">
                                <Layers className="size-4" />
                            </span>
                            <span className="min-w-0 flex-1 truncate">All actions</span>
                            <span className="font-mono text-[11px] text-muted-foreground">{actionList.length}</span>
                        </button>
                        {sources.map((entry) => (
                            <button
                                key={entry.id}
                                type="button"
                                onClick={() => {
                                    setSource(entry.id);
                                    setGroup(null);
                                }}
                                className={cn(
                                    "flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm transition-colors hover:bg-muted/60",
                                    source === entry.id && "bg-violet-500/10 text-violet-700 dark:text-violet-300",
                                )}
                            >
                                <EventSourceIcon
                                    integrationId={entry.id}
                                    className="size-7 rounded-md"
                                    iconClassName="size-4"
                                />
                                <span className="min-w-0 flex-1 truncate">{entry.label}</span>
                                <span className="font-mono text-[11px] text-muted-foreground">{entry.count}</span>
                            </button>
                        ))}

                        {sourceGroups.length > 0 && (
                            <>
                                <div className="my-2 border-t" />
                                <p className="px-2 pb-1 font-mono text-[11px] uppercase tracking-widest text-muted-foreground/50">
                                    Groups
                                </p>
                                {sourceGroups.map((entry) => (
                                    <button
                                        key={entry.label}
                                        type="button"
                                        onClick={() => {
                                            setCollapsedSections((current) => {
                                                if (!current.has(entry.label)) return current;
                                                const next = new Set(current);
                                                next.delete(entry.label);
                                                return next;
                                            });
                                            setGroup((current) => (current === entry.label ? null : entry.label));
                                        }}
                                        className={cn(
                                            "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs transition-colors hover:bg-muted/60",
                                            group === entry.label &&
                                                "bg-violet-500/10 text-violet-700 dark:text-violet-300",
                                        )}
                                    >
                                        <span className="size-1.5 rounded-full bg-muted-foreground/40" />
                                        <span className="min-w-0 flex-1 truncate">{entry.label}</span>
                                        <span className="font-mono text-[11px] text-muted-foreground">
                                            {entry.count}
                                        </span>
                                    </button>
                                ))}
                            </>
                        )}
                    </aside>

                    <div className="min-h-0 flex-1 overflow-y-auto border-b lg:border-r lg:border-b-0">
                        {sections.length === 0 ? (
                            <div className="flex h-full flex-col items-center justify-center gap-2 p-8 text-center">
                                <Search className="size-5 text-muted-foreground/40" />
                                <p className="text-sm text-muted-foreground">No actions match this search.</p>
                            </div>
                        ) : (
                            sections.map((section) => {
                                const isCollapsed = !isSearching && collapsedSections.has(section.label);

                                return (
                                    <div key={section.label}>
                                        <button
                                            type="button"
                                            onClick={() => toggleSection(section.label)}
                                            aria-expanded={!isCollapsed}
                                            className="sticky top-0 z-10 flex w-full items-center justify-between border-b bg-background/95 px-4 py-2.5 text-left backdrop-blur transition-colors hover:bg-muted/30"
                                        >
                                            <span className="flex min-w-0 items-center gap-1.5">
                                                <ChevronDown
                                                    className={cn(
                                                        "size-3.5 shrink-0 text-muted-foreground/40 transition-transform",
                                                        isCollapsed && "-rotate-90",
                                                    )}
                                                />
                                                <span className="truncate font-mono text-[11px] uppercase tracking-widest text-muted-foreground/60">
                                                    {section.label}
                                                </span>
                                            </span>
                                            <span className="shrink-0 font-mono text-[11px] text-muted-foreground/40">
                                                {section.actions.length}
                                            </span>
                                        </button>
                                        {!isCollapsed &&
                                            section.actions.map((action) => {
                                                const selected = focusedAction?.id === action.id;
                                                const Icon = actionIcon(action.id);
                                                return (
                                                    <button
                                                        key={action.id}
                                                        type="button"
                                                        aria-pressed={selected}
                                                        onClick={() => setFocused(action.id)}
                                                        className={cn(
                                                            "group flex w-full items-center gap-3 border-b border-border/50 px-4 py-3 text-left transition-colors hover:bg-muted/40 focus-visible:ring-2 focus-visible:ring-violet-500/40 focus-visible:ring-inset focus-visible:outline-none",
                                                            selected && "bg-violet-500/[0.07]",
                                                        )}
                                                    >
                                                        <span
                                                            className={cn(
                                                                "flex size-9 shrink-0 items-center justify-center rounded-lg border",
                                                                selected
                                                                    ? "border-violet-500/40 bg-violet-500/15 text-violet-700 dark:text-violet-300"
                                                                    : "border-border bg-muted/30 text-muted-foreground",
                                                            )}
                                                        >
                                                            <Icon className="size-[18px]" />
                                                        </span>
                                                        <span className="min-w-0 flex-1">
                                                            <span className="flex items-center gap-1.5">
                                                                <span className="truncate text-sm font-medium">
                                                                    {action.label}
                                                                </span>
                                                                {!action.enabled && (
                                                                    <Badge
                                                                        variant="outline"
                                                                        className="shrink-0 px-1 py-0 font-mono text-[10px] uppercase text-muted-foreground"
                                                                    >
                                                                        disabled
                                                                    </Badge>
                                                                )}
                                                            </span>
                                                            <span className="line-clamp-2 text-xs leading-snug text-muted-foreground/65">
                                                                {action.description || "No description available."}
                                                            </span>
                                                            <span className="mt-1 flex items-center gap-1 font-mono text-[11px] uppercase tracking-wide text-muted-foreground/40">
                                                                {action.integrationName}
                                                                {action.group ? ` · ${action.group}` : ""}
                                                                {" · "}
                                                                {Object.keys(action.payloadSchema).length} fields
                                                            </span>
                                                        </span>
                                                        <span
                                                            aria-hidden="true"
                                                            className={cn(
                                                                "flex size-5 shrink-0 items-center justify-center rounded-full border transition-all duration-150",
                                                                selected
                                                                    ? "border-violet-500 bg-violet-500 text-white shadow-sm shadow-violet-500/30"
                                                                    : "border-muted-foreground/25 text-transparent group-hover:border-violet-500/50 group-hover:bg-violet-500/5",
                                                            )}
                                                        >
                                                            <Check
                                                                className={cn(
                                                                    "size-3.5 transition-transform duration-150",
                                                                    selected ? "scale-100" : "scale-50",
                                                                )}
                                                                strokeWidth={3}
                                                            />
                                                        </span>
                                                    </button>
                                                );
                                            })}
                                    </div>
                                );
                            })
                        )}
                    </div>

                    <aside
                        className={cn(
                            "min-h-0 shrink-0 overflow-y-auto border-t p-4 sm:p-5 lg:max-h-none lg:border-t-0",
                            focusedAction ? "max-h-[45%]" : "hidden lg:block",
                        )}
                    >
                        {focusedAction ? (
                            <ActionPreview
                                action={focusedAction}
                                usedBy={usedBy}
                                mode={mode}
                                selected={focusedAction.id === value}
                                onConfirm={confirm}
                                onCancel={() => onOpenChange(false)}
                            />
                        ) : (
                            <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
                                <ImageOff className="size-5 text-muted-foreground/40" />
                                <p className="text-sm text-muted-foreground">Select an action to preview it.</p>
                            </div>
                        )}
                    </aside>
                </div>

                <div className="flex shrink-0 items-center gap-2 border-t bg-background/95 px-4 py-3 lg:hidden">
                    <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{focusedAction?.label ?? "Choose an action"}</p>
                        <p className="truncate font-mono text-[11px] text-muted-foreground/60">
                            {focusedAction
                                ? `${focusedAction.integrationName} · ${Object.keys(focusedAction.payloadSchema).length} fields`
                                : "Tap an action to preview it"}
                        </p>
                    </div>
                    <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="shrink-0"
                        onClick={() => onOpenChange(false)}
                    >
                        Cancel
                    </Button>
                    <Button type="button" size="sm" className="shrink-0" disabled={!focusedAction} onClick={confirm}>
                        {mode === "add" ? "Add action" : "Use action"}
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    );
}

function ActionPreview({
    action,
    usedBy,
    mode,
    selected,
    onConfirm,
    onCancel,
}: {
    action: ActionCatalogEntry;
    usedBy: number;
    mode: "add" | "change";
    selected: boolean;
    onConfirm: () => void;
    onCancel: () => void;
}) {
    const fields = Object.entries(action.payloadSchema);
    const Icon = actionIcon(action.id);
    const meta = sourceMeta(action.integrationId);

    return (
        <div className="flex h-full flex-col">
            <div className="flex items-center gap-3">
                <span
                    className={cn(
                        "flex size-12 shrink-0 items-center justify-center rounded-xl border",
                        meta.tileClass,
                    )}
                >
                    <Icon className={cn("size-6", meta.iconClass)} />
                </span>
                <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-1.5">
                        <ActionSourceBadge action={action} />
                        {action.group && (
                            <Badge variant="outline" className="px-2 py-0 font-mono text-[11px]">
                                {action.group}
                            </Badge>
                        )}
                        {action.reversible && (
                            <Badge
                                variant="outline"
                                className="border-emerald-500/30 px-2 py-0 font-mono text-[11px] text-emerald-700 dark:text-emerald-300"
                            >
                                REVERSIBLE
                            </Badge>
                        )}
                    </div>
                    <h3 className="mt-1 text-xl leading-tight font-semibold">{action.label}</h3>
                </div>
            </div>

            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                {action.description || "No description available."}
            </p>

            <p className="mt-4 font-mono text-[11px] uppercase tracking-widest text-muted-foreground/50">
                Payload fields
            </p>
            {fields.length > 0 ? (
                <div className="mt-2 grid grid-cols-2 gap-2">
                    {fields.map(([field, description], index) => {
                        const isLastOdd = index === fields.length - 1 && fields.length % 2 === 1;
                        return (
                            <div
                                key={field}
                                className={cn("rounded-lg border bg-muted/25 px-3 py-2", isLastOdd && "col-span-2")}
                            >
                                <p className="truncate font-mono text-[11px] uppercase tracking-wide text-muted-foreground/50">
                                    {field}
                                </p>
                                <p className="mt-0.5 text-xs leading-snug text-muted-foreground">{description}</p>
                            </div>
                        );
                    })}
                </div>
            ) : (
                <p className="mt-1 text-xs text-muted-foreground/60">This action has no payload fields.</p>
            )}

            <div className="mt-4 flex items-center gap-2 rounded-lg border bg-muted/25 px-3 py-2.5">
                <span className="flex size-8 items-center justify-center rounded-md bg-violet-500/10 text-violet-700 dark:text-violet-300">
                    <TimerIcon />
                </span>
                <div className="min-w-0">
                    <p className="text-xs font-medium">Runs in the action queue</p>
                    <p className="font-mono text-[11px] text-muted-foreground/60">
                        Duration and cumulative are configured on the action card.
                    </p>
                </div>
            </div>

            <div className="mt-3 flex items-center justify-between font-mono text-[11px] text-muted-foreground/50">
                <span>
                    Used by {usedBy} rule{usedBy === 1 ? "" : "s"}
                </span>
                {selected && <span className="text-violet-600 dark:text-violet-300">Current action</span>}
            </div>

            <div className="mt-auto hidden items-center justify-end gap-2 pt-4 lg:flex">
                <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
                    Cancel
                </Button>
                <Button type="button" size="sm" onClick={onConfirm}>
                    <Plus className="size-3.5" />
                    {mode === "add" ? "Add action" : "Use this action"}
                </Button>
            </div>
        </div>
    );
}

function TimerIcon() {
    const Icon = actionIcon(ActionType.CHASTER_TIME_UPDATE);
    return <Icon className="size-3.5" />;
}
