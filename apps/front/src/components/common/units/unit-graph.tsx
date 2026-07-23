import { useEffect, useRef, type FC } from "react"
import { useAppSelector } from "@/store/hooks"
import { unitsSelectors } from "@/store/slices/unitsSlice"
import { HISTORY_LEN, selectUnitHistory } from "@/store/slices/unitsHistorySlice"
import { useSelector } from "react-redux";
import { useTheme } from "@/components/layout/theme-provider";

type ChannelColors = {
    color: string;
    wave: string;
    glow: string;
};

const CHANNEL_META = [
    { key: 'ch_A' as const, label: 'CH · A' },
    { key: 'ch_B' as const, label: 'CH · B' },
] as const;

const CHANNEL_COLORS: Record<"dark" | "light", [ChannelColors, ChannelColors]> = {
    dark: [
        { color: '#a78bfa', wave: 'rgba(167,139,250,0.85)', glow: '#a78bfa' }, // violet-400
        { color: '#60a5fa', wave: 'rgba(96,165,250,0.85)', glow: '#60a5fa' }, // blue-400
    ],
    light: [
        { color: '#7c3aed', wave: 'rgba(124,58,237,0.85)', glow: '#7c3aed' }, // violet-600
        { color: '#2563eb', wave: 'rgba(37,99,235,0.85)', glow: '#2563eb' }, // blue-600
    ],
};

const CANVAS_PAINT = {
    dark: { trail: 'rgba(9,9,11,0.75)', grid: 'rgba(255,255,255,0.04)' }, // zinc-950 base
    light: { trail: 'rgba(250,250,250,0.8)', grid: 'rgba(0,0,0,0.07)' }, // zinc-50 base
} as const;

const PAD = 8;

function valToY(val: number, h: number) {
    return PAD + (h - PAD * 2) * (1 - val / 100);
}

function drawGrid(ctx: CanvasRenderingContext2D, w: number, h: number, gridColor: string) {
    ctx.save();
    ctx.strokeStyle = gridColor;
    ctx.lineWidth = 1;
    [0, 25, 50, 75, 100].forEach((v) => {
        const y = valToY(v, h);
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(w, y);
        ctx.stroke();
    });
    ctx.setLineDash([2, 6]);
    for (let i = 1; i < 4; i++) {
        const x = (w / 4) * i;
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, h);
        ctx.stroke();
    }
    ctx.restore();
}

function drawWave(
    ctx: CanvasRenderingContext2D,
    history: number[],
    color: string,
    glow: string,
    w: number,
    h: number,
) {
    if (history.length < 2) return;
    const step = w / (HISTORY_LEN - 1);
    const offset = HISTORY_LEN - history.length;

    ctx.save();
    ctx.beginPath();
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.shadowColor = glow;
    ctx.shadowBlur = 5;
    history.forEach((val, i) => {
        const x = (offset + i) * step;
        const y = valToY(val, h);
        // eslint-disable-next-line @typescript-eslint/no-unused-expressions
        i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    });
    ctx.stroke();
    ctx.restore();
}


type UnitGraphProps = {
    unitId: string;
};

export const UnitGraph: FC<UnitGraphProps> = ({ unitId }) => {
    const unit = useAppSelector(state => unitsSelectors.selectById(state, unitId));
    const history = useSelector(selectUnitHistory(unitId));
    const { theme } = useTheme();

    const canvasRef = useRef<HTMLCanvasElement>(null);

    const valA = unit?.ch_A ?? 0;
    const valB = unit?.ch_B ?? 0;

    const resolvedTheme: "dark" | "light" =
        theme === "system"
            ? (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light")
            : theme;

    const channelColors = CHANNEL_COLORS[resolvedTheme];
    const channels = CHANNEL_META.map((meta, i) => ({ ...meta, ...channelColors[i] }));

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d')!;
        const { width: w, height: h } = canvas;
        const paint = CANVAS_PAINT[resolvedTheme];

        // Semi-transparent clear, subtle phosphor trail
        ctx.fillStyle = paint.trail;
        ctx.fillRect(0, 0, w, h);

        drawGrid(ctx, w, h, paint.grid);
        drawWave(ctx, history.ch_A, channelColors[0].wave, channelColors[0].glow, w, h);
        drawWave(ctx, history.ch_B, channelColors[1].wave, channelColors[1].glow, w, h);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [history, resolvedTheme]);

    if (!unit)
        return null;

    return (
        <div className="flex flex-col overflow-hidden rounded-md border border-border/60 bg-zinc-50 dark:bg-zinc-950">
            <div className="flex items-center justify-between border-b border-border/60 px-4 py-2">
                <span className="font-mono text-[11px] tracking-widest text-muted-foreground uppercase">
                    {unitId}
                </span>
                <div className="flex items-center gap-4">
                    {channels.map(({ label, color }) => (
                        <div key={label} className="flex items-center gap-1.5">
                            <span className="block h-[2px] w-3 rounded-full" style={{ background: color }} />
                            <span className="font-mono text-[10px] tracking-wider" style={{ color }}>
                                {label}
                            </span>
                        </div>
                    ))}
                </div>
            </div>

            <div className="relative bg-zinc-50 dark:bg-zinc-950">
                <canvas
                    ref={canvasRef}
                    width={480}
                    height={100}
                    className="block w-full"
                />
                <div className="pointer-events-none absolute inset-x-0 top-0 h-3 bg-gradient-to-b from-zinc-50 dark:from-zinc-950 to-transparent" />
                <div className="pointer-events-none absolute inset-x-0 bottom-0 h-3 bg-gradient-to-t from-zinc-50 dark:from-zinc-950 to-transparent" />
            </div>

            <div className="grid grid-cols-2 divide-x divide-border/60 border-t border-border/60">
                {channels.map(({ key, label, color }) => {
                    const val = key === 'ch_A' ? valA : valB;
                    return (
                        <div key={key} className="flex items-center justify-between px-2 py-2.5">
                            <div className="flex flex-col gap-1.5">
                                <span className="font-mono text-[10px] tracking-widest text-muted-foreground uppercase">
                                    {label}
                                </span>
                                <div className="h-[2px] w-20 overflow-hidden rounded-full bg-foreground/10">
                                    <div
                                        className="h-full rounded-full transition-[width] duration-75 ease-linear"
                                        style={{ width: `${val}%`, background: color }}
                                    />
                                </div>
                            </div>
                            <span
                                className="font-mono text-2xl font-semibold tabular-nums leading-none"
                                style={{ color }}
                            >
                                {String(val).padStart(3, '0')}
                            </span>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
