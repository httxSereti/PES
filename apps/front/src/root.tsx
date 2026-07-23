import {
    Links,
    Meta,
    Outlet,
    Scripts,
    ScrollRestoration,
} from "react-router";

import { useEffect } from "react";

import { Toaster } from "@pes/ui/components/sonner"

import { ThemeProvider } from "@/components/layout/theme-provider";


import { Provider } from 'react-redux';
import { store } from '@/store';
import { verifyToken } from '@/store/slices/authSlice';
import { useAppDispatch } from "@/store/hooks";
import { WebSocketProvider } from "@/providers/WebSocketProvider";
import { TooltipProvider } from "@pes/ui/components/tooltip";

function AppInitializer({ children }: { children: React.ReactNode }) {
    const dispatch = useAppDispatch();

    useEffect(() => {
        // Verify token on app load
        if (typeof window !== 'undefined') {
            void dispatch(verifyToken());
        }
    }, [dispatch]);

    return <>{children}</>;
}

export function Layout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <html lang="en">
            <head>
                <meta charSet="UTF-8" />
                <meta
                    name="viewport"
                    content="width=device-width, initial-scale=1.0"
                />
                <Meta />
                <Links />
            </head>
            <body>
                <ThemeProvider defaultTheme="dark" storageKey="vite-ui-theme">
                    <TooltipProvider>
                        <Provider store={store}>
                            <AppInitializer>
                                <WebSocketProvider>
                                    {children}
                                    <Toaster />
                                </WebSocketProvider>
                            </AppInitializer>
                        </Provider>
                        <ScrollRestoration />
                        <Scripts />
                    </TooltipProvider>
                </ThemeProvider>
            </body>
        </html>
    );
}

export default function Root() {
    return <Outlet />;
}
