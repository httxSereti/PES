import { cn } from "@pes/ui/lib/utils";

import { useWebSocket } from "@/hooks/useWebSocket";
import { useAppSelector } from "@/store/hooks";
import type { AdminUser } from "@/types/admin.types";

const AVATAR_COLORS = [
    "bg-violet-600",
    "bg-blue-600",
    "bg-emerald-600",
    "bg-amber-600",
];

function initials(name: string | null | undefined, fallback: string): string {
    const value = (name ?? fallback).trim();
    if (!value) return "?";

    const parts = value.split(/\s+/).filter(Boolean);
    if (parts.length >= 2) {
        return `${parts[0]?.charAt(0) ?? ""}${parts[1]?.charAt(0) ?? ""}`.toUpperCase();
    }

    return value.slice(0, 2).toUpperCase();
}

type HomePresenceProps = {
    canReadUsers: boolean;
    onlineUsers: AdminUser[];
    loading: boolean;
};

export function HomePresence({
    canReadUsers,
    onlineUsers,
    loading,
}: HomePresenceProps) {
    const user = useAppSelector((state) => state.auth.user);
    const { status } = useWebSocket();

    if (!canReadUsers) {
        return (
            <div className="flex items-center gap-2">
                <span
                    className="grid size-7 place-items-center rounded-full bg-violet-600 font-mono text-[10px] font-semibold text-white ring-2 ring-background"
                    title={user?.display_name ?? user?.id ?? "You"}
                >
                    {initials(user?.display_name, user?.id ?? "You")}
                </span>
                <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <span
                        className={cn(
                            "size-1.5 rounded-full",
                            status === "connected"
                                ? "bg-emerald-500"
                                : "bg-red-500",
                        )}
                    />
                    Connected
                </span>
            </div>
        );
    }

    if (loading && onlineUsers.length === 0) {
        return (
            <div className="flex items-center gap-2" aria-label="Loading users">
                <div className="flex -space-x-1.5">
                    {[0, 1, 2, 3].map((index) => (
                        <span
                            key={index}
                            className="size-7 animate-pulse rounded-full bg-muted ring-2 ring-background"
                        />
                    ))}
                </div>
                <span className="text-xs text-muted-foreground">Loading…</span>
            </div>
        );
    }

    const visible = onlineUsers.slice(0, 4);
    const names = onlineUsers
        .map((online) => online.display_name ?? online.id)
        .join(", ");

    return (
        <div className="flex items-center gap-2">
            <div
                className="flex -space-x-1.5"
                title={names || "No users online"}
            >
                {visible.length === 0 ? (
                    <span className="grid size-7 place-items-center rounded-full bg-muted font-mono text-[10px] text-muted-foreground ring-2 ring-background">
                        —
                    </span>
                ) : (
                    visible.map((online, index) => (
                        <span
                            key={online.id}
                            className={cn(
                                "grid size-7 place-items-center rounded-full font-mono text-[9px] font-semibold text-white ring-2 ring-background",
                                AVATAR_COLORS[index % AVATAR_COLORS.length],
                            )}
                            title={online.display_name ?? online.id}
                        >
                            {initials(online.display_name, online.id)}
                        </span>
                    ))
                )}
            </div>
            <span className="text-xs text-muted-foreground">
                {onlineUsers.length} online
            </span>
        </div>
    );
}
