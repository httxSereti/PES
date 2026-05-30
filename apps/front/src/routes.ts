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
            index("pages/app/events/index.tsx"),

            ...prefix("trigger-rules", [
                index("pages/app/events/trigger-rules/index.tsx"),
                route("triggered", "pages/app/events/trigger-rules/triggered-rules.tsx"),
                route("new", "pages/app/events/trigger-rules/new.tsx"),
                route(":id/edit", "pages/app/events/trigger-rules/edit.tsx"),
            ]),
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
