import { useAppSelector } from "@/store/hooks";
import {
    Navigate,
    Outlet,
} from "react-router";

export default function EventsLayout() {
    const { user, loading } = useAppSelector((state) => state.auth);

    if (loading) {
        return "Loading..."
    }

    if (!user) {
        return <Navigate to="/auth" replace />;
    }

    return (
        <Outlet />
    );
}

