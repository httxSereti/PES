import { useMemo } from "react";
import { ArrowRight, KeyRound, Users, UsersRound, Zap } from "lucide-react";
import { Link } from "react-router";
import type { Route } from ".react-router/types/src/pages/app/admin/+types/dashboard";
import { useAdminUsers } from "@/hooks/useAdminUsers";
import { formatDateTime } from "@/lib/format-date";
import type { AdminUser } from "@/types/admin.types";
import { AddUser } from "@/components/layout/headers/admin/users/add-user";
import { Card, CardContent, CardHeader, CardTitle } from "@pes/ui/components/card";

// eslint-disable-next-line no-empty-pattern
export function meta({ }: Route.MetaArgs) {
    return [
        { title: "PES | Admin - Dashboard" },
        { name: "description", content: "Administration overview" },
    ];
}

function StatCard({ icon, value, label, sub }: {
    icon: React.ReactNode;
    value: React.ReactNode;
    label: string;
    sub?: React.ReactNode;
}) {
    return (
        <Card>
            <CardContent className="flex items-center gap-3.5 p-4">
                <div className="p-2.5 rounded-lg accent-tile shrink-0">
                    {icon}
                </div>
                <div className="min-w-0">
                    <div className="text-xl font-extrabold font-syne leading-tight text-foreground tabular-nums">{value}</div>
                    <div className="text-[11px] uppercase tracking-widest text-muted-foreground/50">{label}</div>
                    {sub && <div className="text-xs text-muted-foreground/70 mt-0.5">{sub}</div>}
                </div>
            </CardContent>
        </Card>
    );
}

function RecentLoginRow({ user }: { user: AdminUser }) {
    return (
        <div className="flex items-center gap-3 py-2 border-b border-border/40 last:border-b-0">
            <span
                className={`h-1.5 w-1.5 rounded-full shrink-0 ${user.is_online ? "bg-emerald-500" : "bg-muted-foreground/25"}`}
                title={user.is_online ? "Online" : "Offline"}
            />
            <span className="font-mono text-xs text-foreground truncate">
                {user.display_name ?? user.id}
            </span>
            <span className="ml-auto font-mono text-[10px] text-muted-foreground/50 uppercase tracking-wide shrink-0">
                {user.role}
            </span>
            <span className="font-mono text-[10px] text-muted-foreground/50 whitespace-nowrap tabular-nums hidden sm:inline">
                {formatDateTime(user.last_login_at)}
            </span>
        </div>
    );
}

export default function AdminDashboardPage() {
    const { users } = useAdminUsers();

    const recentLogins = useMemo(() => {
        if (!users) return [];
        return [...users]
            .filter(u => u.last_login_at)
            .sort((a, b) => (b.last_login_at ?? "").localeCompare(a.last_login_at ?? ""))
            .slice(0, 5);
    }, [users]);

    const onlineCount = users?.filter(u => u.is_online).length ?? 0;

    return (
        <div className="space-y-4 px-4 md:px-5">
            {/* Stats */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                <StatCard
                    icon={<Users size={16} className="accent-tile-icon" />}
                    value={users?.length ?? "—"}
                    label="Total users"
                    sub={
                        <Link to="/app/admin/users" className="text-violet-600 dark:text-violet-400 hover:underline underline-offset-2">
                            manage users
                        </Link>
                    }
                />
                <StatCard
                    icon={<UsersRound size={16} className="accent-tile-icon" />}
                    value={users ? onlineCount : "—"}
                    label="Online now"
                    sub={<span>live WebSocket connections</span>}
                />
                <Link to="/app/admin/users" className="group">
                    <Card className="h-full transition-colors group-hover:border-violet-500/40">
                        <CardContent className="flex items-center gap-3.5 p-4">
                            <div className="p-2.5 rounded-lg accent-tile shrink-0">
                                <KeyRound size={16} className="accent-tile-icon" />
                            </div>
                            <div>
                                <div className="text-sm font-semibold text-foreground leading-tight">Roles &amp; permissions</div>
                                <div className="text-xs text-muted-foreground/70 mt-0.5">Edit per-user access</div>
                            </div>
                            <ArrowRight size={14} className="ml-auto text-muted-foreground/40 group-hover:text-violet-500 transition-colors" />
                        </CardContent>
                    </Card>
                </Link>
            </div>

            {/* Recent activity */}
            <Card>
                <CardHeader className="flex flex-row justify-between items-center pb-3">
                    <CardTitle className="flex items-center gap-2 text-sm">
                        <Zap size={13} className="accent-tile-icon" />
                        Last logins
                        <span className="text-[10px] uppercase tracking-widest text-muted-foreground/50 font-normal">top 5</span>
                    </CardTitle>
                    <AddUser />
                </CardHeader>
                <CardContent className="pt-0">
                    {!users ? (
                        <p className="py-8 text-center text-sm text-muted-foreground/40 italic">Loading...</p>
                    ) : recentLogins.length === 0 ? (
                        <p className="py-8 text-center text-sm text-muted-foreground/40 italic">No logins recorded yet</p>
                    ) : (
                        <div>
                            {recentLogins.map(user => <RecentLoginRow key={user.id} user={user} />)}
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
