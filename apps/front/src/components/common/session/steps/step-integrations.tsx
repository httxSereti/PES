"use client"

import {
    ArrowUpRight,
    Blocks,
    ChevronDown,
    ChevronRight,
    Cpu,
    Info,
    Lock,
    Shield,
    type LucideIcon,
} from "lucide-react"

import { Switch } from "@pes/ui/components/switch"
import { cn } from "@pes/ui/lib/utils"

import type { IntegrationCatalogEntry } from "@/types"

const INTEGRATION_ICONS: Record<string, LucideIcon> = {
    chaster: Lock,
    puryfi: Shield,
}

function iconFor(id: string): LucideIcon {
    return INTEGRATION_ICONS[id] ?? Blocks
}

function plural(count: number, word: string) {
    return `${count} ${word}${count === 1 ? "" : "s"}`
}

interface EventGroup {
    name: string
    total: number
    enabled: number
}

function groupEvents(events: IntegrationCatalogEntry["events"]): EventGroup[] {
    const groups = new Map<string, EventGroup>()
    for (const event of events) {
        const name = event.group.trim() || "General"
        const group = groups.get(name) ?? { name, total: 0, enabled: 0 }
        group.total += 1
        if (event.enabled) group.enabled += 1
        groups.set(name, group)
    }
    return Array.from(groups.values())
}

interface StepIntegrationsProps {
    integrations: IntegrationCatalogEntry[]
    selectedIds: string[]
    focusedId: string | null
    unitCount: number
    sensorCount: number
    onToggle: (integrationId: string) => void
    onFocus: (integrationId: string) => void
    onEditModules: () => void
    onOpenSettings: () => void
}

export function StepIntegrations({
    integrations,
    selectedIds,
    focusedId,
    unitCount,
    sensorCount,
    onToggle,
    onFocus,
    onEditModules,
    onOpenSettings,
}: StepIntegrationsProps) {
    const focused =
        integrations.find((entry) => entry.id === focusedId) ?? integrations[0]
    const activeSelected = integrations.filter(
        (entry) => selectedIds.includes(entry.id) && entry.enabled
    )
    const activeEventCount = activeSelected.reduce(
        (total, entry) =>
            total + entry.events.filter((event) => event.enabled).length,
        0
    )
    const groups = focused ? groupEvents(focused.events) : []
    const enabledEvents = focused
        ? focused.events.filter((event) => event.enabled).length
        : 0

    return (
        <div className="flex min-w-0 flex-col gap-3">
            <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                    <span className="font-mono-dm text-[9px] uppercase tracking-[0.16em] text-muted-foreground/60">
                        Event sources
                    </span>
                    <span className="rounded-full border border-violet-500/30 bg-violet-500/10 px-2 py-0.5 font-mono-dm text-[8px] uppercase tracking-[0.12em] text-violet-600 dark:text-violet-300">
                        per session
                    </span>
                </div>
                <span className="font-mono-dm text-[9px] tabular-nums text-muted-foreground/60">
                    {activeSelected.length} of {integrations.length} active
                </span>
            </div>

            <div className="overflow-hidden rounded-xl border bg-card/50">
                <div className="flex items-center gap-2.5 border-b border-border/60 px-3 py-2.5">
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-border/70 bg-muted/20 text-muted-foreground">
                        <Cpu className="size-4" />
                    </span>
                    <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                        <span className="text-[13px] font-semibold">
                            Core hardware
                        </span>
                        <span className="truncate text-[10.5px] text-muted-foreground/70">
                            {plural(unitCount, "unit")} ·{" "}
                            {plural(sensorCount, "sensor")} · always attached
                        </span>
                    </div>
                    <span className="hidden rounded-full border border-border/70 px-2 py-0.5 font-mono-dm text-[7.5px] uppercase tracking-wide text-muted-foreground/70 sm:inline">
                        Always on
                    </span>
                    <button
                        type="button"
                        onClick={onEditModules}
                        className="flex items-center gap-1 rounded-md px-1.5 py-1 text-[10px] text-violet-600 transition-colors hover:bg-violet-500/10 dark:text-violet-400"
                    >
                        Edit
                        <ArrowUpRight className="size-3" />
                    </button>
                </div>

                {integrations.length === 0 ? (
                    <p className="px-4 py-5 text-xs text-muted-foreground/70">
                        No external integrations are registered. The session
                        will run with core hardware only.
                    </p>
                ) : (
                    <div className="divide-y divide-border/60">
                        {integrations.map((entry) => {
                            const Icon = iconFor(entry.id)
                            const isSelected = selectedIds.includes(entry.id)
                            const isFocused = focused?.id === entry.id
                            const eventCount = entry.events.filter(
                                (event) => event.enabled
                            ).length

                            return (
                                <div
                                    key={entry.id}
                                    className={cn(
                                        "relative flex items-center gap-2.5 px-3 py-2.5 transition-colors",
                                        isFocused && "bg-violet-500/[0.06]"
                                    )}
                                >
                                    {isFocused && (
                                        <span className="absolute inset-y-2 left-0 w-0.5 rounded-full bg-violet-500" />
                                    )}
                                    <button
                                        type="button"
                                        onClick={() => onFocus(entry.id)}
                                        aria-expanded={isFocused}
                                        className="flex min-w-0 flex-1 items-center gap-2.5 text-left"
                                    >
                                        <span
                                            className={cn(
                                                "flex size-9 shrink-0 items-center justify-center rounded-lg border",
                                                isFocused
                                                    ? "border-violet-500/35 bg-violet-500/10 text-violet-500 dark:text-violet-400"
                                                    : "border-border/70 bg-muted/30 text-muted-foreground"
                                            )}
                                        >
                                            <Icon className="size-4" />
                                        </span>
                                        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                                            <span className="flex items-center gap-2">
                                                <span className="truncate text-[13px] font-semibold">
                                                    {entry.name}
                                                </span>
                                                {!entry.enabled && (
                                                    <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-1.5 py-px font-mono-dm text-[7.5px] uppercase tracking-wide text-amber-600 dark:text-amber-400">
                                                        Disabled globally
                                                    </span>
                                                )}
                                            </span>
                                            <span
                                                className={cn(
                                                    "truncate text-[10.5px]",
                                                    isSelected && entry.enabled
                                                        ? "text-emerald-600 dark:text-emerald-400"
                                                        : !entry.enabled
                                                          ? "text-amber-600/80 dark:text-amber-400/80"
                                                          : "text-muted-foreground/70"
                                                )}
                                            >
                                                {entry.enabled
                                                    ? isSelected
                                                        ? `In session · ${plural(eventCount, "event")} · ${plural(entry.actions.length, "action")}`
                                                        : `Enabled globally · ${plural(eventCount, "event")} · ${plural(entry.actions.length, "action")}`
                                                    : "Enable it in Admin → Integrations to use it"}
                                            </span>
                                        </span>
                                    </button>

                                    <Switch
                                        checked={isSelected && entry.enabled}
                                        disabled={!entry.enabled}
                                        onCheckedChange={() => onToggle(entry.id)}
                                        aria-label={`Include ${entry.name} in this session`}
                                    />
                                    <button
                                        type="button"
                                        onClick={() => onFocus(entry.id)}
                                        aria-label={`Show event coverage for ${entry.name}`}
                                        className="flex size-6 items-center justify-center rounded-md text-muted-foreground/60 transition-colors hover:bg-muted/60 hover:text-foreground"
                                    >
                                        {isFocused ? (
                                            <ChevronDown className="size-3.5" />
                                        ) : (
                                            <ChevronRight className="size-3.5" />
                                        )}
                                    </button>
                                </div>
                            )
                        })}
                    </div>
                )}

            </div>

            {focused && focused.events.length > 0 && (
                <div className="flex flex-col gap-2.5 rounded-xl border bg-card/40 px-3 py-2.5">
                    <div className="flex items-center justify-between gap-3">
                        <div className="flex min-w-0 items-center gap-2">
                            <span className="min-w-0 truncate font-mono-dm text-[9px] uppercase tracking-[0.14em] text-muted-foreground/70">
                                {focused.name} · event coverage
                            </span>
                            <span className="shrink-0 font-mono-dm text-[8px] tabular-nums text-muted-foreground/50">
                                {enabledEvents}/{focused.events.length} on
                            </span>
                        </div>
                        <button
                            type="button"
                            onClick={onOpenSettings}
                            className="flex shrink-0 items-center gap-1 text-[9.5px] text-violet-600 transition-colors hover:text-violet-500 dark:text-violet-400"
                        >
                            Open settings
                            <ArrowUpRight className="size-3" />
                        </button>
                    </div>

                    <div className="grid gap-x-4 gap-y-1 sm:grid-cols-2">
                        {groups.slice(0, 6).map((group) => (
                            <div
                                key={group.name}
                                className="flex items-center gap-2 py-0.5"
                            >
                                <span
                                    className={cn(
                                        "size-1.5 rounded-full",
                                        group.enabled === 0
                                            ? "bg-muted-foreground/30"
                                            : "bg-emerald-500"
                                    )}
                                />
                                <span className="min-w-0 flex-1 truncate text-[10px] text-muted-foreground">
                                    {group.name}
                                </span>
                                <span className="font-mono-dm text-[8.5px] tabular-nums text-muted-foreground/50">
                                    {group.enabled}/{group.total}
                                </span>
                            </div>
                        ))}
                        {groups.length > 6 && (
                            <span className="font-mono-dm text-[8.5px] text-muted-foreground/50">
                                +{groups.length - 6} more groups
                            </span>
                        )}
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border/50 pt-2">
                        <span className="text-[9.5px] text-muted-foreground/60">
                            The session switch includes all events from this
                            service. Global event toggles still apply.
                        </span>
                        <span className="font-mono-dm text-[8.5px] text-muted-foreground/50">
                            {plural(focused.actions.length, "action")} available
                        </span>
                    </div>
                </div>
            )}

            <p className="flex items-start gap-1.5 text-[9.5px] leading-relaxed text-muted-foreground/60">
                <Info className="mt-px size-3 shrink-0 text-violet-500" />
                Integration choices apply to this session only. Global settings
                and credentials stay untouched.
            </p>

            <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-muted/20 px-3 py-2">
                <span className="font-mono-dm text-[8px] uppercase tracking-[0.14em] text-muted-foreground/50">
                    On start
                </span>
                {[
                    plural(unitCount, "unit"),
                    plural(sensorCount, "sensor"),
                    plural(activeSelected.length, "service"),
                    plural(activeEventCount, "event"),
                ].map((label) => (
                    <span
                        key={label}
                        className="rounded border border-border/60 bg-background/60 px-1.5 py-0.5 font-mono-dm text-[8px] tabular-nums text-muted-foreground"
                    >
                        {label}
                    </span>
                ))}
            </div>
        </div>
    )
}
