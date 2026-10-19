import { useCallback, useEffect, useMemo, useState } from "react";
import {
    Blocks,
    Check,
    Copy,
    Cpu,
    Info,
    Lock,
    Radio,
    RefreshCw,
    Save,
    Settings,
    Shield,
    Sparkles,
    Zap,
    type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";
import type { Route } from ".react-router/types/src/pages/app/admin/+types/integrations";

import { Badge } from "@pes/ui/components/badge";
import { Button } from "@pes/ui/components/button";
import { Input } from "@pes/ui/components/input";
import { Separator } from "@pes/ui/components/separator";
import {
    Sheet,
    SheetContent,
    SheetDescription,
    SheetHeader,
    SheetTitle,
} from "@pes/ui/components/sheet";
import { Skeleton } from "@pes/ui/components/skeleton";
import { Switch } from "@pes/ui/components/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@pes/ui/components/tabs";

import { useWebSocket } from "@/hooks/useWebSocket";
import { useAppSelector } from "@/store/hooks";
import { integrationsSelectors } from "@/store/slices/integrationsSlice";
import type {
    IntegrationDetail,
    IntegrationSetting,
    IntegrationValues,
} from "@/types/integrations.types";

const API_URL = import.meta.env.VITE_API_URL;

// eslint-disable-next-line no-empty-pattern
export function meta({ }: Route.MetaArgs) {
    return [
        { title: "PES | Admin - Integrations" },
        { name: "description", content: "Manage integrations, their events, actions and settings" },
    ];
}

function plural(count: number, word: string) {
    return `${count} ${word}${count === 1 ? "" : "s"}`;
}

const INTEGRATION_ICONS: Record<string, LucideIcon> = {
    units: Cpu,
    sensors: Radio,
    chaster: Lock,
    puryfi: Shield,
};

function iconFor(id: string): LucideIcon {
    return INTEGRATION_ICONS[id] ?? Blocks;
}

// A group is a row of tiles. Core hardware is always on; services can be
// enabled/disabled. Groups render in this fixed order.
const GROUPS = [
    { id: "core", label: "Core", hint: "Built-in hardware — always on" },
    { id: "services", label: "Services", hint: "External services — enable or disable anytime" },
] as const;

function groupFor(entry: IntegrationDetail): string {
    return entry.kind === "core" ? "core" : "services";
}

function StatChip({
    icon: Icon,
    label,
    onClick,
}: {
    icon: LucideIcon;
    label: string;
    onClick: () => void;
}) {
    return (
        <button
            type="button"
            onClick={onClick}
            className="inline-flex cursor-pointer items-center gap-1.5 rounded-full border bg-muted/40 px-2.5 py-[3px] text-[10px] text-muted-foreground transition-colors hover:border-foreground/25 hover:text-foreground"
        >
            <Icon className="size-3" />
            {label}
        </button>
    );
}

type PanelTab = "events" | "actions" | "settings";

type GroupedItems<T> = { key: string; items: T[] };

/**
 * Section catalog entries by their declared subgroup, keeping the
 * integration's declaration order; ungrouped entries come last.
 */
function groupBySubgroup<T extends { group?: string }>(items: T[]): GroupedItems<T>[] {
    const groups: GroupedItems<T>[] = [];
    for (const item of items) {
        const key = (item.group ?? "").trim();
        const existing = groups.find(group => group.key === key);
        if (existing) existing.items.push(item);
        else groups.push({ key, items: [item] });
    }
    return [...groups.filter(group => group.key), ...groups.filter(group => !group.key)];
}

function CatalogList<
    T extends {
        id: string;
        label: string;
        description: string;
        group?: string;
        enabled: boolean;
    },
>({
    items,
    emptyText,
    integrationId,
    section,
    onSaved,
}: {
    items: T[];
    emptyText: string;
    integrationId: string;
    section: "events" | "actions";
    onSaved: () => void;
}) {
    const { sendCommand } = useWebSocket();
    const [saving, setSaving] = useState<string | null>(null);

    const toggle = async (item: T, enabled: boolean) => {
        setSaving(item.id);
        try {
            const result = await sendCommand(
                "integrations:update",
                section === "events"
                    ? { integration_id: integrationId, events: { [item.id]: enabled } }
                    : { integration_id: integrationId, actions: { [item.id]: enabled } }
            );
            if (result.status !== "ok") {
                toast.error(result.message ?? "Failed to update");
                return;
            }
            onSaved();
        } finally {
            setSaving(null);
        }
    };

    if (items.length === 0) {
        return <p className="text-xs italic text-muted-foreground/50">{emptyText}</p>;
    }

    return (
        <div className="space-y-4">
            {groupBySubgroup(items).map(group => (
                <div key={group.key || "_ungrouped"} className="space-y-2.5">
                    {group.key && (
                        <div className="flex items-center gap-2">
                            <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/50">
                                {group.key}
                            </span>
                            <span className="text-[10px] tabular-nums text-muted-foreground/40">
                                {group.items.length}
                            </span>
                        </div>
                    )}
                    {group.items.map(item => (
                        <div key={item.id} className="flex items-center gap-3">
                            <div
                                className={`flex min-w-0 flex-1 flex-col gap-0.5 ${
                                    item.enabled ? "" : "opacity-50"
                                }`}
                            >
                                <code className="font-mono text-[11px] text-violet-600 dark:text-violet-300">
                                    {item.id}
                                </code>
                                <span className="text-[11px] text-muted-foreground/70">
                                    {item.description || item.label}
                                </span>
                            </div>
                            <Switch
                                className="shrink-0"
                                checked={item.enabled}
                                disabled={saving === item.id}
                                onCheckedChange={enabled => void toggle(item, enabled)}
                            />
                        </div>
                    ))}
                </div>
            ))}
        </div>
    );
}

function IntegrationTile({
    entry,
    onOpen,
    onSaved,
}: {
    entry: IntegrationDetail;
    onOpen: (tab: PanelTab) => void;
    onSaved: () => void;
}) {
    const { sendCommand } = useWebSocket();
    const Icon = iconFor(entry.id);
    const [saving, setSaving] = useState(false);

    const toggleEnabled = async (enabled: boolean) => {
        setSaving(true);
        try {
            const result = await sendCommand("integrations:update", {
                integration_id: entry.id,
                enabled,
            });
            if (result.status !== "ok") {
                toast.error(result.message ?? "Failed to update integration");
                return;
            }
            onSaved();
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="flex flex-col gap-3 rounded-xl border bg-card p-4">
            <div className="flex items-center gap-2.5">
                <div className="flex size-9 shrink-0 items-center justify-center rounded-[10px] border border-violet-500/25 bg-violet-500/10">
                    <Icon className="size-[18px] text-violet-500 dark:text-violet-400" />
                </div>
                <div className="flex min-w-0 flex-1 items-center gap-2">
                    <span className="truncate text-sm font-semibold">{entry.name}</span>
                    <Badge
                        variant="outline"
                        className={
                            entry.kind === "core"
                                ? "border-violet-500/30 bg-violet-500/10 text-[9px] font-semibold tracking-wide text-violet-600 dark:text-violet-300"
                                : "text-[9px] font-semibold tracking-wide text-muted-foreground"
                        }
                    >
                        {entry.kind === "core" ? "CORE" : "INTEGRATION"}
                    </Badge>
                </div>
                {entry.kind === "core" ? (
                    <span className="shrink-0 text-[11px] text-muted-foreground/50">Always on</span>
                ) : (
                    <div className="flex shrink-0 items-center gap-2">
                        <span className="text-[11px] text-muted-foreground">
                            {entry.enabled ? "Enabled" : "Disabled"}
                        </span>
                        <Switch
                            checked={entry.enabled}
                            disabled={saving}
                            onCheckedChange={toggleEnabled}
                        />
                    </div>
                )}
            </div>

            <p className="line-clamp-2 min-h-8 text-[11px] leading-relaxed text-muted-foreground">
                {entry.description}
            </p>

            <Separator />

            <div className="flex items-center gap-2">
                {entry.events.length > 0 && (
                    <StatChip
                        icon={Zap}
                        label={plural(entry.events.length, "event")}
                        onClick={() => onOpen("events")}
                    />
                )}
                {entry.actions.length > 0 && (
                    <StatChip
                        icon={Sparkles}
                        label={plural(entry.actions.length, "action")}
                        onClick={() => onOpen("actions")}
                    />
                )}
                <div className="flex-1" />
                <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    className="h-7 px-2.5 text-[11px]"
                    onClick={() => onOpen("settings")}
                >
                    <Settings className="size-3" />
                    Settings
                </Button>
            </div>
        </div>
    );
}

function SettingRow({
    setting,
    value,
    onChange,
}: {
    setting: IntegrationSetting;
    value: unknown;
    onChange: (value: string) => void;
}) {
    // env-backed settings live in config.env and cannot be edited here;
    // JSON-backed secrets are editable (shown as password fields).
    const readOnly = setting.source === "env";

    return (
        <label className="flex flex-col gap-1.5">
            <div className="flex items-center gap-2">
                <span className="text-[11.5px] font-medium">{setting.label}</span>
                <div className="flex-1" />
                <span className="rounded-full border px-1.5 py-px font-mono text-[9px] text-muted-foreground/60">
                    {setting.source === "env" ? `config.env · ${setting.key}` : setting.key}
                </span>
            </div>
            <Input
                className="h-8 rounded-lg font-mono text-[11px]"
                type={setting.secret ? "password" : "text"}
                value={value == null ? "" : String(value)}
                readOnly={readOnly}
                disabled={readOnly}
                onChange={event => onChange(event.target.value)}
            />
        </label>
    );
}

function IntegrationPanel({
    entry,
    values,
    tab,
    onTabChange,
    onClose,
    onSaved,
}: {
    entry: IntegrationDetail;
    values: IntegrationValues;
    tab: PanelTab;
    onTabChange: (tab: PanelTab) => void;
    onClose: () => void;
    onSaved: () => void;
}) {
    const { sendCommand } = useWebSocket();
    const [draft, setDraft] = useState<IntegrationValues>(values);
    const [saving, setSaving] = useState(false);
    const [copied, setCopied] = useState(false);
    const Icon = iconFor(entry.id);

    useEffect(() => {
        setDraft(values);
    }, [values]);

    const copyEndpoint = async () => {
        if (!entry.endpoint) return;
        try {
            await navigator.clipboard.writeText(entry.endpoint);
            setCopied(true);
            window.setTimeout(() => setCopied(false), 2000);
        } catch {
            toast.error("Failed to copy to clipboard");
        }
    };

    const editable = useMemo(
        () => entry.settings.filter(setting => setting.source !== "env" && !setting.secret),
        [entry.settings]
    );
    const dirty = editable.some(
        setting => String(draft[setting.key] ?? "") !== String(values[setting.key] ?? "")
    );

    const toggleEnabled = async (enabled: boolean) => {
        const result = await sendCommand("integrations:update", {
            integration_id: entry.id,
            enabled,
        });
        if (result.status !== "ok") {
            toast.error(result.message ?? "Failed to update integration");
            return;
        }
        onSaved();
    };

    const saveSettings = async () => {
        if (!dirty) return;
        setSaving(true);
        try {
            const settings = Object.fromEntries(
                editable.map(setting => [setting.key, draft[setting.key]])
            );
            const result = await sendCommand("integrations:update", {
                integration_id: entry.id,
                settings,
            });
            if (result.status !== "ok") {
                toast.error(result.message ?? "Failed to save settings");
                return;
            }
            toast.success(`${entry.name} settings saved`);
            onSaved();
        } finally {
            setSaving(false);
        }
    };

    return (
        <Sheet open onOpenChange={open => !open && onClose()}>
            <SheetContent side="right" className="w-full gap-0 p-0 sm:max-w-[480px]">
                <SheetHeader className="gap-3.5 p-5 pb-4">
                    <div className="flex items-center gap-3">
                        <div className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-violet-500/25 bg-violet-500/10">
                            <Icon className="size-5 text-violet-500 dark:text-violet-400" />
                        </div>
                        <div className="flex min-w-0 flex-1 flex-col gap-1">
                            <SheetTitle className="text-base">{entry.name}</SheetTitle>
                            <Badge
                                variant="outline"
                                className="w-fit text-[9px] font-semibold tracking-wide text-muted-foreground"
                            >
                                {entry.kind === "core" ? "CORE" : "INTEGRATION"}
                            </Badge>
                        </div>
                    </div>
                    <SheetDescription className="text-[11.5px] leading-relaxed">
                        {entry.description}
                    </SheetDescription>
                    <div className="flex items-center gap-2">
                        <span className="text-xs font-medium">
                            {entry.kind === "core" ? "Always on" : entry.enabled ? "Enabled" : "Disabled"}
                        </span>
                        <span className="text-[10.5px] text-muted-foreground/60">
                            events feed the trigger rules
                        </span>
                        <div className="flex-1" />
                        {entry.kind !== "core" && (
                            <Switch checked={entry.enabled} onCheckedChange={toggleEnabled} />
                        )}
                    </div>
                    {entry.endpoint && (
                        <div className="flex items-center gap-2 rounded-lg border bg-muted/30 p-2.5">
                            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                                <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/50">
                                    Connection URL
                                </span>
                                <code className="truncate font-mono text-[11px] text-violet-600 dark:text-violet-300">
                                    {entry.endpoint}
                                </code>
                            </div>
                            <Button
                                type="button"
                                variant="secondary"
                                size="sm"
                                className="h-7 shrink-0 px-2.5 text-[11px]"
                                onClick={() => void copyEndpoint()}
                            >
                                {copied ? <Check className="size-3" /> : <Copy className="size-3" />}
                                {copied ? "Copied" : "Copy"}
                            </Button>
                        </div>
                    )}
                    {entry.endpoint && (
                        <p className="text-[10.5px] text-muted-foreground/50">
                            Register this URL as a WebSocket plugin in PuryFi&apos;s options page.
                        </p>
                    )}
                </SheetHeader>

                <Separator />

                <Tabs
                    value={tab}
                    onValueChange={value => onTabChange(value as PanelTab)}
                    className="flex min-h-0 flex-1 flex-col gap-0"
                >
                    <TabsList className="h-auto w-full justify-start gap-5 rounded-none bg-transparent p-0 px-5 pt-3 pb-0">
                        <TabsTrigger
                            value="events"
                            className="h-auto flex-none rounded-none border-b-2 border-transparent bg-transparent px-0 pb-2 text-xs font-medium text-muted-foreground shadow-none data-[state=active]:border-violet-500 data-[state=active]:bg-transparent data-[state=active]:text-foreground data-[state=active]:shadow-none dark:data-[state=active]:bg-transparent"
                        >
                            Events · {entry.events.length}
                        </TabsTrigger>
                        <TabsTrigger
                            value="actions"
                            className="h-auto flex-none rounded-none border-b-2 border-transparent bg-transparent px-0 pb-2 text-xs font-medium text-muted-foreground shadow-none data-[state=active]:border-violet-500 data-[state=active]:bg-transparent data-[state=active]:text-foreground data-[state=active]:shadow-none dark:data-[state=active]:bg-transparent"
                        >
                            Actions · {entry.actions.length}
                        </TabsTrigger>
                        <TabsTrigger
                            value="settings"
                            className="h-auto flex-none rounded-none border-b-2 border-transparent bg-transparent px-0 pb-2 text-xs font-medium text-muted-foreground shadow-none data-[state=active]:border-violet-500 data-[state=active]:bg-transparent data-[state=active]:text-foreground data-[state=active]:shadow-none dark:data-[state=active]:bg-transparent"
                        >
                            Settings
                        </TabsTrigger>
                    </TabsList>

                    <Separator />

                    <div className="min-h-0 flex-1 overflow-y-auto">
                        <TabsContent value="settings" className="m-0 space-y-4 p-5">
                            <div className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/50">
                                Settings
                            </div>
                            {entry.settings.length === 0 ? (
                                <p className="text-xs italic text-muted-foreground/50">
                                    This integration has no settings.
                                </p>
                            ) : (
                                entry.settings.map(setting => (
                                    <SettingRow
                                        key={setting.key}
                                        setting={setting}
                                        value={draft[setting.key]}
                                        onChange={value =>
                                            setDraft(current => ({ ...current, [setting.key]: value }))
                                        }
                                    />
                                ))
                            )}
                            {entry.settings.some(setting => setting.source === "env") && (
                                <div className="flex items-center gap-1.5 text-[10.5px] text-muted-foreground/50">
                                    <Info className="size-3" />
                                    Secrets come from config.env — edit the file to change them.
                                </div>
                            )}
                        </TabsContent>

                        <TabsContent value="events" className="m-0 p-5">
                            <CatalogList
                                items={entry.events}
                                emptyText="This integration provides no events."
                                integrationId={entry.id}
                                section="events"
                                onSaved={onSaved}
                            />
                        </TabsContent>

                        <TabsContent value="actions" className="m-0 p-5">
                            <CatalogList
                                items={entry.actions}
                                emptyText="This integration provides no actions."
                                integrationId={entry.id}
                                section="actions"
                                onSaved={onSaved}
                            />
                        </TabsContent>
                    </div>

                    <Separator />

                    <div className="flex items-center gap-3 p-5 py-3.5">
                        <span className="text-[10.5px] text-muted-foreground/50">
                            Changes apply immediately
                        </span>
                        <div className="flex-1" />
                        {editable.length > 0 && dirty && (
                            <Button
                                type="button"
                                size="sm"
                                className="h-7 text-[11px]"
                                disabled={saving}
                                onClick={saveSettings}
                            >
                                <Save className="size-3" />
                                Save
                            </Button>
                        )}
                        <Button
                            type="button"
                            variant="secondary"
                            size="sm"
                            className="h-7 text-[11px]"
                            onClick={onClose}
                        >
                            Done
                        </Button>
                    </div>
                </Tabs>
            </SheetContent>
        </Sheet>
    );
}

export default function IntegrationsPage() {
    const token = useAppSelector(state => state.auth.token);
    const catalog = useAppSelector(integrationsSelectors.selectAll);
    const [details, setDetails] = useState<IntegrationDetail[] | null>(null);
    const [selected, setSelected] = useState<{ id: string; tab: PanelTab } | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [refreshing, setRefreshing] = useState(false);

    const load = useCallback(async () => {
        if (!token) return;
        setRefreshing(true);
        try {
            const response = await fetch(`${API_URL}/integrations`, {
                headers: { Authorization: `Bearer ${token}` },
            });
            if (!response.ok) throw new Error(`Failed to load integrations (${response.status})`);
            setDetails(await response.json());
            setError(null);
        } catch (err) {
            setError(err instanceof Error ? err.message : "Network error");
        } finally {
            setRefreshing(false);
        }
    }, [token]);

    useEffect(() => {
        void load();
    }, [load]);

    // Prefer the live WS catalog when it has arrived; REST details carry the
    // settings values on top.
    const entries: IntegrationDetail[] = useMemo(() => {
        if (catalog.length === 0) return details ?? [];
        return catalog.map(entry => ({
            ...entry,
            values: details?.find(detail => detail.id === entry.id)?.values ?? {},
        }));
    }, [catalog, details]);

    const groups = useMemo(
        () =>
            GROUPS.map(group => ({
                ...group,
                items: entries
                    .filter(entry => groupFor(entry) === group.id)
                    .sort((a, b) => a.name.localeCompare(b.name)),
            })).filter(group => group.items.length > 0),
        [entries]
    );

    const selectedEntry = selected ? entries.find(entry => entry.id === selected.id) ?? null : null;

    return (
        <div className="space-y-4">
            <div className="px-5 mb-8 flex justify-between gap-4">
                <div className="flex-col">
                    <h1 className="font-syne text-xl sm:text-2xl lg:text-[26px] font-extrabold">
                        Integrations
                    </h1>
                    <div className="text-muted-foreground text-xs">
                        Events, actions and settings from core hardware and connected services
                    </div>
                </div>
                <div className="ml-auto flex items-center gap-2">
                    <div className="flex items-center gap-2 px-3 py-1.5 rounded-md accent-tile">
                        <Blocks size={11} className="accent-tile-icon" />
                        <span className="font-mono-dm text-[11px] accent-tile-icon tracking-[0.06em]">
                            {entries.length}
                        </span>
                    </div>
                    <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={refreshing}
                        onClick={() => void load()}
                    >
                        <RefreshCw size={14} />
                        <span>Refresh</span>
                    </Button>
                </div>
            </div>

            <div className="px-5 mb-5 space-y-6">
                {error && <div className="text-xs text-red-500">{error}</div>}

                {details === null && catalog.length === 0 ? (
                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                        <Skeleton className="h-[170px] w-full rounded-xl" />
                        <Skeleton className="h-[170px] w-full rounded-xl" />
                        <Skeleton className="h-[170px] w-full rounded-xl" />
                    </div>
                ) : (
                    groups.map(group => (
                        <section key={group.id} className="space-y-3">
                            <div className="flex items-center gap-2">
                                <h2 className="text-xs font-semibold">{group.label}</h2>
                                <span className="text-[11px] text-muted-foreground/50">
                                    {plural(group.items.length, "integration")}
                                </span>
                                <div className="flex-1" />
                                <span className="text-[11px] text-muted-foreground/60">{group.hint}</span>
                            </div>
                            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                                {group.items.map(entry => (
                                    <IntegrationTile
                                        key={entry.id}
                                        entry={entry}
                                        onOpen={tab => setSelected({ id: entry.id, tab })}
                                        onSaved={() => void load()}
                                    />
                                ))}
                            </div>
                        </section>
                    ))
                )}

                {!error && entries.length === 0 && details !== null && (
                    <p className="text-xs italic text-muted-foreground/50">
                        No integrations registered.
                    </p>
                )}

                {entries.length > 0 && (
                    <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground/50">
                        <Info className="size-3" />
                        Events and actions from every integration feed the trigger-rules engine.
                    </div>
                )}
            </div>

            {selectedEntry && selected && (
                <IntegrationPanel
                    key={selectedEntry.id}
                    entry={selectedEntry}
                    values={selectedEntry.values ?? {}}
                    tab={selected.tab}
                    onTabChange={tab =>
                        setSelected(current => (current ? { ...current, tab } : current))
                    }
                    onClose={() => setSelected(null)}
                    onSaved={() => void load()}
                />
            )}
        </div>
    );
}
