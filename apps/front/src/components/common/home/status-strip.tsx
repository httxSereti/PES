import type { ReactNode } from "react";
import { Link } from "react-router";
import { AlertTriangle, ListChecks, Play, Radar, Zap } from "lucide-react";
import { cn } from "@pes/ui/lib/utils";
import { useSessionInfo } from "@/components/layout/sidebar/control-panel/use-session-info";
import { SessionTimer } from "@/components/layout/sidebar/session/session-timer";
import { hasPermission } from "@/lib/permissions";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import { openSessionSettings } from "@/store/slices/sessionSlice";
import { sensorsSelectors } from "@/store/slices/sensorsSlice";
import { unitsSelectors } from "@/store/slices/unitsSlice";
import { Permission, type Sensor } from "@/types";
import { UNIT_IDS } from "@/components/common/ramps/ramp.constants";

type ChipProps = {
    children: ReactNode;
    className?: string;
    title?: string;
    to?: string;
    onClick?: () => void;
};

function Chip({ children, className, title, to, onClick }: ChipProps) {
    const classes = cn(
        "inline-flex shrink-0 items-center gap-2 rounded-full border bg-card px-3 py-1.5 text-xs whitespace-nowrap transition-colors",
        (to || onClick) && "hover:border-primary/40",
        onClick && "cursor-pointer",
        className,
    );
    if (to) {
        return (
            <Link to={to} title={title} className={classes}>
                {children}
            </Link>
        );
    }
    if (onClick) {
        return (
            <button type="button" title={title} className={classes} onClick={onClick}>
                {children}
            </button>
        );
    }
    return (
        <span title={title} className={classes}>
            {children}
        </span>
    );
}

function UnitsChip() {
    const units = useAppSelector((state) => unitsSelectors.selectAll(state));
    const hardware = useAppSelector((state) => state.hardware);

    const connected = units.filter((unit) => unit.cnx_ok).length;

    return (
        <Chip to="/app/units" title="Units — open the Units page">
            <span className="flex items-center gap-1">
                {UNIT_IDS.map((unitId) => {
                    const unit = units.find((candidate) => candidate.id === unitId);
                    const enabled = hardware[unitId] ?? true;
                    const dotColor = !enabled
                        ? "bg-gray-400"
                        : unit?.cnx_ok
                          ? "bg-emerald-500"
                          : "bg-red-500";
                    return (
                        <span
                            key={unitId}
                            className={cn("size-1.5 rounded-full", dotColor)}
                        />
                    );
                })}
            </span>
            <span className="font-mono tabular-nums text-muted-foreground">
                {connected}/{UNIT_IDS.length} units
            </span>
        </Chip>
    );
}

function SessionChip() {
    const dispatch = useAppDispatch();
    const user = useAppSelector((state) => state.auth.user);
    const { activeSession, isLive, SessionIcon, sessionHref } = useSessionInfo();

    if (isLive) {
        return (
            <Chip to={sessionHref} title="Open the running session">
                <span className="relative flex size-1.5 shrink-0">
                    <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                    <span className="relative inline-flex size-1.5 rounded-full bg-emerald-500" />
                </span>
                <span className="max-w-40 truncate font-medium">
                    {activeSession.name}
                </span>
                <SessionTimer
                    startedAt={activeSession.started_at}
                    className="text-muted-foreground"
                />
            </Chip>
        );
    }

    if (hasPermission(user, Permission.SESSION_MANAGE)) {
        return (
            <Chip
                onClick={() => dispatch(openSessionSettings())}
                title="Start a session"
            >
                <Play className="size-3.5" />
                <span className="text-muted-foreground">No session</span>
                <span className="font-medium text-primary">Start</span>
            </Chip>
        );
    }

    return (
        <Chip to="/app/sessions" title="Sessions">
            <SessionIcon className="size-3.5 text-muted-foreground" />
            <span className="text-muted-foreground">No session</span>
        </Chip>
    );
}

/** Live alert condition, mirroring what the sensors page highlights. */
function isSensorAlert(sensor: Sensor): boolean {
    if (!sensor.alarm_enable) return false;
    if (sensor.sensor_type === "motion") {
        return sensor.current_move >= sensor.move_alarm_level;
    }
    return sensor.current_sound >= sensor.sound_alarm_level;
}

function SensorsChip() {
    const sensors = useAppSelector((state) => sensorsSelectors.selectAll(state));
    const alerts = sensors.filter(isSensorAlert).length;

    return (
        <Chip
            to="/app/sensors"
            title="Sensors — open the Sensors page"
            className={alerts > 0 ? "border-rose-500/40" : undefined}
        >
            {alerts > 0 ? (
                <AlertTriangle className="size-3.5 text-rose-500" />
            ) : (
                <Radar className="size-3.5 text-muted-foreground" />
            )}
            <span
                className={cn(
                    "font-mono tabular-nums",
                    alerts > 0 ? "text-rose-500" : "text-muted-foreground",
                )}
            >
                {alerts > 0
                    ? `${alerts} alarm${alerts > 1 ? "s" : ""}`
                    : "0 alarms"}
            </span>
        </Chip>
    );
}

function EventsChip() {
    const count = useAppSelector((state) => state.events.events.length);

    return (
        <Chip to="/app/events" title="Events — open the Events page">
            <Zap
                className={cn(
                    "size-3.5",
                    count > 0 ? "text-violet-500" : "text-muted-foreground",
                )}
            />
            <span className="font-mono tabular-nums text-muted-foreground">
                {count} event{count === 1 ? "" : "s"}
            </span>
        </Chip>
    );
}

function QueueChip() {
    const user = useAppSelector((state) => state.auth.user);
    const status = useAppSelector((state) => state.queue.status);

    // `queue:update` is only delivered to ADMIN/HOST connections, and no
    // snapshot exists until the first message arrives.
    if (!hasPermission(user, Permission.ADMIN) || !status) return null;

    const paused = status.paused;
    return (
        <Chip
            title={`Action queue — ${status.waiting} waiting · ${status.running} running · ${status.total_done} done`}
            className={paused ? "border-amber-500/40" : undefined}
        >
            <ListChecks
                className={cn(
                    "size-3.5",
                    paused ? "text-amber-500" : "text-muted-foreground",
                )}
            />
            <span
                className={cn(
                    "font-mono tabular-nums",
                    paused ? "text-amber-500" : "text-muted-foreground",
                )}
            >
                {paused ? "paused · " : ""}
                {status.total_in_queue} in queue
            </span>
        </Chip>
    );
}

/** Compact status row of the home page: units, session, sensors, events, queue. */
export function HomeStatusStrip() {
    return (
        <div className="-mb-1 flex items-center gap-2 overflow-x-auto pb-1">
            <UnitsChip />
            <SessionChip />
            <SensorsChip />
            <EventsChip />
            <QueueChip />
        </div>
    );
}
