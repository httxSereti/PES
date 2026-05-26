import { useAppSelector } from "@/store/hooks";
import { Link, Navigate, NavLink, Outlet } from "react-router";
import { Activity, Zap, } from "lucide-react";

const TABS = [
    { to: "/app/events", label: "Events", icon: Activity, end: true },
    { to: "/app/events/trigger-rules", label: "Trigger Rules", icon: Zap, end: false },
] as const;

export default function EventsLayout() {
    const { user, loading } = useAppSelector((state) => state.auth);
    const eventsCount = useAppSelector(state => state.events.events.length);

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
                    <div className="flex items-center gap-2 px-3 py-1.5 rounded-md bg-[#161226] border border-purple-800/40 text-xs text-muted-foreground/70">
                        <span>{eventsCount}</span>
                        <Activity size={11} className="text-violet-400" />
                    </div>
                    <Link to="/app/events/trigger-rules/new" className="flex items-center gap-2 px-3 py-1.5 rounded-md bg-[#161226] border border-purple-800/40 text-xs text-muted-foreground/70">
                        <Zap size={11} className="text-violet-400" />
                        <span>New TriggerRule</span>
                    </Link>
                </div>
            </div>

            {/* Tab bar */}
            <div className="px-5 border-b border-white/8 mt-4">
                <nav className="flex items-center gap-1" aria-label="Events navigation">
                    {TABS.map(({ to, label, icon: Icon, end }) => (
                        <NavLink
                            key={to}
                            to={to}
                            end={end}
                            id={`tab-events-${label.toLowerCase().replace(/\s+/g, "-")}`}
                            className={({ isActive }) =>
                                `flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px select-none ${isActive
                                    ? "border-violet-500 text-violet-300"
                                    : "border-transparent text-muted-foreground/60 hover:text-slate-300 hover:border-white/20"
                                }`
                            }
                        >
                            <Icon size={13} />
                            {label}
                        </NavLink>
                    ))}
                </nav>
            </div>

            {/* Page content */}
            <div className="pt-5">
                <Outlet />
            </div>
        </div>
    );
}
