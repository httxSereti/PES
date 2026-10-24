import { cn } from "@pes/ui/lib/utils";
import type { FC } from "react";

type SectionHeadingProps = {
    label: string;
    meta?: string;
    className?: string;
};

export const SectionHeading: FC<SectionHeadingProps> = ({
    label,
    meta,
    className,
}) => (
    <div
        className={cn(
            "flex items-center justify-between gap-3 font-mono text-[8px] tracking-[0.14em] text-muted-foreground/50 uppercase",
            className,
        )}
    >
        <span>{label}</span>
        {meta && <span className="text-muted-foreground/35">{meta}</span>}
    </div>
);
