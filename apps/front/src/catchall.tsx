import { Link } from "react-router";

import { useAppSelector } from "@/store/hooks";
import { Button } from "@pes/ui/components/button";

export default function Component() {
    const isAuthenticated = useAppSelector((state) => state.auth.isAuthenticated);

    return (
        <div className="flex min-h-screen flex-col items-center justify-center gap-6 px-6 text-center">
            <div className="space-y-2">
                <p className="font-syne text-7xl font-extrabold tracking-tight">404</p>
                <h1 className="text-xl font-semibold">Page not found</h1>
                <p className="text-muted-foreground text-sm">
                    The page you are looking for doesn&apos;t exist or has been moved.
                </p>
            </div>
            <Button asChild>
                <Link to={isAuthenticated ? "/app" : "/auth"}>
                    {isAuthenticated ? "Go to app" : "Sign in"}
                </Link>
            </Button>
        </div>
    );
}
