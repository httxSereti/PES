import { useWebSocket } from "@/hooks/useWebSocket";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import { sensorsSelectors, sensorUpdated } from "@/store/slices/sensorsSlice";
import { Slider } from "@pes/ui/components/slider";
import { cn } from "@pes/ui/lib/utils";
import type { FC } from "react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

const SLIDER_COMMAND_DEBOUNCE_MS = 300;

type CfgSensorSliderProps = {
    sensorId: string;
    propertyKey: string;
    label: string;
    minValue: number;
    maxValue: number;
    step: number;
    unit: string;
    disabled: boolean;
    compact?: boolean;
    accentClassName?: string;
};

export const CfgSensorSlider: FC<CfgSensorSliderProps> = ({
    sensorId,
    propertyKey,
    label,
    minValue,
    maxValue,
    step,
    unit,
    disabled,
    compact = false,
    accentClassName,
}) => {
    const sensor = useAppSelector((state) =>
        sensorsSelectors.selectById(state, sensorId),
    );
    const dispatch = useAppDispatch();
    const { sendCommand } = useWebSocket();

    const storedValue = Number(
        (sensor as unknown as Record<string, unknown> | undefined)?.[
            propertyKey
        ] ?? 0,
    );
    const safeStoredValue = Number.isFinite(storedValue) ? storedValue : 0;

    const [draftValue, setDraftValue] = useState(safeStoredValue);
    const sendCommandRef = useRef(sendCommand);
    const storedValueRef = useRef(safeStoredValue);
    const timerRef = useRef<number | null>(null);
    const pendingValueRef = useRef<number | null>(null);
    const inFlightRef = useRef(0);
    const mountedRef = useRef(true);

    sendCommandRef.current = sendCommand;
    storedValueRef.current = safeStoredValue;

    useEffect(() => {
        mountedRef.current = true;

        return () => {
            mountedRef.current = false;
        };
    }, []);

    useEffect(() => {
        if (timerRef.current === null && inFlightRef.current === 0) {
            setDraftValue(safeStoredValue);
        }
    }, [safeStoredValue]);

    useEffect(() => {
        return () => {
            if (timerRef.current === null) return;

            // Don't lose the last value if the card unmounts mid-debounce.
            window.clearTimeout(timerRef.current);
            timerRef.current = null;

            const value = pendingValueRef.current;
            pendingValueRef.current = null;
            if (value === null) return;

            try {
                void sendCommandRef
                    .current("sensors:update", {
                        [sensorId]: {
                            [propertyKey]: value,
                        },
                    })
                    .then((result) => {
                        if (result.status !== "ok") {
                            console.error(
                                `Failed to flush pending '${propertyKey}' update:`,
                                result.message,
                            );
                        }
                    })
                    .catch((error) => {
                        console.error(
                            `Failed to flush pending '${propertyKey}' update:`,
                            error,
                        );
                    });
            } catch (error) {
                console.error(
                    `Failed to flush pending '${propertyKey}' update:`,
                    error,
                );
            }
        };
    }, [sensorId, propertyKey]);

    const commitValue = async (value: number) => {
        inFlightRef.current += 1;

        try {
            const result = await sendCommandRef.current("sensors:update", {
                [sensorId]: {
                    [propertyKey]: value,
                },
            });
            if (result.status !== "ok") {
                throw new Error(result.message ?? "Command failed");
            }

            dispatch(
                sensorUpdated({
                    id: sensorId,
                    changes: { [propertyKey]: value },
                }),
            );
        } catch (error) {
            if (mountedRef.current) {
                setDraftValue(storedValueRef.current);
                toast.error("Can't update sensor", {
                    description:
                        error instanceof Error
                            ? error.message
                            : "Command failed",
                    position: "top-right",
                });
            }

            console.error(
                `Failed to update property '${propertyKey}' to '${value}' on sensor:`,
                error,
            );
        } finally {
            inFlightRef.current -= 1;
        }
    };

    // Keep the thumb responsive locally, but only send the WS update after
    // the user pauses so dragging does not flood the command queue.
    const updateLevel = (newLevel: number | undefined) => {
        if (newLevel === undefined || !Number.isFinite(newLevel)) return;

        setDraftValue(newLevel);
        pendingValueRef.current = newLevel;

        if (timerRef.current !== null) {
            window.clearTimeout(timerRef.current);
        }

        timerRef.current = window.setTimeout(() => {
            timerRef.current = null;

            const value = pendingValueRef.current;
            pendingValueRef.current = null;
            if (value === null) return;

            void commitValue(value);
        }, SLIDER_COMMAND_DEBOUNCE_MS);
    };

    return (
        <div
            className={cn(
                "transition-opacity duration-200",
                disabled && "pointer-events-none opacity-30",
            )}
        >
            <div
                className={cn(
                    "flex items-center justify-between gap-3",
                    compact ? "mb-1" : "mb-2",
                )}
            >
                <span
                    className={cn(
                        "tracking-wide text-muted-foreground/60",
                        compact ? "text-[10px]" : "text-[11px]",
                    )}
                >
                    {label}
                </span>
                <span
                    className={cn(
                        "font-mono font-medium text-primary tabular-nums",
                        compact ? "text-[10px]" : "text-[12px]",
                    )}
                >
                    {draftValue}
                    <span
                        className={cn(
                            "ml-0.5 text-muted-foreground/50",
                            compact ? "text-[9px]" : "text-[10px]",
                        )}
                    >
                        {unit}
                    </span>
                </span>
            </div>
            <Slider
                aria-label={label}
                min={minValue}
                max={maxValue}
                step={step}
                value={[draftValue]}
                onValueChange={([v]) => updateLevel(v)}
                className={cn(
                    compact &&
                        "h-3 [&_[data-slot=slider-track]]:h-1 [&_[data-slot=slider-thumb]]:size-3.5",
                    accentClassName,
                )}
            />
        </div>
    );
};
