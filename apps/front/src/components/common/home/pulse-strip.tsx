import {
    Activity,
    Bookmark,
    CircleDashed,
    Radar,
    Users,
    Zap,
    type LucideIcon,
} from "lucide-react";
import { Link } from "react-router";

import { cn } from "@pes/ui/lib/utils";

import { useSessionInfo } from "@/components/layout/sidebar/control-panel/use-session-info";
import { hasPermission } from "@/lib/permissions";
import { isSensorAlert } from "@/lib/sensor-alert";
import { useAppSelector } from "@/store/hooks";
import { rampsSelectors } from "@/store/slices/rampsSlice";
import { sensorsSelectors } from "@/store/slices/sensorsSlice";
import { selectActiveProfile } from "@/store/slices/profilesSlice";
import { Permission } from "@/types";
import type { AdminUser } from "@/types/admin.types";

type PulseMetricProps = {
    icon: LucideIcon;
    label: string;
    value: string;
    sub: string;
    to?: string;
    iconClassName: string;
    tileClassName: string;
    className?: string;
};

function PulseMetric({
    icon: Icon,
    label,
    value,
    sub,
    to,
    iconClassName,
    tileClassName,
    className,
}: PulseMetricProps) {
    const content = (
        <>
            <span
                className={cn(
                    "grid size-8 shrink-0 place-items-center rounded-lg",
                    tileClassName,
                )}
            >
                <Icon className={cn("size-4", iconClassName)} />
            </span>
            <span className="min-w-0">
                <span className="font-syne block text-xl leading-none font-extrabold tabular-nums">
                    {value}
                </span>
                <span className="mt-1 block truncate text-[10px] text-muted-foreground">
                    {sub}
                </span>
                <span className="mt-0.5 block font-mono text-[8px] tracking-[0.12em] text-muted-foreground/50 uppercase">
                    {label}
                </span>
            </span>
        </>
    );

    const classes = cn(
        "flex min-w-0 flex-1 items-center gap-2.5 bg-card px-4 py-3",
        to && "transition-colors hover:bg-muted/25",
        className,
    );

    if (to) {
        return (
            <Link to={to} className={classes}>
                {content}
            </Link>
        );
    }

    return <div className={classes}>{content}</div>;
}

type PulseStripProps = {
    canReadUsers: boolean;
    onlineUsers: AdminUser[];
    totalUsers: number;
    usersLoading: boolean;
};

export function HomePulseStrip({
    canReadUsers,
    onlineUsers,
    totalUsers,
    usersLoading,
}: PulseStripProps) {
    const user = useAppSelector((state) => state.auth.user);
    const events = useAppSelector((state) => state.events.events);
    const ramps = useAppSelector(rampsSelectors.selectAll);
    const sensors = useAppSelector(sensorsSelectors.selectAll);
    const activeProfile = useAppSelector(selectActiveProfile);
    const { activeSession, isLive, sessionHref } = useSessionInfo();

    const canReadEvents = hasPermission(user, Permission.READ_EVENTS);
    const canReadProfiles = hasPermission(user, Permission.READ_PROFILES);

    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const startOfHour = Date.now() - 60 * 60 * 1000;

    const eventsToday = events.filter(
        (event) =>
            new Date(event.triggered_at).getTime() >= startOfDay.getTime(),
    ).length;
    const eventsThisHour = events.filter(
        (event) => new Date(event.triggered_at).getTime() >= startOfHour,
    ).length;

    const pausedRamps = ramps.filter((ramp) => ramp.paused).length;
    const onlineSensors = sensors.filter(
        (sensor) => sensor.sensor_online,
    ).length;
    const sensorAlerts = sensors.filter(isSensorAlert).length;

    return (
        <div
            className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl border bg-border xl:flex"
            aria-label="Home status"
        >
            {canReadUsers ? (
                <PulseMetric
                    icon={Users}
                    label="Users online"
                    value={usersLoading ? "—" : String(onlineUsers.length)}
                    sub={
                        usersLoading
                            ? "loading presence"
                            : `of ${totalUsers} account${totalUsers === 1 ? "" : "s"}`
                    }
                    to="/app/admin/users"
                    tileClassName="bg-violet-500/12"
                    iconClassName="text-violet-500 dark:text-violet-400"
                />
            ) : (
                <PulseMetric
                    icon={isLive ? Activity : CircleDashed}
                    label="Session"
                    value={isLive ? "LIVE" : "IDLE"}
                    sub={activeSession?.name ?? "no session running"}
                    to={sessionHref}
                    tileClassName={isLive ? "bg-emerald-500/12" : "bg-muted/70"}
                    iconClassName={
                        isLive
                            ? "text-emerald-500 dark:text-emerald-400"
                            : "text-muted-foreground"
                    }
                />
            )}

            {canReadEvents && (
                <PulseMetric
                    icon={Zap}
                    label="Events today"
                    value={String(eventsToday)}
                    sub={`${eventsThisHour} in the last hour`}
                    to="/app/events"
                    tileClassName="bg-amber-500/12"
                    iconClassName="text-amber-500 dark:text-amber-400"
                />
            )}

            <PulseMetric
                icon={Bookmark}
                label="Active profile"
                value={activeProfile ? "1" : "0"}
                sub={activeProfile?.name ?? "none running"}
                to={canReadProfiles ? "/app/profiles" : undefined}
                tileClassName="bg-violet-500/12"
                iconClassName="text-violet-500 dark:text-violet-400"
            />

            <PulseMetric
                icon={Activity}
                label="Ramps live"
                value={String(ramps.length)}
                sub={
                    ramps.length === 0
                        ? "nothing running"
                        : pausedRamps > 0
                          ? `${pausedRamps} paused`
                          : "all running"
                }
                to="/app/units"
                tileClassName="bg-emerald-500/12"
                iconClassName="text-emerald-500 dark:text-emerald-400"
            />

            <PulseMetric
                icon={Radar}
                label="Sensors"
                value={`${onlineSensors}/${sensors.length}`}
                sub={
                    sensorAlerts > 0
                        ? `${sensorAlerts} alarm${sensorAlerts > 1 ? "s" : ""}`
                        : "all clear"
                }
                to="/app/sensors"
                tileClassName={
                    sensorAlerts > 0 ? "bg-rose-500/12" : "bg-blue-500/12"
                }
                iconClassName={
                    sensorAlerts > 0
                        ? "text-rose-500 dark:text-rose-400"
                        : "text-blue-500 dark:text-blue-400"
                }
                className={canReadEvents ? "last:col-span-2" : undefined}
            />
        </div>
    );
}
