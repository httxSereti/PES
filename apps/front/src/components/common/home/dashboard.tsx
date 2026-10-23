import { useEffect, useState } from "react";
import { ArrowRight, Play } from "lucide-react";
import { Link } from "react-router";

import { Button } from "@pes/ui/components/button";

import { useSessionInfo } from "@/components/layout/sidebar/control-panel/use-session-info";
import { useOnlineUsers } from "@/hooks/useOnlineUsers";
import { hasPermission } from "@/lib/permissions";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import { openSessionSettings } from "@/store/slices/sessionSlice";
import { Permission } from "@/types";

import { HomeActivity } from "./home-activity";
import { HomePresence } from "./home-presence";
import { LiveSessionHero } from "./live-session-hero";
import { ProfileCarousel } from "./profile-carousel";
import { HomePulseStrip } from "./pulse-strip";
import { QuickActions } from "./quick-actions";
import { RoomCard } from "./room-card";
import { UnitsConsole } from "./units-console";

function useNow(intervalMs = 30_000) {
    const [now, setNow] = useState(() => new Date());

    useEffect(() => {
        const id = window.setInterval(() => setNow(new Date()), intervalMs);
        return () => window.clearInterval(id);
    }, [intervalMs]);

    return now;
}

function greetingFor(date: Date): string {
    const hour = date.getHours();
    if (hour >= 5 && hour < 12) return "Good morning";
    if (hour >= 12 && hour < 18) return "Good afternoon";
    return "Good evening";
}

export function HomeDashboard() {
    const dispatch = useAppDispatch();
    const user = useAppSelector((state) => state.auth.user);
    const { isLive, sessionHref } = useSessionInfo();
    const now = useNow();

    const canManageSession = hasPermission(user, Permission.SESSION_MANAGE);
    const canReadUsers = hasPermission(user, Permission.READ_USERS);
    const {
        users,
        online,
        loading: usersLoading,
    } = useOnlineUsers(canReadUsers);

    const displayName = user?.display_name?.trim() || user?.id || "there";
    const dateLabel = now.toLocaleDateString("en-GB", {
        weekday: "long",
        day: "numeric",
        month: "long",
    });
    const timeLabel = now.toLocaleTimeString("en-GB", {
        hour: "2-digit",
        minute: "2-digit",
    });

    return (
        <div className="flex flex-col gap-4 px-4 pb-4 md:gap-5 md:px-5">
            <header className="flex flex-wrap items-start justify-between gap-4">
                <div className="min-w-0">
                    <p className="font-mono text-[8px] tracking-[0.16em] text-violet-500 uppercase dark:text-violet-400">
                        Studio cockpit
                    </p>
                    <h1 className="font-syne truncate text-2xl font-extrabold sm:text-[28px]">
                        {greetingFor(now)}, {displayName}
                    </h1>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                        {dateLabel} · {timeLabel} — calm layout, live focus.
                    </p>
                </div>

                <div className="flex flex-wrap items-center gap-2.5">
                    <HomePresence
                        canReadUsers={canReadUsers}
                        onlineUsers={online}
                        loading={usersLoading}
                    />
                    {isLive ? (
                        <Button
                            asChild
                            variant="outline"
                            size="sm"
                            className="cursor-pointer"
                        >
                            <Link to={sessionHref}>
                                Open session
                                <ArrowRight className="size-3.5" />
                            </Link>
                        </Button>
                    ) : canManageSession ? (
                        <Button
                            size="sm"
                            className="cursor-pointer bg-violet-600 text-white hover:bg-violet-500"
                            onClick={() => dispatch(openSessionSettings())}
                        >
                            <Play className="size-3.5" />
                            Start session
                        </Button>
                    ) : null}
                </div>
            </header>

            <HomePulseStrip
                canReadUsers={canReadUsers}
                onlineUsers={online}
                totalUsers={users?.length ?? 0}
                usersLoading={usersLoading}
            />

            <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_380px] 2xl:grid-cols-[minmax(0,1fr)_400px]">
                <LiveSessionHero />
                <RoomCard />
            </div>

            <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_380px] 2xl:grid-cols-[minmax(0,1fr)_400px]">
                <UnitsConsole />
                <HomeActivity />
            </div>

            <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_380px] 2xl:grid-cols-[minmax(0,1fr)_400px]">
                <ProfileCarousel />
                <QuickActions />
            </div>
        </div>
    );
}
