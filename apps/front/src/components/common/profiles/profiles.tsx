import { useMemo, useState } from "react";
import { Bookmark, BookmarkPlus, Search } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@pes/ui/components/button";
import { Input } from "@pes/ui/components/input";

import { useWebSocket, useWebSocketEvent } from "@/hooks/useWebSocket";
import { hasPermission } from "@/lib/permissions";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import { openProfileSave, profilesSelectors } from "@/store/slices/profilesSlice";
import { Permission } from "@/types";

import { ActiveProfileBanner } from "./active-profile-banner";
import { ProfileCard } from "./profile-card";

export function Profiles() {
    const dispatch = useAppDispatch();
    const { sendCommand } = useWebSocket();
    const user = useAppSelector((state) => state.auth.user);
    const profiles = useAppSelector(profilesSelectors.selectAll);
    const initialized = useAppSelector((state) => state.profiles.initialized);
    const [query, setQuery] = useState("");

    const canApply = hasPermission(user, Permission.WRITE_UNITS);
    const canWrite = hasPermission(user, Permission.WRITE_PROFILES);
    const canDelete = hasPermission(user, Permission.MANAGE_PROFILES);

    const filtered = useMemo(() => {
        const q = query.trim().toLowerCase();
        if (!q) return profiles;
        return profiles.filter(
            (profile) =>
                profile.name.toLowerCase().includes(q) ||
                (profile.description ?? "").toLowerCase().includes(q)
        );
    }, [profiles, query]);

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
                    <h1 className="font-syne text-xl font-extrabold sm:text-2xl lg:text-[26px]">
                        Profiles
                    </h1>
                    <div className="text-xs text-muted-foreground">
                        Saved EStim configurations, ready to apply
                    </div>
                </div>

                <div className="ml-auto flex flex-wrap items-center gap-2">
                    <div className="relative">
                        <Search className="pointer-events-none absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                        <Input
                            value={query}
                            onChange={(event) => setQuery(event.target.value)}
                            placeholder="Search profiles..."
                            className="h-9 w-48 pl-8"
                        />
                    </div>
                    {canWrite && (
                        <Button onClick={() => dispatch(openProfileSave())}>
                            <BookmarkPlus className="h-4 w-4" /> Save current settings
                        </Button>
                    )}
                </div>
            </div>

            <div className="px-5">
                <ActiveProfileBanner />
            </div>

            {!initialized ? (
                <div className="px-5 text-sm text-muted-foreground">Loading...</div>
            ) : filtered.length === 0 ? (
                <div className="mx-5 flex flex-col items-center gap-3 rounded-lg border border-dashed border-border/60 py-16 text-center">
                    <Bookmark className="h-8 w-8 text-muted-foreground/50" />
                    <p className="text-sm text-muted-foreground">
                        {profiles.length === 0
                            ? "No profiles yet. Save your current setup to create the first one."
                            : "No profile matches your search."}
                    </p>
                    {profiles.length === 0 && canWrite && (
                        <Button
                            variant="outline"
                            onClick={() => dispatch(openProfileSave())}
                        >
                            <BookmarkPlus className="h-4 w-4" /> Save current settings
                        </Button>
                    )}
                </div>
            ) : (
                <div className="grid grid-cols-1 gap-5 px-5 pb-5 sm:grid-cols-2 lg:grid-cols-3">
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
