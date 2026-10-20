import {
    Activity,
    KeyRound,
    Layers,
    ListFilter,
    Lock,
    LockOpen,
    Percent,
    Shield,
    SlidersHorizontal,
    Timer,
    type LucideIcon,
} from "lucide-react";

import { cn } from "@pes/ui/lib/utils";

import { ActionType } from "@/types/events.types";

import type { ActionCatalogEntry } from "./action-groups";
import { sourceMeta } from "./event-visuals";

const ACTION_ICONS: Record<string, LucideIcon> = {
    [ActionType.PROFILE]: Layers,
    [ActionType.LEVEL]: Activity,
    [ActionType.MULT]: Percent,
    [ActionType.CHASTER_TIME_UPDATE]: Timer,
    [ActionType.PURYFI_SET_ENABLED]: Shield,
    [ActionType.PURYFI_SET_LOCK]: Lock,
    [ActionType.PURYFI_SET_LOCK_TIMER]: Timer,
    [ActionType.PURYFI_ENTER_LOCK_PASSWORD]: KeyRound,
    [ActionType.PURYFI_EMERGENCY_UNLOCK]: LockOpen,
    [ActionType.PURYFI_UPDATE_WBLIST]: ListFilter,
};

export function actionIcon(type: string): LucideIcon {
    return ACTION_ICONS[type] ?? SlidersHorizontal;
}

export function ActionIcon({ type, className }: { type: string; className?: string }) {
    const Icon = actionIcon(type);
    return <Icon className={className} />;
}

export function ActionSourceBadge({ action }: { action: ActionCatalogEntry }) {
    const meta = sourceMeta(action.integrationId);
    return (
        <span
            className={cn(
                "inline-flex items-center rounded-md border px-2 py-0.5 font-mono text-[11px] font-medium uppercase tracking-wide",
                meta.badgeClass,
            )}
        >
            {action.integrationName}
        </span>
    );
}
