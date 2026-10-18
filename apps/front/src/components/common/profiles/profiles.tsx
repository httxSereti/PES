import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
    ArrowUpDown,
    Bookmark,
    BookmarkPlus,
    LayoutGrid,
    List,
    RefreshCw,
    Search,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@pes/ui/components/button";
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

import { useWebSocket, useWebSocketEvent } from "@/hooks/useWebSocket";
import { hasPermission } from "@/lib/permissions";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import {
    openProfileSave,
    profilesSelectors,
    selectActiveProfile,
} from "@/store/slices/profilesSlice";
import type { ProfileSummary } from "@/types";
import { Permission } from "@/types";

import { ActiveProfileBanner } from "./active-profile-banner";
import { PendingProfiles } from "./pending-profiles";
import { ProfileCard } from "./profile-card";
import { ProfilesList } from "./profiles-list";

type ProfileTypeFilter = "all" | "legacy" | "custom";
type ProfileSort = "newest" | "name" | "ramps";
type ProfileView = "grid" | "list";

const TYPE_FILTERS: Array<{ key: ProfileTypeFilter; label: string }> = [
    { key: "all", label: "All" },
    { key: "legacy", label: "Legacy" },
    { key: "custom", label: "Custom" },
];

const SORT_LABELS: Record<ProfileSort, string> = {
    newest: "Newest first",
    name: "Name A–Z",
    ramps: "Most ramps",
};

/** Missing / invalid dates sort last. */
function modifiedTime(profile: ProfileSummary): number {
    const time = profile.modified_at
        ? new Date(profile.modified_at).getTime()
        : Number.NaN;
    return Number.isNaN(time) ? 0 : time;
}

function sortProfiles(
    profiles: ProfileSummary[],
    sort: ProfileSort,
): ProfileSummary[] {
    const sorted = [...profiles];
    switch (sort) {
        case "name":
            return sorted.sort((a, b) => a.name.localeCompare(b.name));
        case "ramps":
            return sorted.sort(
                (a, b) =>
                    b.ramp_count - a.ramp_count || a.name.localeCompare(b.name),
            );
        default:
            return sorted.sort(
                (a, b) =>
                    modifiedTime(b) - modifiedTime(a) ||
                    a.name.localeCompare(b.name),
            );
    }
}

function noMatchMessage(query: string, type: ProfileTypeFilter): string {
    const q = query.trim();
    const typeLabel =
        type === "legacy" ? "legacy" : type === "custom" ? "custom" : null;
    if (q) {
        return typeLabel
            ? `No ${typeLabel} profile matches "${q}".`
            : `No profile matches "${q}".`;
    }
    return typeLabel
        ? `No ${typeLabel} profiles found.`
        : "No profile matches the current filters.";
}

/** ⌘K on macOS, Ctrl+K elsewhere — mirrors the keydown handler below. */
function searchShortcut(): string {
    const platform = typeof navigator === "undefined" ? "" : navigator.platform;
    return /mac/i.test(platform) ? "⌘K" : "Ctrl+K";
}

export function Profiles() {
    const dispatch = useAppDispatch();
    const { sendCommand } = useWebSocket();
    const user = useAppSelector((state) => state.auth.user);
    const profiles = useAppSelector(profilesSelectors.selectAll);
    const initialized = useAppSelector((state) => state.profiles.initialized);
    const activeProfile = useAppSelector(selectActiveProfile);
    const [query, setQuery] = useState("");
    const [type, setType] = useState<ProfileTypeFilter>("all");
    const [sort, setSort] = useState<ProfileSort>("name");
    const [view, setView] = useState<ProfileView>("grid");
    const [refreshing, setRefreshing] = useState(false);
    const searchRef = useRef<HTMLInputElement>(null);

    const canApply = hasPermission(user, Permission.WRITE_UNITS);
    const canWrite = hasPermission(user, Permission.WRITE_PROFILES);
    const canDelete = hasPermission(user, Permission.MANAGE_PROFILES);

    // The catalog is file-backed: re-fetch so profiles edited outside the
    // app (hand edits, another instance) show up without a reconnect.
    const handleRefresh = useCallback(async () => {
        setRefreshing(true);
        try {
            void sendCommand("profiles:pending").catch(() => undefined);
            const result = await sendCommand("profiles:list");
            if (result.status !== "ok") {
                toast.error("Failed to refresh profiles", {
                    description: result.message ?? undefined,
                    position: "bottom-right",
                });
            }
        } catch (error) {
            toast.error("Failed to refresh profiles", {
                description: error instanceof Error ? error.message : undefined,
                position: "bottom-right",
            });
        } finally {
            setRefreshing(false);
        }
    }, [sendCommand]);

    // Silent refetch when the window regains focus.
    useEffect(() => {
        const onFocus = () => {
            sendCommand("profiles:list").catch(() => undefined);
        };
        window.addEventListener("focus", onFocus);
        return () => window.removeEventListener("focus", onFocus);
    }, [sendCommand]);

    // Queued applies change when a profile starts or reverts: refetch on
    // mount and whenever the active profile changes. Enqueue/cancel are
    // pushed live via `profiles:pending` broadcasts.
    useEffect(() => {
        void sendCommand("profiles:pending").catch(() => undefined);
    }, [sendCommand, activeProfile]);

    // ⌘K / Ctrl+K focuses the search input (no command palette).
    useEffect(() => {
        const onKeyDown = (event: KeyboardEvent) => {
            if (
                event.key.toLowerCase() === "k" &&
                (event.metaKey || event.ctrlKey)
            ) {
                event.preventDefault();
                searchRef.current?.focus();
            }
        };
        window.addEventListener("keydown", onKeyDown);
        return () => window.removeEventListener("keydown", onKeyDown);
    }, []);

    const counts = useMemo(() => {
        const legacy = profiles.reduce(
            (total, profile) => total + (profile.legacy ? 1 : 0),
            0,
        );
        return {
            all: profiles.length,
            legacy,
            custom: profiles.length - legacy,
        };
    }, [profiles]);

    const filtered = useMemo(() => {
        const q = query.trim().toLowerCase();
        const matching = profiles.filter((profile) => {
            if (type !== "all" && profile.legacy !== (type === "legacy")) {
                return false;
            }
            if (!q) return true;
            return (
                profile.name.toLowerCase().includes(q) ||
                (profile.description ?? "").toLowerCase().includes(q)
            );
        });
        return sortProfiles(matching, sort);
    }, [profiles, query, type, sort]);

    // `profiles:export` answers with a personal `profiles:exported` message
    useWebSocketEvent("profiles:exported", (payload) => {
        const blob = new Blob([JSON.stringify(payload.document, null, 2)], {
            type: "application/json",
        });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = `${payload.name}.json`;
        document.body.appendChild(link);
        link.click();
        link.remove();
        URL.revokeObjectURL(url);

        toast.success(`Exported "${payload.name}"`, {
            position: "bottom-right",
        });
    });

    const handleExport = async (name: string) => {
        try {
            const result = await sendCommand("profiles:export", { name });
            if (result.status !== "ok") {
                toast.error("Failed to export profile", {
                    description: result.message ?? undefined,
                    position: "bottom-right",
                });
            }
        } catch (error) {
            toast.error("Failed to export profile", {
                description: error instanceof Error ? error.message : undefined,
                position: "bottom-right",
            });
        }
    };

    return (
        <div className="space-y-4">
            <div className="mb-6 flex flex-wrap items-start justify-between gap-4 px-4 md:mb-8 md:px-5">
                <div className="flex-col">
                    <div className="flex items-center gap-2.5">
                        <h1 className="font-syne text-xl font-extrabold sm:text-2xl lg:text-[26px]">
                            Profiles
                        </h1>
                        <span className="rounded-full bg-muted px-2.5 py-[3px] font-mono text-[11px] font-medium text-muted-foreground">
                            {profiles.length}
                        </span>
                    </div>
                    <div className="text-xs text-muted-foreground">
                        Saved EStim configurations, ready to apply
                    </div>
                </div>

                <div className="ml-auto flex w-full flex-wrap items-center gap-2 sm:w-auto">
                    {canWrite && (
                        <Button
                            className="w-full border border-purple-500/30 bg-purple-500/15 text-purple-700 hover:bg-purple-500/25 sm:w-auto dark:text-purple-200"
                            onClick={() => dispatch(openProfileSave())}
                        >
                            <BookmarkPlus className="h-4 w-4" /> Save current
                            settings
                        </Button>
                    )}
                </div>
            </div>

            <div className="space-y-2 px-4 md:px-5">
                <ActiveProfileBanner />
                <PendingProfiles canCancel={canApply} />
            </div>

            <div className="flex flex-col gap-2 px-4 md:px-5 lg:flex-row lg:flex-wrap lg:items-center">
                <div className="relative w-full lg:w-80">
                    <Search className="pointer-events-none absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                    <Input
                        ref={searchRef}
                        value={query}
                        onChange={(event) => setQuery(event.target.value)}
                        placeholder="Search profiles..."
                        className="h-9 pr-9 pl-8 sm:pr-14"
                    />
                    <Kbd className="pointer-events-none absolute top-1/2 right-2.5 hidden h-5 -translate-y-1/2 border border-border bg-transparent px-1.5 font-mono text-[10px] font-normal text-muted-foreground/70 sm:inline-flex">
                        {searchShortcut()}
                    </Kbd>
                </div>

                <div className="flex flex-wrap items-center gap-2 lg:contents">
                    {TYPE_FILTERS.map((filter) => {
                        const active = type === filter.key;
                        return (
                            <button
                                key={filter.key}
                                type="button"
                                aria-pressed={active}
                                onClick={() => setType(filter.key)}
                                className={cn(
                                    "inline-flex h-[30px] cursor-pointer items-center gap-1.5 rounded-lg border px-2.5 transition",
                                    active
                                        ? "border-purple-500/30 bg-purple-500/15 text-purple-700 dark:text-purple-200"
                                        : "border-border bg-muted/40 text-muted-foreground/70 hover:border-muted-foreground/30 hover:text-foreground",
                                )}
                            >
                                <span className="text-xs font-medium">
                                    {filter.label}
                                </span>
                                <span
                                    className={cn(
                                        "font-mono text-[11px]",
                                        active
                                            ? "text-purple-500/70 dark:text-purple-300/70"
                                            : "text-muted-foreground/70",
                                    )}
                                >
                                    {counts[filter.key]}
                                </span>
                            </button>
                        );
                    })}
                </div>

                <div className="flex items-center justify-between gap-2 lg:ml-auto lg:justify-start">
                    <div className="flex items-center gap-2">
                        <Button
                            variant="outline"
                            size="icon"
                            title="Refresh from disk"
                            disabled={refreshing}
                            onClick={() => void handleRefresh()}
                        >
                            <RefreshCw
                                className={cn(
                                    "h-3.5 w-3.5",
                                    refreshing && "animate-spin",
                                )}
                            />
                        </Button>

                        <Select
                            value={sort}
                            onValueChange={(value) =>
                                setSort(value as ProfileSort)
                            }
                        >
                            <SelectTrigger className="gap-2 px-3 text-xs [&_svg]:size-3.5">
                                <ArrowUpDown className="size-3.5 text-muted-foreground" />
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent
                                position="popper"
                                align="end"
                                sideOffset={4}
                            >
                                {(
                                    Object.keys(SORT_LABELS) as ProfileSort[]
                                ).map((key) => (
                                    <SelectItem key={key} value={key}>
                                        {SORT_LABELS[key]}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>

                    <div className="flex h-9 items-center gap-0.5 rounded-lg border border-border bg-muted/40 p-0.5">
                        <button
                            type="button"
                            aria-label="Grid view"
                            aria-pressed={view === "grid"}
                            onClick={() => setView("grid")}
                            className={cn(
                                "grid h-8 w-8 cursor-pointer place-items-center rounded-md transition",
                                view === "grid"
                                    ? "bg-muted text-foreground"
                                    : "text-muted-foreground/60 hover:text-foreground",
                            )}
                        >
                            <LayoutGrid className="h-3.5 w-3.5" />
                        </button>
                        <button
                            type="button"
                            aria-label="List view"
                            aria-pressed={view === "list"}
                            onClick={() => setView("list")}
                            className={cn(
                                "grid h-8 w-8 cursor-pointer place-items-center rounded-md transition",
                                view === "list"
                                    ? "bg-muted text-foreground"
                                    : "text-muted-foreground/60 hover:text-foreground",
                            )}
                        >
                            <List className="h-3.5 w-3.5" />
                        </button>
                    </div>
                </div>
            </div>

            {!initialized ? (
                <div className="px-4 text-sm text-muted-foreground md:px-5">
                    Loading...
                </div>
            ) : filtered.length === 0 ? (
                <div className="mx-4 flex flex-col items-center gap-3 rounded-lg border border-dashed border-border/60 py-16 text-center md:mx-5">
                    <Bookmark className="h-8 w-8 text-muted-foreground/50" />
                    <p className="text-sm text-muted-foreground">
                        {profiles.length === 0
                            ? "No profiles yet. Save your current setup to create the first one."
                            : noMatchMessage(query, type)}
                    </p>
                    {profiles.length === 0 && canWrite && (
                        <Button
                            variant="outline"
                            onClick={() => dispatch(openProfileSave())}
                        >
                            <BookmarkPlus className="h-4 w-4" /> Save current
                            settings
                        </Button>
                    )}
                    {profiles.length > 0 && (
                        <Button
                            variant="outline"
                            onClick={() => {
                                setQuery("");
                                setType("all");
                            }}
                        >
                            Clear filters
                        </Button>
                    )}
                </div>
            ) : view === "list" ? (
                <ProfilesList
                    profiles={filtered}
                    canApply={canApply}
                    canWrite={canWrite}
                    canDelete={canDelete}
                    onExport={handleExport}
                />
            ) : (
                <div className="grid grid-cols-1 gap-3 px-4 pb-4 sm:grid-cols-2 md:px-5 md:pb-5 lg:grid-cols-3 xl:grid-cols-4">
                    {filtered.map((profile) => (
                        <ProfileCard
                            key={profile.name}
                            profile={profile}
                            canApply={canApply}
                            canWrite={canWrite}
                            canDelete={canDelete}
                            onExport={handleExport}
                        />
                    ))}
                </div>
            )}
        </div>
    );
}
