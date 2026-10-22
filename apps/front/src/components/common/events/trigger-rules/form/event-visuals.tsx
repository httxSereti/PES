import { Blocks, Cpu, ImageOff, Lock, Radio, Shield, type LucideIcon } from "lucide-react";

import { cn } from "@pes/ui/lib/utils";

import type { EventCatalogEvent } from "@/components/common/events/event-groups";

type SourceMeta = {
    label: string;
    icon: LucideIcon;
    iconClass: string;
    tileClass: string;
    badgeClass: string;
};

const SOURCE_META: Record<string, SourceMeta> = {
    chaster: {
        label: "Chaster",
        icon: Lock,
        iconClass: "text-amber-600 dark:text-amber-400",
        tileClass: "border-amber-500/25 bg-amber-500/10",
        badgeClass: "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300",
    },
    sensors: {
        label: "Sensors",
        icon: Radio,
        iconClass: "text-teal-600 dark:text-teal-400",
        tileClass: "border-teal-500/25 bg-teal-500/10",
        badgeClass: "border-teal-500/30 bg-teal-500/10 text-teal-700 dark:text-teal-300",
    },
    puryfi: {
        label: "PuryFi",
        icon: Shield,
        iconClass: "text-pink-600 dark:text-pink-400",
        tileClass: "border-pink-500/25 bg-pink-500/10",
        badgeClass: "border-pink-500/30 bg-pink-500/10 text-pink-700 dark:text-pink-300",
    },
    units: {
        label: "Units",
        icon: Cpu,
        iconClass: "text-violet-600 dark:text-violet-400",
        tileClass: "border-violet-500/25 bg-violet-500/10",
        badgeClass: "border-violet-500/30 bg-violet-500/10 text-violet-700 dark:text-violet-300",
    },
};

export function sourceMeta(integrationId: string): SourceMeta {
    return (
        SOURCE_META[integrationId] ?? {
            label: integrationId,
            icon: Blocks,
            iconClass: "text-muted-foreground",
            tileClass: "border-border bg-muted/40",
            badgeClass: "border-border bg-muted/40 text-muted-foreground",
        }
    );
}

export function EventSourceIcon({
    integrationId,
    className,
    iconClassName,
}: {
    integrationId: string;
    className?: string;
    iconClassName?: string;
}) {
    const meta = sourceMeta(integrationId);
    const Icon = meta.icon;
    return (
        <span
            className={cn(
                "inline-flex size-8 shrink-0 items-center justify-center rounded-lg border",
                meta.tileClass,
                className,
            )}
        >
            <Icon className={cn("size-4", meta.iconClass, iconClassName)} />
        </span>
    );
}

export function EventSourceBadge({ integrationId }: { integrationId: string }) {
    const meta = sourceMeta(integrationId);
    return (
        <span
            className={cn(
                "inline-flex items-center rounded-md border px-1.5 py-0.5 font-mono text-[9px] font-medium uppercase tracking-wide",
                meta.badgeClass,
            )}
        >
            {meta.label}
        </span>
    );
}

export function EventMedia({
    event,
    className,
    iconClassName,
    showEmptyLabel = false,
    fit = "cover",
}: {
    event: EventCatalogEvent;
    className?: string;
    iconClassName?: string;
    showEmptyLabel?: boolean;
    fit?: "cover" | "contain";
}) {
    if (event.imageUrl) {
        return (
            <span className={cn("relative block overflow-hidden rounded-lg bg-black/30", className)}>
                <img
                    src={event.imageUrl}
                    alt=""
                    loading="lazy"
                    className={cn("size-full", fit === "contain" ? "object-contain" : "object-cover")}
                />
            </span>
        );
    }

    const meta = sourceMeta(event.integrationId);
    const Icon = event.integrationId === "puryfi" ? ImageOff : meta.icon;

    return (
        <span
            className={cn(
                "flex flex-col items-center justify-center rounded-lg border",
                showEmptyLabel
                    ? "gap-2 border-border/60 bg-gradient-to-br from-muted/30 via-background to-muted/20"
                    : cn("gap-1", meta.tileClass),
                className,
            )}
        >
            <Icon
                className={cn(
                    showEmptyLabel ? "size-12 text-muted-foreground/25" : "size-5",
                    !showEmptyLabel && meta.iconClass,
                    iconClassName,
                )}
            />
            {showEmptyLabel && (
                <span className="px-2 text-center text-[9px] leading-tight text-muted-foreground/50">
                    No preview available
                </span>
            )}
        </span>
    );
}
