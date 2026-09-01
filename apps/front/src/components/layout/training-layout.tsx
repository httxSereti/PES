import { useAppSelector } from "@/store/hooks";
import { Link, Navigate, NavLink, Outlet } from "react-router";
import { Flame, LayoutDashboard, Plus, Radio } from "lucide-react";

import { hasPermission } from "@/lib/permissions";
import { Permission } from "@/types";

const TABS = [
    { to: "/app/training", label: "Overview", icon: LayoutDashboard, end: true },
    { to: "/app/training/live", label: "Live", icon: Radio, end: false },
    { to: "/app/training/edging", label: "Edging", icon: Flame, end: false },
] as const;

export default function TrainingLayout() {
    const { user, loading } = useAppSelector((state) => state.auth);
    const liveSession = useAppSelector((state) => state.training.liveSession);

    if (loading) return "Loading...";

    if (!user) return <Navigate to="/auth" replace />;

    return (
        <div className="space-y-0">
            {/* Page header */}
            <div className="px-5 mb-0 flex justify-between items-center gap-4">
                <div className="flex-col">
                    <h1 className="font-syne text-xl sm:text-2xl lg:text-[26px] font-extrabold">
                        Training
                    </h1>
                    <div className="text-muted-foreground text-xs">Edging sessions, goals &amp; performance</div>
                </div>
                <div className="ml-auto flex items-center gap-2">
                    {liveSession && (
                        <Link
                            to={`/app/training/edging/${liveSession.id}`}
                            className="flex items-center gap-2 px-3 py-1.5 rounded-md accent-tile text-xs text-muted-foreground/70"
                        >
                            <span className="relative flex h-2 w-2">
                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
                            </span>
                            <span>Live · {liveSession.name}</span>
                        </Link>
                    )}
                    {hasPermission(user, Permission.TRAINING_EDGING_MANAGE) && (
                        <Link
                            to="/app/training/edging/new"
                            className="flex items-center gap-2 px-3 py-1.5 rounded-md accent-tile text-xs text-muted-foreground/70"
                        >
                            <Plus size={11} className="accent-tile-icon" />
                            <span>New Session</span>
                        </Link>
                    )}
                </div>
            </div>

            {/* Tab bar */}
            <div className="px-5 border-b border-border mt-4">
                <nav className="flex items-center gap-1" aria-label="Training navigation">
                    {TABS.map(({ to, label, icon: Icon, end }) => (
                        <NavLink
                            key={to}
                            to={to}
                            end={end}
                            id={`tab-training-${label.toLowerCase().replace(/\s+/g, "-")}`}
                            className={({ isActive }) =>
                                `flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px select-none ${isActive
                                    ? "border-violet-500 text-violet-600 dark:text-violet-300"
                                    : "border-transparent text-muted-foreground/60 hover:text-foreground hover:border-foreground/25"
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
