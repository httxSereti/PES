import { useAppSelector } from "@/store/hooks";
import { Link, Navigate, NavLink, Outlet } from "react-router";
import { Button } from "@pes/ui/components/button";
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
      <div className="px-5 mb-0 flex flex-wrap items-center gap-3">
        <div className="flex-col">
          <h1 className="font-syne text-xl sm:text-2xl lg:text-[26px] font-extrabold">
            Training
          </h1>
          <div className="text-muted-foreground text-xs">
            Edging sessions, goals &amp; performance
          </div>
        </div>
        <div className="ml-auto flex items-center gap-2">
          {liveSession && (
            <Button
              asChild
              variant="outline"
              size="sm"
              className="border-emerald-500/40 text-emerald-600 hover:bg-emerald-500/10 hover:text-emerald-600 dark:text-emerald-400"
            >
              <Link to={`/app/training/edging/${liveSession.id}`}>
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
                </span>
                <span className="max-w-40 truncate">
                  Live · {liveSession.name}
                </span>
              </Link>
            </Button>
          )}
          {hasPermission(user, Permission.TRAINING_EDGING_MANAGE) && (
            <Button asChild variant="outline" size="sm">
              <Link to="/app/training/edging/new">
                <Plus size={14} />
                <span>New session</span>
              </Link>
            </Button>
          )}
        </div>
      </div>

      {/* Tab bar */}
      <div className="px-5 border-b border-border mt-4 overflow-hidden">
        <nav
          className="flex items-center gap-1 min-w-max"
          aria-label="Training navigation"
        >
          {TABS.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              id={`tab-training-${label.toLowerCase().replace(/\s+/g, "-")}`}
              className={({ isActive }) =>
                `flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px select-none whitespace-nowrap ${
                  isActive
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
