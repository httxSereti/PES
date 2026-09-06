import {
    Navigate,
    Outlet,
    useMatches,
    type UIMatch
} from "react-router";

import { SidebarInset, SidebarProvider } from "@pes/ui/components/sidebar"
import { AppHeader } from "@/components/layout/headers/common/app-header";
import { AppSidebar } from "@/components/layout/sidebar/app-sidebar";
import type { RouteHandle } from "@/types/route-handle";
import { SensorHeader } from "@/components/layout/headers/sensors/header";
import { AdminUsersHeader } from "@/components/layout/headers/admin/users/header";
import { useAppSelector } from "@/store/hooks";

export default function AppLayout() {
    const matches = useMatches() as UIMatch<unknown, RouteHandle>[];
    const currentRoute = matches[matches.length - 1];
    const headerType = currentRoute?.handle?.header;
    const { user, token, loading } = useAppSelector((state) => state.auth);

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

