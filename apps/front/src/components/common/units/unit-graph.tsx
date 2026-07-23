import { useEffect, useRef, type FC } from "react"
import { useAppSelector } from "@/store/hooks"
import { unitsSelectors } from "@/store/slices/unitsSlice"
import { HISTORY_LEN, selectUnitHistory } from "@/store/slices/unitsHistorySlice"
import { useSelector } from "react-redux";

const CHANNELS = [
    {
        key: 'ch_A' as const,
        label: 'CH · A',
        color: '#a78bfa', // violet-400
        wave: 'rgba(167,139,250,0.85)',
        glow: '#a78bfa',
    },
    {
        key: 'ch_B' as const,
        label: 'CH · B',
        color: '#60a5fa', // blue-400
        wave: 'rgba(96,165,250,0.85)',
        glow: '#60a5fa',
    },
] as const;

const PAD = 8;

function valToY(val: number, h: number) {
    return PAD + (h - PAD * 2) * (1 - val / 100);
}

function drawGrid(ctx: CanvasRenderingContext2D, w: number, h: number) {
    ctx.save();
    ctx.strokeStyle = 'rgba(255,255,255,0.04)';
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

    const canvasRef = useRef<HTMLCanvasElement>(null);

    const valA = unit?.ch_A ?? 0;
    const valB = unit?.ch_B ?? 0;

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d')!;
        const { width: w, height: h } = canvas;

        // Semi-transparent clear, subtle phosphor trail
        ctx.fillStyle = 'rgba(9,9,11,0.75)';
        ctx.fillRect(0, 0, w, h);

        drawGrid(ctx, w, h);
        drawWave(ctx, history.ch_A, CHANNELS[0].wave, CHANNELS[0].glow, w, h);
        drawWave(ctx, history.ch_B, CHANNELS[1].wave, CHANNELS[1].glow, w, h);
    }, [history]);

    if (!unit)
        return null;

    return (
        <div className="flex flex-col overflow-hidden rounded-md border border-white/[0.06] bg-zinc-950">
            <div className="flex items-center justify-between border-b border-white/[0.06] px-4 py-2">
                <span className="font-mono text-[11px] tracking-widest text-zinc-400 uppercase">
                    {unitId}
                </span>
                <div className="flex items-center gap-4">
                    {CHANNELS.map(({ label, color }) => (
                        <div key={label} className="flex items-center gap-1.5">
                            <span className="block h-[2px] w-3 rounded-full" style={{ background: color }} />
                            <span className="font-mono text-[10px] tracking-wider" style={{ color }}>
                                {label}
                            </span>
                        </div>
                    ))}
                </div>
            </div>

            <div className="relative bg-[#09090b]">
                <canvas
                    ref={canvasRef}
                    width={480}
                    height={100}
                    className="block w-full"
                />
                <div className="pointer-events-none absolute inset-x-0 top-0 h-3 bg-gradient-to-b from-[#09090b] to-transparent" />
                <div className="pointer-events-none absolute inset-x-0 bottom-0 h-3 bg-gradient-to-t from-[#09090b] to-transparent" />
            </div>

            <div className="grid grid-cols-2 divide-x divide-white/[0.06] border-t border-white/[0.06]">
                {CHANNELS.map(({ key, label, color }) => {
                    const val = key === 'ch_A' ? valA : valB;
                    return (
                        <div key={key} className="flex items-center justify-between px-2 py-2.5">
                            <div className="flex flex-col gap-1.5">
                                <span className="font-mono text-[10px] tracking-widest text-zinc-500 uppercase">
                                    {label}
                                </span>
                                <div className="h-[2px] w-20 overflow-hidden rounded-full bg-white/[0.06]">
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
