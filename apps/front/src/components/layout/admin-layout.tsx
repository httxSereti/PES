import { useAppSelector } from "@/store/hooks";
import { hasPermission } from "@/lib/permissions";
import { Permission } from "@/types";
import {
    Navigate,
    Outlet,
} from "react-router";

export default function AdminLayout() {
    const { user, loading } = useAppSelector((state) => state.auth);

    if (loading) {
        return "Loading..."
    }

    if (!hasPermission(user, Permission.ADMIN)) {
        return <Navigate to="/app" replace />;
    }

    return (
        <Outlet />
    );
}

