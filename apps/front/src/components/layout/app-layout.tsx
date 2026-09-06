import {
    Navigate,
    Outlet,
    useMatches,
    type UIMatch
} from "react-router";

import { useEffect, useRef } from "react";
import { SidebarInset, SidebarProvider } from "@pes/ui/components/sidebar"
import { AppHeader } from "@/components/layout/headers/common/app-header";
import { AppSidebar } from "@/components/layout/sidebar/app-sidebar";
import { SessionSettingsModal } from "@/components/common/session/session-settings-modal";
import type { RouteHandle } from "@/types/route-handle";
import { SensorHeader } from "@/components/layout/headers/sensors/header";
import { AdminUsersHeader } from "@/components/layout/headers/admin/users/header";
import { hasPermission } from "@/lib/permissions";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import {
    autoOpenSessionSettings,
    resetSessionSettings,
} from "@/store/slices/sessionSlice";
import { Permission } from "@/types";

export default function AppLayout() {
    const matches = useMatches() as UIMatch<unknown, RouteHandle>[];
    const currentRoute = matches[matches.length - 1];
    const headerType = currentRoute?.handle?.header;
    const { user, token, loading } = useAppSelector((state) => state.auth);
    const session = useAppSelector((state) => state.session);
    const dispatch = useAppDispatch();
    const prevUserId = useRef<string | null>(null);

    const canManageSession = hasPermission(user, Permission.SESSION_MANAGE);

    // New login: let the settings modal auto-open again
    useEffect(() => {
        if (user?.id !== prevUserId.current) {
            prevUserId.current = user?.id ?? null;
            dispatch(resetSessionSettings());
        }
    }, [user, dispatch]);

    // Auto-open the session settings modal for the HOST right after login,
    // once the connect snapshot arrived and no session is running.
    useEffect(() => {
        if (
            canManageSession &&
            session.initialized &&
            !session.activeSession &&
            !session.autoOpenHandled
        ) {
            dispatch(autoOpenSessionSettings());
        }
    }, [
        canManageSession,
        session.initialized,
        session.activeSession,
        session.autoOpenHandled,
        dispatch,
    ]);

    // Wait for the startup verifyToken round-trip before deciding
    if (loading || (token && !user)) {
        return "Loading...";
    }

    if (!user) {
        return <Navigate to="/auth" replace />;
    }

    const renderHeader = () => {
        switch (headerType) {
            case "sensors":
                return <SensorHeader />;
            case "adminUsers":
                return <AdminUsersHeader />
            default:
                return <AppHeader />;
        }
    };

    return (
        <SidebarProvider
            style={
                {
                    "--sidebar-width": "244px",
                    "--header-height": "calc(var(--spacing) * 12)",
                } as React.CSSProperties
            }
        >
            <AppSidebar />
            <SessionSettingsModal />
            <SidebarInset>
                {renderHeader()}
                <div className="flex flex-1 flex-col">
                    <div className="@container/main flex flex-1 flex-col gap-2">
                        <div className="flex flex-col gap-4 py-4 md:gap-6 md:py-6">
                            <Outlet />
                        </div>
                    </div>
                </div>
            </SidebarInset>
        </SidebarProvider>
    );
}
