import type { LucideIcon } from "lucide-react";

import { Switch } from "@pes/ui/components/switch";
import { cn } from "@pes/ui/lib/utils";

type SwitchRowProps = {
    icon: LucideIcon;
    label: string;
    description: string;
    checked: boolean;
    onCheckedChange: (checked: boolean) => void;
    disabled?: boolean;
    className?: string;
};

export function SwitchRow({
    icon: Icon,
    label,
    description,
    checked,
    onCheckedChange,
    disabled,
    className,
}: SwitchRowProps) {
    return (
        <div className={cn("flex items-center justify-between gap-3 border-border/60 py-3", className)}>
            <div className="flex min-w-0 flex-1 items-start gap-3">
                <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted">
                    <Icon className="size-4 text-muted-foreground" />
                </span>
                <div className="min-w-0">
                    <p className="text-sm font-medium">{label}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
                </div>
            </div>
            <Switch checked={checked} onCheckedChange={onCheckedChange} disabled={disabled} className="shrink-0" />
        </div>
    );
}
