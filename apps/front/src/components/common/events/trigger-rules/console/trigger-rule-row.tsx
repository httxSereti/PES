import { Fragment } from "react";
import { Link } from "react-router";
import {
    ChevronDown,
    Copy,
    History,
    MoreVertical,
    Pencil,
    Trash2,
} from "lucide-react";

import { Button } from "@pes/ui/components/button";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@pes/ui/components/dropdown-menu";
import { Switch } from "@pes/ui/components/switch";
import { cn } from "@pes/ui/lib/utils";

import { EventTypeBadge } from "@/components/common/events/event-badges";
import { formatDateTime, formatRelativeTime } from "@/lib/format-date";
import type { RuleFiringStats } from "@/lib/trigger-rules/rule-stats";
import { eventTypesOf } from "@/lib/trigger-rules/rule-utils";
import type { TriggerRule, TriggerRuleLabel } from "@/types";

import { RuleActionChainCompact, RuleActionChainDetailed } from "./rule-action-chain";

export interface RuleInteractionProps {
    rule: TriggerRule;
    stats?: RuleFiringStats;
    expanded: boolean;
    onToggleExpanded: () => void;
    onToggleEnabled: () => void;
    onDuplicate: () => void;
    onDelete: () => void;
}

function RuleLabelChips({ labels }: { labels: TriggerRuleLabel[] }) {
    if (labels.length === 0) return null;

    return (
        <span className="mt-1 flex flex-wrap gap-1">
            {labels.map((label) => (
                <span
                    key={label.id}
                    className="rounded border border-violet-500/25 bg-violet-500/10 px-1.5 py-px font-mono text-[9px] text-violet-700 dark:text-violet-300"
                >
                    {label.name}
                </span>
            ))}
        </span>
    );
}

function EventChips({ types, limit }: { types: string[]; limit?: number }) {
    if (types.length === 0) {
        return <span className="text-[10px] text-muted-foreground/40 italic">No events</span>;
    }

    const shown = typeof limit === "number" ? types.slice(0, limit) : types;
    const hidden = types.length - shown.length;

    return (
        <div className="flex flex-wrap gap-1">
            {shown.map((type) => (
                <EventTypeBadge key={type} type={type} className="max-w-[190px]" />
            ))}
            {hidden > 0 && (
                <span className="inline-flex items-center rounded-md border border-border/70 bg-muted/40 px-1.5 py-0.5 font-mono text-[9px] text-muted-foreground/60">
                    +{hidden}
                </span>
            )}
        </div>
    );
}

function LastFiredCell({ stats }: { stats?: RuleFiringStats }) {
    if (!stats?.lastFired) {
        return <span className="text-[10px] text-amber-600/80 dark:text-amber-400/80">Never</span>;
    }

    return (
        <span className="flex flex-col items-start gap-0.5">
            <span className="text-[11px] leading-4 text-muted-foreground" title={formatDateTime(stats.lastFired)}>
                {formatRelativeTime(stats.lastFired)}
            </span>
            <span
                className="rounded border border-purple-500/25 bg-purple-500/10 px-1 py-px font-mono text-[8px] leading-3 text-purple-700 dark:text-purple-300"
                title={`${stats.count} firing${stats.count === 1 ? "" : "s"} in the event buffer`}
            >
                ×{stats.count}
            </span>
        </span>
    );
}

function RuleMenu({
    rule,
    onDuplicate,
    onDelete,
}: {
    rule: TriggerRule;
    onDuplicate: () => void;
    onDelete: () => void;
}) {
    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <Button
                    variant="ghost"
                    size="icon-sm"
                    className="h-7 w-7 text-muted-foreground/60"
                    aria-label={`Actions for ${rule.name}`}
                    onClick={(event) => event.stopPropagation()}
                >
                    <MoreVertical className="h-4 w-4" />
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
                align="end"
                className="w-44"
                onClick={(event) => event.stopPropagation()}
            >
                <DropdownMenuLabel className="font-mono text-[9px] uppercase tracking-widest text-muted-foreground/50">
                    Rule
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                    <Link to={`/app/events/trigger-rules/${rule.id}/edit`}>
                        <Pencil className="mr-2 h-3.5 w-3.5" />
                        Edit
                    </Link>
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={onDuplicate}>
                    <Copy className="mr-2 h-3.5 w-3.5" />
                    Duplicate
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                    className="text-red-600 focus:text-red-600 dark:text-red-400 dark:focus:text-red-400"
                    onSelect={onDelete}
                >
                    <Trash2 className="mr-2 h-3.5 w-3.5" />
                    Delete
                </DropdownMenuItem>
            </DropdownMenuContent>
        </DropdownMenu>
    );
}

function DetailMeta({ rule, stats }: { rule: TriggerRule; stats?: RuleFiringStats }) {
    const steps = rule.actions.length;
    const firing =
        stats?.lastFired && stats.count > 0
            ? `${stats.count} firing${stats.count === 1 ? "" : "s"} · last ${formatRelativeTime(stats.lastFired)}`
            : "never fired";

    return (
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="font-mono text-[9px] uppercase tracking-widest text-muted-foreground/50">
                Action chain
            </span>
            <span className="font-mono text-[9px] text-muted-foreground/35">
                {steps} step{steps === 1 ? "" : "s"} · {firing}
            </span>
        </div>
    );
}

function RuleDetail({
    rule,
    stats,
    onDuplicate,
}: {
    rule: TriggerRule;
    stats?: RuleFiringStats;
    onDuplicate: () => void;
}) {
    const types = eventTypesOf(rule);
    const detailButton = "gap-1.5 text-xs shadow-none";

    return (
        <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
                <DetailMeta rule={rule} stats={stats} />
                <div className="flex flex-wrap items-center gap-1">
                    <Button asChild variant="outline" size="sm" className={detailButton}>
                        <Link to={`/app/events/trigger-rules/${rule.id}/edit`}>
                            <Pencil />
                            Edit rule
                        </Link>
                    </Button>
                    <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className={detailButton}
                        onClick={onDuplicate}
                    >
                        <Copy />
                        Duplicate
                    </Button>
                    <Button
                        asChild
                        variant="outline"
                        size="sm"
                        className={`${detailButton} border-violet-500/30 bg-violet-500/10 text-violet-700 hover:bg-violet-500/15 hover:text-violet-800 dark:text-violet-300 dark:hover:text-violet-200`}
                    >
                        <Link to={`/app/events/trigger-rules/triggered?rule=${encodeURIComponent(rule.id)}`}>
                            <History />
                            Rule history
                        </Link>
                    </Button>
                </div>
            </div>

            <RuleActionChainDetailed actions={rule.actions} />

            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-border/50 pt-2.5">
                <div className="flex min-w-0 flex-wrap items-center gap-1">
                    <span className="mr-1 font-mono text-[8px] uppercase tracking-widest text-muted-foreground/40">
                        When
                    </span>
                    <EventChips types={types} />
                </div>
                {rule.labels.length > 0 && (
                    <div className="flex flex-wrap items-center gap-1">
                        <span className="mr-1 font-mono text-[8px] uppercase tracking-widest text-muted-foreground/40">
                            Labels
                        </span>
                        <RuleLabelChips labels={rule.labels} />
                    </div>
                )}
                <span className="ml-auto font-mono text-[9px] text-muted-foreground/35">
                    Stats from the last 1000 events
                </span>
            </div>
        </div>
    );
}

export function RuleRow({
    rule,
    stats,
    expanded,
    onToggleExpanded,
    onToggleEnabled,
    onDuplicate,
    onDelete,
}: RuleInteractionProps) {
    const types = eventTypesOf(rule);
    const detailId = `rule-detail-${rule.id}`;

    return (
        <Fragment>
            <tr
                onClick={onToggleExpanded}
                className={cn(
                    "cursor-pointer border-b border-border/60 transition-colors hover:bg-muted/30",
                    expanded && "bg-muted/25",
                    !rule.enabled && "opacity-60",
                )}
            >
                <td className="py-2.5 pr-2 pl-4 align-top">
                    <Switch
                        checked={rule.enabled}
                        onCheckedChange={onToggleEnabled}
                        onClick={(event) => event.stopPropagation()}
                        aria-label={`${rule.enabled ? "Disable" : "Enable"} ${rule.name}`}
                    />
                </td>

                <td className="py-2.5 pr-3 align-top">
                    <button
                        type="button"
                        aria-expanded={expanded}
                        aria-controls={detailId}
                        onClick={(event) => {
                            event.stopPropagation();
                            onToggleExpanded();
                        }}
                        className="flex w-full items-start gap-2 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500/40"
                    >
                        <span className="min-w-0 flex-1">
                            <span className="block truncate text-[12.5px] font-semibold text-foreground">
                                {rule.name}
                            </span>
                            {rule.description && (
                                <span className="mt-0.5 block truncate text-[10.5px] text-muted-foreground/60">
                                    {rule.description}
                                </span>
                            )}
                            <RuleLabelChips labels={rule.labels} />
                        </span>
                        <ChevronDown
                            className={cn(
                                "mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground/40 transition-transform",
                                expanded && "rotate-180",
                            )}
                        />
                    </button>
                </td>

                <td className="py-2.5 pr-3 align-top">
                    <EventChips types={types} limit={2} />
                </td>

                <td className="py-2.5 pr-3 align-top">
                    <RuleActionChainCompact actions={rule.actions} />
                </td>

                <td className="py-2.5 pr-2 pl-2 align-top font-mono text-[10px] text-muted-foreground/60">
                    p{rule.priority}
                </td>

                <td className="py-2.5 pr-2 pl-2 align-top">
                    <LastFiredCell stats={stats} />
                </td>

                <td className="py-2.5 pr-4 text-right align-top">
                    <RuleMenu rule={rule} onDuplicate={onDuplicate} onDelete={onDelete} />
                </td>
            </tr>

            {expanded && (
                <tr id={detailId} className="border-b border-border/60 bg-muted/15">
                    <td colSpan={7} className="px-4 py-4 lg:pl-16">
                        <RuleDetail rule={rule} stats={stats} onDuplicate={onDuplicate} />
                    </td>
                </tr>
            )}
        </Fragment>
    );
}

export function RuleCard({
    rule,
    stats,
    expanded,
    onToggleExpanded,
    onToggleEnabled,
    onDuplicate,
    onDelete,
}: RuleInteractionProps) {
    const types = eventTypesOf(rule);
    const detailId = `rule-card-detail-${rule.id}`;

    return (
        <div
            className={cn(
                "rounded-xl border border-border bg-card/40 p-3 transition-colors",
                expanded && "bg-muted/15",
                !rule.enabled && "opacity-60",
            )}
        >
            <div className="flex items-start gap-2">
                <button
                    type="button"
                    aria-expanded={expanded}
                    aria-controls={detailId}
                    onClick={onToggleExpanded}
                    className="min-w-0 flex-1 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500/40"
                >
                    <span className="flex items-center gap-2">
                        <span className="truncate text-[13px] font-semibold text-foreground">{rule.name}</span>
                        <span className="shrink-0 font-mono text-[9px] text-muted-foreground/50">
                            p{rule.priority}
                        </span>
                    </span>
                    {rule.description && (
                        <span className="mt-0.5 block truncate text-[10.5px] text-muted-foreground/60">
                            {rule.description}
                        </span>
                    )}
                </button>
                <Switch
                    checked={rule.enabled}
                    onCheckedChange={onToggleEnabled}
                    aria-label={`${rule.enabled ? "Disable" : "Enable"} ${rule.name}`}
                />
                <RuleMenu rule={rule} onDuplicate={onDuplicate} onDelete={onDelete} />
            </div>

            <div className="mt-2 space-y-1.5">
                <EventChips types={types} limit={3} />
                <RuleLabelChips labels={rule.labels} />
            </div>

            <div className="mt-2 rounded-lg border border-border/50 bg-background/40 px-2 py-1.5">
                <RuleActionChainCompact actions={rule.actions} />
            </div>

            <button
                type="button"
                aria-expanded={expanded}
                aria-controls={detailId}
                onClick={onToggleExpanded}
                className="mt-2 flex w-full items-center gap-2 border-t border-border/50 pt-2 text-left font-mono text-[9px] text-muted-foreground/60"
            >
                {stats?.lastFired ? (
                    <>
                        <span className="text-muted-foreground">{formatRelativeTime(stats.lastFired)}</span>
                        <span className="rounded border border-purple-500/25 bg-purple-500/10 px-1 text-purple-700 dark:text-purple-300">
                            ×{stats.count}
                        </span>
                    </>
                ) : (
                    <span className="text-amber-600/80 dark:text-amber-400/80">Never fired</span>
                )}
                <span className="ml-auto flex items-center gap-1">
                    Details
                    <ChevronDown
                        className={cn("h-3 w-3 transition-transform", expanded && "rotate-180")}
                    />
                </span>
            </button>

            {expanded && (
                <div id={detailId} className="mt-3 border-t border-border/50 pt-3">
                    <RuleDetail rule={rule} stats={stats} onDuplicate={onDuplicate} />
                </div>
            )}
        </div>
    );
}
