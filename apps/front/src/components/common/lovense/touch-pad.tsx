import { useRef, useState, type PointerEvent, type KeyboardEvent } from "react";
import { Hand, Move, Waves } from "lucide-react";

import { cn } from "@pes/ui/lib/utils";
import { clampIntensity, outputKey, type PlayerOutput } from "./player-utils";

interface TouchPadProps {
    outputs: PlayerOutput[];
    values: Record<string, number>;
    disabled?: boolean;
    releaseToZero: boolean;
    onChange: (output: PlayerOutput, value: number) => void;
    onRelease: (cancelled: boolean) => void;
    immersive?: boolean;
}

export function TouchPad({
    outputs,
    values,
    disabled = false,
    releaseToZero,
    onChange,
    onRelease,
    immersive = false,
}: TouchPadProps) {
    const padRef = useRef<HTMLDivElement>(null);
    const pointerIdRef = useRef<number | null>(null);
    const [touching, setTouching] = useState(false);
    const primary = outputs[0];
    const secondary = outputs[1];
    const primaryValue = primary
        ? (values[
              outputKey(primary.deviceId, primary.featureIndex, primary.output)
          ] ?? 0)
        : 0;
    const secondaryValue = secondary
        ? (values[
              outputKey(
                  secondary.deviceId,
                  secondary.featureIndex,
                  secondary.output,
              )
          ] ?? 0)
        : 0;
    const x =
        secondary && secondary.cap > 0
            ? (secondaryValue / secondary.cap) * 100
            : 50;
    const y =
        primary && primary.cap > 0
            ? 100 - (primaryValue / primary.cap) * 100
            : 100;

    const update = (event: PointerEvent<HTMLDivElement>) => {
        if (!primary || disabled) return;
        const bounds = padRef.current?.getBoundingClientRect();
        if (!bounds || bounds.width <= 0 || bounds.height <= 0) return;
        const horizontal = Math.max(
            0,
            Math.min(1, (event.clientX - bounds.left) / bounds.width),
        );
        const vertical = Math.max(
            0,
            Math.min(1, 1 - (event.clientY - bounds.top) / bounds.height),
        );
        onChange(primary, clampIntensity(vertical * primary.cap, primary.cap));
        if (secondary) {
            onChange(
                secondary,
                clampIntensity(horizontal * secondary.cap, secondary.cap),
            );
        }
    };

    const start = (event: PointerEvent<HTMLDivElement>) => {
        if (disabled || pointerIdRef.current !== null) return;
        event.preventDefault();
        pointerIdRef.current = event.pointerId;
        event.currentTarget.setPointerCapture(event.pointerId);
        setTouching(true);
        update(event);
    };

    const move = (event: PointerEvent<HTMLDivElement>) => {
        if (pointerIdRef.current !== event.pointerId) return;
        event.preventDefault();
        update(event);
    };

    const finish = (event: PointerEvent<HTMLDivElement>, cancelled = false) => {
        if (pointerIdRef.current !== event.pointerId) return;
        pointerIdRef.current = null;
        setTouching(false);
        if (event.currentTarget.hasPointerCapture(event.pointerId)) {
            event.currentTarget.releasePointerCapture(event.pointerId);
        }
        if (cancelled || releaseToZero) onRelease(cancelled);
    };

    const keyboard = (event: KeyboardEvent<HTMLDivElement>) => {
        if (!primary || disabled) return;
        const step = event.shiftKey ? 10 : 2;
        let handled = true;
        if (event.key === "ArrowUp")
            onChange(primary, clampIntensity(primaryValue + step, primary.cap));
        else if (event.key === "ArrowDown")
            onChange(primary, clampIntensity(primaryValue - step, primary.cap));
        else if (secondary && event.key === "ArrowRight")
            onChange(
                secondary,
                clampIntensity(secondaryValue + step, secondary.cap),
            );
        else if (secondary && event.key === "ArrowLeft")
            onChange(
                secondary,
                clampIntensity(secondaryValue - step, secondary.cap),
            );
        else if (event.key === "Escape") onRelease(true);
        else handled = false;
        if (handled) event.preventDefault();
    };

    return (
        <div className="space-y-3">
            <div
                ref={padRef}
                tabIndex={disabled ? -1 : 0}
                role="group"
                aria-label={`Touch control. Vertical: ${primary?.label ?? "none"}.${secondary ? ` Horizontal: ${secondary.label}.` : ""}`}
                aria-disabled={disabled}
                onPointerDown={start}
                onPointerMove={move}
                onPointerUp={(event) => finish(event)}
                onPointerCancel={(event) => finish(event, true)}
                onKeyDown={keyboard}
                className={cn(
                    "relative isolate min-h-[340px] w-full touch-none select-none overflow-hidden rounded-[28px] border border-violet-500/25 bg-[#100d18] outline-none transition-shadow focus-visible:ring-2 focus-visible:ring-violet-500 dark:bg-[#0d0a14]",
                    immersive && "min-h-0 flex-1 rounded-[32px]",
                    disabled && "pointer-events-none opacity-45",
                    touching &&
                        "border-violet-400/70 shadow-[0_0_60px_rgba(168,85,247,0.2)]",
                )}
            >
                <div
                    className="absolute inset-0 opacity-30"
                    style={{
                        backgroundImage:
                            "linear-gradient(rgba(168,85,247,.16) 1px, transparent 1px), linear-gradient(90deg, rgba(168,85,247,.16) 1px, transparent 1px)",
                        backgroundSize: "12.5% 12.5%",
                    }}
                />
                <div
                    className="absolute inset-0 transition-opacity duration-200"
                    style={{
                        opacity: 0.12 + (primaryValue / 100) * 0.65,
                        background:
                            "radial-gradient(circle at 50% 80%, rgba(236,72,153,.42), transparent 48%), radial-gradient(circle at 50% 100%, rgba(124,58,237,.42), transparent 70%)",
                    }}
                />

                <div className="absolute inset-x-0 top-0 z-10 flex items-start justify-between p-5">
                    <div className="flex items-center gap-2 rounded-full border border-white/10 bg-black/20 px-3 py-1.5 text-[11px] font-medium text-white/70 backdrop-blur-md">
                        <Hand className="size-3.5 text-violet-300" />
                        {touching ? "Keep moving" : "Touch & drag"}
                    </div>
                    <div
                        className={cn(
                            "flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[10px] font-bold tracking-widest backdrop-blur-md",
                            touching || primaryValue > 0
                                ? "border-fuchsia-400/30 bg-fuchsia-500/15 text-fuchsia-200"
                                : "border-white/10 bg-black/20 text-white/45",
                        )}
                    >
                        <Waves
                            className={cn(
                                "size-3.5",
                                touching && "animate-pulse",
                            )}
                        />
                        {touching ? "LIVE" : `${Math.round(primaryValue)}%`}
                    </div>
                </div>

                <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                    <Move className="size-10 text-white/[0.07]" />
                </div>

                {primary && (
                    <div
                        className="pointer-events-none absolute z-20 -translate-x-1/2 -translate-y-1/2 transition-[left,top] duration-75"
                        style={{ left: `${x}%`, top: `${y}%` }}
                    >
                        <div
                            className={cn(
                                "grid size-20 place-items-center rounded-full border border-white/30 bg-gradient-to-br from-fuchsia-400/80 to-violet-600/90 shadow-[0_0_45px_rgba(217,70,239,0.5)] backdrop-blur-md",
                                touching && "scale-110",
                            )}
                        >
                            <div className="grid size-14 place-items-center rounded-full border border-white/20 bg-white/10 text-lg font-bold tabular-nums text-white shadow-inner">
                                {Math.round(primaryValue)}
                            </div>
                        </div>
                    </div>
                )}

                <div className="absolute inset-x-0 bottom-0 z-10 flex items-end justify-between gap-4 p-5 text-white/55">
                    <div>
                        <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-violet-300/70">
                            Vertical
                        </p>
                        <p className="mt-1 text-xs font-medium">
                            {primary?.label ?? "No output"}
                        </p>
                    </div>
                    {secondary && (
                        <div className="text-right">
                            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-fuchsia-300/70">
                                Horizontal
                            </p>
                            <p className="mt-1 text-xs font-medium">
                                {secondary.label} · {Math.round(secondaryValue)}
                                %
                            </p>
                        </div>
                    )}
                </div>
            </div>
            <p className="text-center text-xs text-muted-foreground">
                {secondary
                    ? "Slide up for motor 1, right for motor 2. Arrow keys also work."
                    : "Slide up to increase intensity. Arrow keys also work."}
            </p>
        </div>
    );
}
