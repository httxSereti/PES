import { useState } from "react";
import { useNavigate } from "react-router";
import {
    AlertTriangle,
    Bell,
    BellRing,
    CheckCheck,
    CircleAlert,
    ShieldCheck,
    Trash2,
    Zap,
} from "lucide-react";

import { Badge } from "@pes/ui/components/badge";
import { Button } from "@pes/ui/components/button";
import { Popover, PopoverContent, PopoverTrigger } from "@pes/ui/components/popover";
import { Switch } from "@pes/ui/components/switch";
import { cn } from "@pes/ui/lib/utils";

import { hasPermission } from "@/lib/permissions";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import {
    notificationRead,
    notificationsCleared,
    notificationsMarkAllRead,
    setToastsEnabled,
    type InAppNotification,
} from "@/store/slices/notificationsSlice";
import { Permission } from "@/types";

/** Small relative timestamp ("12s", "4m", "2h", "3d"). */
function relativeTime(iso: string): string {
    const timestamp = Date.parse(iso);
    if (Number.isNaN(timestamp)) return "";
    const seconds = Math.max(0, Math.round((Date.now() - timestamp) / 1000));
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.round(seconds / 60);
    if (minutes < 60) return `${minutes}m`;
    const hours = Math.round(minutes / 60);
    if (hours < 24) return `${hours}h`;
    return `${Math.round(hours / 24)}d`;
}

function KindIcon({ kind, severity }: Pick<InAppNotification, "kind" | "severity">) {
    const className = cn(
        "size-4 shrink-0",
        severity === "error" && "text-destructive",
        severity === "warning" && "text-amber-500",
        severity === "success" && "text-emerald-500",
        severity === "info" && "text-muted-foreground",
    );

    switch (kind) {
        case "rule_fired":
            return <Zap className={className} />;
        case "flow_notify":
            return <BellRing className={className} />;
        case "approval":
            return <ShieldCheck className={className} />;
        case "error":
            return <CircleAlert className={className} />;
        default:
            return <AlertTriangle className={className} />;
    }
}

/**
 * In-app notification center: bell with unread badge and a popover listing the
 * notifications received during this browser session. The toast preference
 * lives here too; it is persisted in localStorage.
 */
export function NotificationsBell() {
    const user = useAppSelector((state) => state.auth.user);
    const { items, unread, toastsEnabled } = useAppSelector((state) => state.notifications);
    const dispatch = useAppDispatch();
    const navigate = useNavigate();
    const [open, setOpen] = useState(false);

    if (!hasPermission(user, Permission.READ_EVENTS)) return null;

    function openItem(item: InAppNotification) {
        dispatch(notificationRead(item.id));
        if (item.link) {
            setOpen(false);
            navigate(item.link);
        }
    }

    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <Button
                    variant="ghost"
                    size="icon"
                    className="relative h-8 w-8"
                    aria-label={
                        unread > 0
                            ? `Notifications (${unread} unread)`
                            : "Notifications"
                    }
                >
                    <Bell className="size-4" />
                    {unread > 0 && (
                        <span className="absolute -right-0.5 -top-0.5 flex min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[9px] font-semibold leading-4 text-white">
                            {unread > 99 ? "99+" : unread}
                        </span>
                    )}
                </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-[min(22rem,calc(100vw-2rem))] p-0">
                <div className="flex items-center justify-between gap-2 border-b px-3 py-2">
                    <div className="flex items-center gap-2">
                        <p className="text-sm font-medium">Notifications</p>
                        {unread > 0 && (
                            <Badge variant="secondary" className="h-5 px-1.5 text-[10px]">
                                {unread} new
                            </Badge>
                        )}
                    </div>
                    <div className="flex items-center gap-0.5">
                        <Button
                            variant="ghost"
                            size="icon-sm"
                            onClick={() => dispatch(notificationsMarkAllRead())}
                            disabled={unread === 0}
                            aria-label="Mark all as read"
                            title="Mark all as read"
                        >
                            <CheckCheck className="size-3.5" />
                        </Button>
                        <Button
                            variant="ghost"
                            size="icon-sm"
                            onClick={() => dispatch(notificationsCleared())}
                            disabled={items.length === 0}
                            aria-label="Clear notifications"
                            title="Clear notifications"
                        >
                            <Trash2 className="size-3.5" />
                        </Button>
                    </div>
                </div>

                <div className="flex items-center justify-between gap-3 border-b px-3 py-2">
                    <div className="min-w-0">
                        <p className="text-xs font-medium">Toast pop-ups</p>
                        <p className="text-[10px] text-muted-foreground/60">
                            Show a toast when a rule fires. The list always keeps them.
                        </p>
                    </div>
                    <Switch
                        checked={toastsEnabled}
                        onCheckedChange={(checked) => dispatch(setToastsEnabled(checked))}
                        aria-label="Enable notification toasts"
                    />
                </div>

                <div className="max-h-80 overflow-y-auto">
                    {items.length === 0 ? (
                        <div className="px-3 py-8 text-center">
                            <Bell className="mx-auto mb-2 size-6 text-muted-foreground/30" />
                            <p className="text-xs text-muted-foreground/60">
                                Nothing yet. Enable “Notify” on a trigger rule (or add a
                                Notify node to a flow) to receive notifications here.
                            </p>
                        </div>
                    ) : (
                        <ul className="divide-y">
                            {items.map((item) => (
                                <li key={item.id}>
                                    <button
                                        type="button"
                                        onClick={() => openItem(item)}
                                        className={cn(
                                            "flex w-full items-start gap-2 px-3 py-2 text-left transition-colors hover:bg-muted/40",
                                            !item.read && "bg-muted/20",
                                        )}
                                    >
                                        <span className="mt-0.5">
                                            <KindIcon kind={item.kind} severity={item.severity} />
                                        </span>
                                        <span className="min-w-0 flex-1">
                                            <span className="flex items-center gap-1.5">
                                                <span
                                                    className={cn(
                                                        "truncate text-xs",
                                                        !item.read ? "font-semibold" : "font-medium",
                                                    )}
                                                >
                                                    {item.title}
                                                </span>
                                                {item.count > 1 && (
                                                    <Badge
                                                        variant="outline"
                                                        className="h-4 shrink-0 px-1 text-[9px]"
                                                    >
                                                        ×{item.count}
                                                    </Badge>
                                                )}
                                                <span className="ml-auto shrink-0 font-mono text-[9px] text-muted-foreground/50">
                                                    {relativeTime(item.updated_at ?? item.created_at)}
                                                </span>
                                            </span>
                                            <span className="mt-0.5 line-clamp-2 block text-[11px] text-muted-foreground/70">
                                                {item.message}
                                            </span>
                                            {item.actions.length > 0 && (
                                                <span className="mt-1 flex flex-wrap gap-1">
                                                    {item.actions.slice(0, 4).map((action) => (
                                                        <span
                                                            key={action}
                                                            className="rounded bg-muted px-1 py-0.5 font-mono text-[8.5px] text-muted-foreground/70"
                                                        >
                                                            {action}
                                                        </span>
                                                    ))}
                                                    {item.actions.length > 4 && (
                                                        <span className="font-mono text-[8.5px] text-muted-foreground/50">
                                                            +{item.actions.length - 4}
                                                        </span>
                                                    )}
                                                </span>
                                            )}
                                        </span>
                                    </button>
                                </li>
                            ))}
                        </ul>
                    )}
                </div>
            </PopoverContent>
        </Popover>
    );
}
