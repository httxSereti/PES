import { useEffect, useMemo, useRef, useState } from "react";
import {
    Bookmark,
    BookmarkPlus,
    ChevronLeft,
    ChevronRight,
    Lock,
    Play,
    Search,
} from "lucide-react";
import { Link } from "react-router";

import { Button } from "@pes/ui/components/button";
import { Input } from "@pes/ui/components/input";
import { Kbd } from "@pes/ui/components/kbd";
import { cn } from "@pes/ui/lib/utils";

import { ApplyProfileDialog } from "@/components/common/profiles/apply-profile-dialog";
import { ProfileMonogram } from "@/components/common/profiles/profile-badges";
import {
    buildSparkline,
    shapeAreaPath,
    shapeLinePath,
} from "@/components/common/profiles/profile-shape";
import { formatRelativeTime } from "@/lib/format-date";
import { hasPermission } from "@/lib/permissions";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import {
    openProfileSave,
    profilesSelectors,
    selectActiveProfile,
} from "@/store/slices/profilesSlice";
import { Permission, type ProfileSummary } from "@/types";

function modifiedTime(profile: ProfileSummary): number {
    const time = profile.modified_at
        ? new Date(profile.modified_at).getTime()
        : Number.NaN;
    return Number.isNaN(time) ? 0 : time;
}

function searchShortcut(): string {
    const platform = typeof navigator === "undefined" ? "" : navigator.platform;
    return /mac/i.test(platform) ? "⌘K" : "Ctrl+K";
}

function MiniProfileShape({
    profile,
    active,
}: {
    profile: ProfileSummary;
    active: boolean;
}) {
    const sparkline = useMemo(() => buildSparkline(profile), [profile]);
    const { a, b, envelope } = sparkline;
    const hasData = envelope.length > 0;
    const linePoints = active && a.length > 0 ? a : envelope;
    const line = shapeLinePath(linePoints, 100, 32, 3);
    const area = shapeAreaPath(linePoints, 100, 32, 3);

    return (
        <div
            className="h-8 w-full"
            title={
                hasData
                    ? "Channel envelope of the saved profile"
                    : "No stim ramps in this profile"
            }
        >
            <svg
                viewBox="0 0 100 32"
                preserveAspectRatio="none"
                className="h-full w-full"
                aria-hidden="true"
            >
                {!hasData ? (
                    <line
                        x1="0"
                        y1="29"
                        x2="100"
                        y2="29"
                        stroke="currentColor"
                        strokeWidth="1.5"
                        strokeDasharray="2 3"
                        strokeLinecap="round"
                        className="text-muted-foreground/40"
                    />
                ) : (
                    <>
                        <path
                            d={area}
                            fill="currentColor"
                            className={
                                active
                                    ? "text-violet-500/15"
                                    : "text-muted-foreground/10"
                            }
                        />
                        <path
                            d={line}
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="1.5"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            vectorEffect="non-scaling-stroke"
                            className={
                                active
                                    ? "text-violet-500 dark:text-violet-400"
                                    : "text-muted-foreground/60"
                            }
                        />
                        {active && b.length > 0 && (
                            <path
                                d={shapeLinePath(b, 100, 32, 3)}
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="1.5"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                vectorEffect="non-scaling-stroke"
                                className="text-blue-500 dark:text-blue-400"
                            />
                        )}
                    </>
                )}
            </svg>
        </div>
    );
}

function ProfileTile({
    profile,
    active,
    canApply,
    onApply,
}: {
    profile: ProfileSummary;
    active: boolean;
    canApply: boolean;
    onApply: (profile: ProfileSummary) => void;
}) {
    return (
        <article
            className={cn(
                "flex w-[174px] shrink-0 snap-start flex-col gap-2 rounded-xl border bg-muted/10 p-3 transition-colors",
                active
                    ? "border-violet-500/40 bg-violet-500/[0.06]"
                    : "border-border/50 hover:border-border",
            )}
        >
            <div className="flex items-center gap-2">
                <ProfileMonogram
                    name={profile.name}
                    legacy={profile.legacy}
                    className="size-7 rounded-lg text-[10px]"
                />
                <div className="min-w-0 flex-1">
                    <p className="truncate text-[11px] font-semibold">
                        {profile.name}
                    </p>
                    {profile.description && (
                        <p className="truncate text-[9px] text-muted-foreground">
                            {profile.description}
                        </p>
                    )}
                </div>
                {active && (
                    <span className="shrink-0 rounded-full border border-violet-500/30 bg-violet-500/10 px-1.5 py-0.5 font-mono text-[7px] text-violet-600 dark:text-violet-300">
                        ACTIVE
                    </span>
                )}
            </div>

            <MiniProfileShape profile={profile} active={active} />

            <div className="flex items-center justify-between font-mono text-[8px] text-muted-foreground">
                <span>
                    {profile.unit_count}u · {profile.ramp_count}r
                </span>
                <span>{formatRelativeTime(profile.modified_at)}</span>
            </div>

            <Button
                variant={active ? "secondary" : "outline"}
                size="sm"
                className="mt-auto h-7 w-full cursor-pointer font-mono text-[9px]"
                disabled={!canApply || active}
                title={
                    active
                        ? "This profile is already running"
                        : canApply
                          ? "Apply this profile"
                          : "Requires permission to control units"
                }
                onClick={() => onApply(profile)}
            >
                <Play className="size-3" />
                {active ? "Applied" : "Apply"}
            </Button>
        </article>
    );
}

export function ProfileCarousel() {
    const dispatch = useAppDispatch();
    const user = useAppSelector((state) => state.auth.user);
    const profiles = useAppSelector(profilesSelectors.selectAll);
    const profilesInitialized = useAppSelector(
        (state) => state.profiles.initialized,
    );
    const activeProfile = useAppSelector(selectActiveProfile);

    const [query, setQuery] = useState("");
    const [applyTarget, setApplyTarget] = useState<ProfileSummary | null>(null);
    const searchRef = useRef<HTMLInputElement>(null);
    const scrollRef = useRef<HTMLDivElement>(null);

    const canRead = hasPermission(user, Permission.READ_PROFILES);
    const canApply = hasPermission(user, Permission.WRITE_UNITS);
    const canWrite = hasPermission(user, Permission.WRITE_PROFILES);

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

    const filtered = useMemo(() => {
        const q = query.trim().toLowerCase();
        return [...profiles]
            .filter((profile) => {
                if (!q) return true;
                return (
                    profile.name.toLowerCase().includes(q) ||
                    (profile.description ?? "").toLowerCase().includes(q)
                );
            })
            .sort(
                (a, b) =>
                    modifiedTime(b) - modifiedTime(a) ||
                    a.name.localeCompare(b.name),
            );
    }, [profiles, query]);

    const scroll = (direction: -1 | 1) => {
        scrollRef.current?.scrollBy({
            left: direction * 400,
            behavior: "smooth",
        });
    };

    if (!canRead) {
        return (
            <section className="flex h-full flex-col gap-3 rounded-2xl border bg-card p-4">
                <div className="flex items-center gap-2">
                    <h2 className="font-syne text-sm font-bold">Profiles</h2>
                    <Lock className="size-3.5 text-muted-foreground/40" />
                </div>
                <div className="flex flex-1 flex-col items-center justify-center gap-2 py-8 text-center">
                    <Lock className="size-6 text-muted-foreground/30" />
                    <p className="text-xs text-muted-foreground">
                        Profiles are available to signed-in users.
                    </p>
                </div>
            </section>
        );
    }

    return (
        <section className="flex h-full flex-col gap-3 rounded-2xl border bg-card p-4">
            <div className="flex flex-wrap items-center gap-2">
                <h2 className="font-syne text-sm font-bold">Profiles</h2>
                <span className="rounded-full bg-muted px-2 py-0.5 font-mono text-[8px] text-muted-foreground">
                    {profiles.length}
                </span>

                <div className="relative order-last w-full sm:order-none sm:ml-2 sm:w-52">
                    <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
                    <Input
                        ref={searchRef}
                        value={query}
                        onChange={(event) => setQuery(event.target.value)}
                        placeholder="Search profiles…"
                        className="h-8 pr-12 pl-8 text-xs"
                    />
                    <Kbd className="pointer-events-none absolute top-1/2 right-2 hidden h-4 -translate-y-1/2 border border-border bg-transparent px-1 font-mono text-[8px] font-normal text-muted-foreground/60 sm:inline-flex">
                        {searchShortcut()}
                    </Kbd>
                </div>

                <div className="ml-auto flex items-center gap-1.5">
                    <Link
                        to="/app/profiles"
                        className="mr-1 text-[10px] text-muted-foreground transition-colors hover:text-foreground"
                    >
                        View all →
                    </Link>
                    <Button
                        variant="outline"
                        size="icon-xs"
                        className="hidden cursor-pointer sm:inline-flex"
                        aria-label="Previous profiles"
                        onClick={() => scroll(-1)}
                    >
                        <ChevronLeft className="size-3.5" />
                    </Button>
                    <Button
                        variant="outline"
                        size="icon-xs"
                        className="hidden cursor-pointer sm:inline-flex"
                        aria-label="Next profiles"
                        onClick={() => scroll(1)}
                    >
                        <ChevronRight className="size-3.5" />
                    </Button>
                    {canWrite && (
                        <Button
                            variant="ghost"
                            size="icon-xs"
                            className="cursor-pointer text-muted-foreground"
                            title="Save current settings as a profile"
                            onClick={() => dispatch(openProfileSave())}
                        >
                            <BookmarkPlus className="size-3.5" />
                        </Button>
                    )}
                </div>
            </div>

            {filtered.length === 0 ? (
                <div className="flex flex-1 flex-col items-center justify-center gap-2 py-8 text-center">
                    <Bookmark className="size-6 text-muted-foreground/30" />
                    <p className="text-xs text-muted-foreground">
                        {!profilesInitialized
                            ? "Loading profiles…"
                            : profiles.length === 0
                              ? "No profiles yet."
                              : `No profile matches “${query.trim()}”.`}
                    </p>
                    {profilesInitialized &&
                        profiles.length === 0 &&
                        canWrite && (
                            <Button
                                variant="outline"
                                size="sm"
                                className="cursor-pointer"
                                onClick={() => dispatch(openProfileSave())}
                            >
                                <BookmarkPlus className="size-3.5" />
                                Save current settings
                            </Button>
                        )}
                </div>
            ) : (
                <div
                    ref={scrollRef}
                    className="flex snap-x snap-mandatory gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
                >
                    {filtered.map((profile) => (
                        <ProfileTile
                            key={profile.name}
                            profile={profile}
                            active={activeProfile?.name === profile.name}
                            canApply={canApply}
                            onApply={setApplyTarget}
                        />
                    ))}
                </div>
            )}

            {applyTarget && (
                <ApplyProfileDialog
                    profile={applyTarget}
                    open
                    onOpenChange={(open) => {
                        if (!open) setApplyTarget(null);
                    }}
                />
            )}
        </section>
    );
}
