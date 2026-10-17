import { useEffect, useMemo, useRef, useState } from "react";
import {
    ArrowUpDown,
    Bookmark,
    BookmarkPlus,
    LayoutGrid,
    List,
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
} from "@/store/slices/profilesSlice";
import type { ProfileSummary } from "@/types";
import { Permission } from "@/types";

import { ActiveProfileBanner } from "./active-profile-banner";
import { ProfileCard } from "./profile-card";

type ProfileTypeFilter = "all" | "builtin" | "custom";
type ProfileSort = "newest" | "name" | "ramps";

const TYPE_FILTERS: Array<{ key: ProfileTypeFilter; label: string }> = [
    { key: "all", label: "All" },
    { key: "builtin", label: "Built-in" },
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
        type === "builtin" ? "built-in" : type === "custom" ? "custom" : null;
    if (q) {
        return typeLabel
            ? `No ${typeLabel} profile matches "${q}".`
            : `No profile matches "${q}".`;
    }
    return typeLabel
        ? `No ${typeLabel} profiles found.`
        : "No profile matches the current filters.";
}

export function Profiles() {
    const dispatch = useAppDispatch();
    const { sendCommand } = useWebSocket();
    const user = useAppSelector((state) => state.auth.user);
    const profiles = useAppSelector(profilesSelectors.selectAll);
    const initialized = useAppSelector((state) => state.profiles.initialized);
    const [query, setQuery] = useState("");
    const [type, setType] = useState<ProfileTypeFilter>("all");
    const [sort, setSort] = useState<ProfileSort>("newest");
    const searchRef = useRef<HTMLInputElement>(null);

    const canApply = hasPermission(user, Permission.WRITE_UNITS);
    const canWrite = hasPermission(user, Permission.WRITE_PROFILES);
    const canDelete = hasPermission(user, Permission.MANAGE_PROFILES);

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
        const builtin = profiles.reduce(
            (total, profile) => total + (profile.builtin ? 1 : 0),
            0,
        );
        return {
            all: profiles.length,
            builtin,
            custom: profiles.length - builtin,
        };
    }, [profiles]);

    const filtered = useMemo(() => {
        const q = query.trim().toLowerCase();
        const matching = profiles.filter((profile) => {
            if (type !== "all" && profile.builtin !== (type === "builtin")) {
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
            <div className="mb-8 flex flex-wrap items-start justify-between gap-4 px-5">
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

                <div className="ml-auto flex flex-wrap items-center gap-2">
                    {canWrite && (
                        <Button
                            className="bg-purple-500 text-white hover:bg-purple-500/90"
                            onClick={() => dispatch(openProfileSave())}
                        >
                            <BookmarkPlus className="h-4 w-4" /> Save current
                            settings
                        </Button>
                    )}
                </div>
            </div>

            <div className="px-5">
                <ActiveProfileBanner />
            </div>

            <div className="flex flex-wrap items-center gap-2 px-5">
                <div className="relative w-80 max-w-full">
                    <Search className="pointer-events-none absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                    <Input
                        ref={searchRef}
                        value={query}
                        onChange={(event) => setQuery(event.target.value)}
                        placeholder="Search profiles..."
                        className="h-9 pr-14 pl-8"
                    />
                    <Kbd className="pointer-events-none absolute top-1/2 right-2.5 h-5 -translate-y-1/2 border border-border bg-transparent px-1.5 font-mono text-[10px] font-normal text-muted-foreground/70">
                        ⌘K
                    </Kbd>
                </div>

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

                <div className="ml-auto flex items-center gap-2">
                    <Select
                        value={sort}
                        onValueChange={(value) => setSort(value as ProfileSort)}
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
                            {(Object.keys(SORT_LABELS) as ProfileSort[]).map(
                                (key) => (
                                    <SelectItem key={key} value={key}>
                                        {SORT_LABELS[key]}
                                    </SelectItem>
                                ),
                            )}
                        </SelectContent>
                    </Select>

                    <div className="flex h-9 items-center gap-0.5 rounded-lg border border-border bg-muted/40 p-0.5">
                        <button
                            type="button"
                            aria-label="Grid view"
                            aria-pressed="true"
                            className="grid h-8 w-8 cursor-pointer place-items-center rounded-md bg-muted text-foreground"
                        >
                            <LayoutGrid className="h-3.5 w-3.5" />
                        </button>
                        <button
                            type="button"
                            aria-label="List view"
                            disabled
                            title="List view is coming soon"
                            className="grid h-8 w-8 place-items-center rounded-md text-muted-foreground disabled:cursor-not-allowed disabled:opacity-40"
                        >
                            <List className="h-3.5 w-3.5" />
                        </button>
                    </div>
                </div>
            </div>

            {!initialized ? (
                <div className="px-5 text-sm text-muted-foreground">
                    Loading...
                </div>
            ) : filtered.length === 0 ? (
                <div className="mx-5 flex flex-col items-center gap-3 rounded-lg border border-dashed border-border/60 py-16 text-center">
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
            ) : (
                <div className="grid grid-cols-1 gap-3 px-5 pb-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
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
