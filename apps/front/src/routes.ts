import {
    type RouteConfig,
    index,
    route,
    prefix,
} from "@react-router/dev/routes";

export default [

    route("app", "components/layout/app-layout.tsx", [
        index("pages/home.tsx"),
        route("units", "pages/app/units.tsx"),
        route("sensors", "pages/app/sensors.tsx"),

        route("events", "components/layout/events-layout.tsx", [
            index("pages/app/events/dashboard.tsx"),
            route("triggered", "pages/app/events/triggered-events.tsx"),

            ...prefix("trigger-rules", [
                index("pages/app/events/trigger-rules/index.tsx"),
                route("triggered", "pages/app/events/trigger-rules/triggered-rules.tsx"),
                route("new", "pages/app/events/trigger-rules/new.tsx"),
                route(":id/edit", "pages/app/events/trigger-rules/edit.tsx"),
            ]),
        ]),

        route("training", "components/layout/training-layout.tsx", [
            index("pages/app/training/overview.tsx"),
            route("live", "pages/app/training/live.tsx"),
            route("edging", "pages/app/training/edging/index.tsx"),
            route("edging/new", "pages/app/training/edging/new.tsx"),
            route("edging/:id", "pages/app/training/edging/session.tsx"),
        ]),

        // admin 
        route("admin", "components/layout/admin-layout.tsx", [
            index("pages/app/admin/dashboard.tsx"),
            route("users", "pages/app/admin/users.tsx"),
        ]),
    ]),

    route("auth", "pages/auth/sign.tsx"),

    route("*?", "catchall.tsx"),
] satisfies RouteConfig;
