import { useAppSelector } from "@/store/hooks";
import { useEffect, useRef } from "react";
import { Link, Navigate, Outlet, useLocation } from "react-router";
import { Activity, History, LayoutDashboard, Plus, Zap } from "lucide-react";
import { Button } from "@pes/ui/components/button";

const TABS = [
    { to: "/app/events", label: "Dashboard", icon: LayoutDashboard, end: true },
    { to: "/app/events/triggered", label: "Triggered Events", icon: Activity, end: false },
    { to: "/app/events/trigger-rules", label: "Trigger Rules", icon: Zap, end: false },
    { to: "/app/events/trigger-rules/triggered", label: "Rule History", icon: History, end: true },
] as const;

/** History is a child route of trigger rules, so it must win the active state. */
function isTabActive(pathname: string, to: string, end: boolean): boolean {
    if (to === "/app/events/trigger-rules") {
        return (
            pathname === to ||
            (pathname.startsWith(`${to}/`) && !pathname.startsWith(`${to}/triggered`))
        );
    }
    return end ? pathname === to : pathname.startsWith(to);
}

export default function EventsLayout() {
    const { user, loading } = useAppSelector((state) => state.auth);
    const eventsCount = useAppSelector(state => state.events.events.length);
    const { pathname } = useLocation();
    const activeTabRef = useRef<HTMLAnchorElement>(null);

    // On narrow screens the tab bar scrolls; keep the active tab visible.
    useEffect(() => {
        activeTabRef.current?.scrollIntoView({ block: "nearest", inline: "nearest" });
    }, [pathname]);

    if (loading)
        return "Loading...";

    if (!user)
        return <Navigate to="/auth" replace />;

    return (
        <div className="space-y-0">
            {/* Page header */}
            <div className="px-5 mb-0 flex justify-between items-center gap-4">
                <div className="flex-col">
                    <h1 className="font-syne text-xl sm:text-2xl lg:text-[26px] font-extrabold">
                        Events
                    </h1>
                    <div className="text-muted-foreground text-xs">Realtime event stream &amp; trigger rules</div>
                </div>
                <div className="ml-auto flex items-center gap-2">
                    <div className="flex items-center gap-2 px-3 py-1.5 rounded-md accent-tile text-xs text-muted-foreground/70">
                        <span>{eventsCount}</span>
                        <Activity size={11} className="accent-tile-icon" />
                    </div>
                    <Button asChild variant="outline" size="sm">
                        <Link to="/app/events/trigger-rules/new">
                            <Plus size={14} />
                            <span>New trigger rule</span>
                        </Link>
                    </Button>
                </div>
            </div>

            {/* Tab bar */}
            <div className="px-5 border-b border-border mt-4">
                <nav
                    className="flex items-center gap-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
                    aria-label="Events navigation"
                >
                    {TABS.map(({ to, label, icon: Icon, end }) => {
                        const active = isTabActive(pathname, to, end);
                        return (
                            <Link
                                key={to}
                                to={to}
                                ref={active ? activeTabRef : undefined}
                                id={`tab-events-${label.toLowerCase().replace(/\s+/g, "-")}`}
                                aria-current={active ? "page" : undefined}
                                className={`flex shrink-0 items-center gap-2 whitespace-nowrap px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px select-none ${active
                                    ? "border-violet-500 text-violet-600 dark:text-violet-300"
                                    : "border-transparent text-muted-foreground/60 hover:text-foreground hover:border-foreground/25"
                                }`}
                            >
                                <Icon size={13} />
                                {label}
                            </Link>
                        );
                    })}
                </nav>
            </div>

            {/* Page content */}
            <div className="pt-5">
                <Outlet />
            </div>
        </div>
    );
}
