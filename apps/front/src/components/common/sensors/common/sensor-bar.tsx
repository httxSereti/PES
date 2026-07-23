import type { FC } from "react";

type BarProps = {
    pct: number;
    isAlert?: boolean;
    isAmber?: boolean;
};

export const SensorBar: FC<BarProps> = ({ pct, isAlert, isAmber }) => {
    const safePct = Math.min(100, Math.max(0, pct));
    const bg = isAlert ? "#ef4444" : isAmber ? "#d97706" : "#8b5cf6";
    return (
        <div className="h-1.5 w-full rounded-full overflow-hidden bg-foreground/10">
            <div
                className="h-full rounded-full transition-all duration-500"
                style={{ width: `${safePct}%`, background: bg }}
            />
        </div>
    );
}