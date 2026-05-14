import {
    type RouteConfig,
    index,
    route,
} from "@react-router/dev/routes";

export default [

    route("app", "components/layout/app-layout.tsx", [
        index("pages/home.tsx"),
        route("units", "pages/app/units.tsx"),
        route("sensors", "pages/app/sensors.tsx"),

        route("events", "components/layout/events-layout.tsx", [
            index("pages/app/events/index.tsx")
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
