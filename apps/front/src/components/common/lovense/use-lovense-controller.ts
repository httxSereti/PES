import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { useWebSocket } from "@/hooks/useWebSocket";
import type { LovenseDeviceInfo, LovenseTarget } from "@/types";
import {
    clampIntensity,
    deviceOutputs,
    effectiveCap,
    outputKey,
    type PlayerOutput,
} from "./player-utils";

interface PendingSet {
    key: string;
    deviceIds: string[];
    feature: number | "all";
    output: string;
    value: number;
    rampMs: number;
}

const COMMAND_INTERVAL_MS = 100;

function targetsFor(deviceIds: string[]): LovenseTarget {
    return { device_ids: deviceIds, tags: [], node_ids: [], all: false };
}

export function useLovenseController(
    devices: LovenseDeviceInfo[],
    globalCap: number,
    manualHoldSeconds: number,
) {
    const { send, sendCommand, isConnected } = useWebSocket();
    const [selectedDeviceIds, setSelectedDeviceIds] = useState<string[]>([]);
    const [activeDeviceId, setActiveDeviceId] = useState<string | null>(null);
    const [values, setValues] = useState<Record<string, number>>({});
    const [manualActive, setManualActive] = useState(false);

    const connectedRef = useRef(isConnected);
    const valuesRef = useRef(values);
    const liveCommandsRef = useRef(new Map<string, PendingSet>());
    const pendingCommandsRef = useRef(new Map<string, PendingSet>());
    const flushTimerRef = useRef<number | null>(null);
    const lastSentAtRef = useRef(0);
    const ignoreSyncUntilRef = useRef(0);
    const mountedRef = useRef(true);
    const initializedSelectionRef = useRef(false);
    const flushPendingRef = useRef<() => void>(() => undefined);

    connectedRef.current = isConnected;
    valuesRef.current = values;

    const selectedDevices = useMemo(
        () => devices.filter((device) => selectedDeviceIds.includes(device.id)),
        [devices, selectedDeviceIds],
    );
    const activeDevice = useMemo(
        () =>
            devices.find((device) => device.id === activeDeviceId) ??
            selectedDevices[0] ??
            null,
        [activeDeviceId, devices, selectedDevices],
    );
    const outputs = useMemo(
        () => (activeDevice ? deviceOutputs(activeDevice, globalCap) : []),
        [activeDevice, globalCap],
    );
    const selectedCap = selectedDevices.length
        ? Math.min(
              ...selectedDevices.map((device) =>
                  effectiveCap(device, globalCap),
              ),
          )
        : 0;
    const canControl =
        isConnected &&
        selectedDevices.length > 0 &&
        selectedDevices.some((device) => device.online && device.enabled);

    useEffect(() => {
        if (!initializedSelectionRef.current) {
            const firstOnline = devices.find(
                (device) => device.online && device.enabled,
            );
            if (!firstOnline) return;
            initializedSelectionRef.current = true;
            setSelectedDeviceIds([firstOnline.id]);
            setActiveDeviceId(firstOnline.id);
            return;
        }

        const validIds = selectedDeviceIds.filter((id) =>
            devices.some((device) => device.id === id),
        );
        if (validIds.length !== selectedDeviceIds.length) {
            setSelectedDeviceIds(validIds);
        }
        if (activeDeviceId && validIds.includes(activeDeviceId)) return;
        setActiveDeviceId(validIds[0] ?? null);
    }, [activeDeviceId, devices, selectedDeviceIds]);

    useEffect(() => {
        if (Date.now() < ignoreSyncUntilRef.current || manualActive) return;
        setValues((current) => {
            const next = { ...current };
            for (const device of devices) {
                for (const entry of deviceOutputs(device, globalCap)) {
                    const value = device.outputs.find(
                        (item) =>
                            item.feature_index === entry.featureIndex &&
                            item.output === entry.output,
                    )?.value;
                    next[
                        outputKey(device.id, entry.featureIndex, entry.output)
                    ] = clampIntensity(value ?? 0, entry.cap);
                }
            }
            return next;
        });
    }, [devices, globalCap, manualActive]);

    const flushPending = useCallback(() => {
        flushTimerRef.current = null;
        if (!connectedRef.current) {
            pendingCommandsRef.current.clear();
            return;
        }

        const next = pendingCommandsRef.current.values().next().value as
            | PendingSet
            | undefined;
        if (!next) return;
        pendingCommandsRef.current.delete(next.key);
        lastSentAtRef.current = Date.now();
        send("lovense:set", {
            targets: targetsFor(next.deviceIds),
            feature: next.feature,
            output: next.output,
            value: next.value,
            mode: "absolute",
            ramp_ms: next.rampMs,
            force: false,
        });

        if (pendingCommandsRef.current.size > 0) {
            flushTimerRef.current = window.setTimeout(
                () => flushPendingRef.current(),
                COMMAND_INTERVAL_MS,
            );
        }
    }, [send]);
    flushPendingRef.current = flushPending;

    const scheduleFlush = useCallback(() => {
        if (flushTimerRef.current !== null) return;
        const delay = Math.max(
            0,
            COMMAND_INTERVAL_MS - (Date.now() - lastSentAtRef.current),
        );
        flushTimerRef.current = window.setTimeout(
            () => flushPendingRef.current(),
            delay,
        );
    }, []);

    const clearPending = useCallback((deviceIds?: string[]) => {
        if (!deviceIds) {
            pendingCommandsRef.current.clear();
        } else {
            const ids = new Set(deviceIds);
            for (const [key, command] of pendingCommandsRef.current) {
                if (command.deviceIds.some((id) => ids.has(id))) {
                    pendingCommandsRef.current.delete(key);
                }
            }
        }
        if (
            pendingCommandsRef.current.size === 0 &&
            flushTimerRef.current !== null
        ) {
            window.clearTimeout(flushTimerRef.current);
            flushTimerRef.current = null;
        }
    }, []);

    const updateLocalValues = useCallback(
        (
            deviceIds: string[],
            feature: number | "all",
            output: string,
            value: number,
        ) => {
            setValues((current) => {
                const next = { ...current };
                for (const device of devices) {
                    if (!deviceIds.includes(device.id)) continue;
                    for (const entry of deviceOutputs(device, globalCap)) {
                        if (entry.output !== output) continue;
                        if (feature !== "all" && entry.featureIndex !== feature)
                            continue;
                        next[outputKey(device.id, entry.featureIndex, output)] =
                            clampIntensity(value, entry.cap);
                    }
                }
                return next;
            });
        },
        [devices, globalCap],
    );

    const queueSet = useCallback(
        (
            deviceIds: string[],
            feature: number | "all",
            output: string,
            requestedValue: number,
            rampMs = 0,
        ) => {
            const onlineIds = deviceIds.filter((id) =>
                devices.some(
                    (device) =>
                        device.id === id && device.online && device.enabled,
                ),
            );
            if (!connectedRef.current || onlineIds.length === 0) return;

            const cap = Math.min(
                ...onlineIds.map((id) => {
                    const device = devices.find((item) => item.id === id);
                    return device ? effectiveCap(device, globalCap) : 0;
                }),
            );
            const value = clampIntensity(requestedValue, cap);
            const key = `${[...onlineIds].sort().join(",")}|${feature}|${output}`;
            const command: PendingSet = {
                key,
                deviceIds: onlineIds,
                feature,
                output,
                value,
                rampMs,
            };

            ignoreSyncUntilRef.current = Date.now() + 750;
            if (value > 0) liveCommandsRef.current.set(key, command);
            else liveCommandsRef.current.delete(key);
            setManualActive(liveCommandsRef.current.size > 0);
            updateLocalValues(onlineIds, feature, output, value);
            pendingCommandsRef.current.set(key, command);
            scheduleFlush();
        },
        [devices, globalCap, scheduleFlush, updateLocalValues],
    );

    const setOutput = useCallback(
        (entry: PlayerOutput, value: number, rampMs = 0) => {
            queueSet(
                selectedDeviceIds,
                entry.featureIndex,
                entry.output,
                value,
                rampMs,
            );
        },
        [queueSet, selectedDeviceIds],
    );

    const setAllFeatures = useCallback(
        (output: string, value: number, rampMs = 0) => {
            queueSet(selectedDeviceIds, "all", output, value, rampMs);
        },
        [queueSet, selectedDeviceIds],
    );

    const resetLocal = useCallback(
        (deviceIds?: string[]) => {
            clearPending(deviceIds);
            if (!deviceIds) {
                liveCommandsRef.current.clear();
                setValues((current) =>
                    Object.fromEntries(
                        Object.keys(current).map((key) => [key, 0]),
                    ),
                );
            } else {
                const ids = new Set(deviceIds);
                for (const [key, command] of liveCommandsRef.current) {
                    if (command.deviceIds.some((id) => ids.has(id))) {
                        liveCommandsRef.current.delete(key);
                    }
                }
                setValues((current) => {
                    const next = { ...current };
                    for (const key of Object.keys(next)) {
                        const deviceId = key.split(":")[0];
                        if (deviceId && ids.has(deviceId)) next[key] = 0;
                    }
                    return next;
                });
            }
            setManualActive(liveCommandsRef.current.size > 0);
            ignoreSyncUntilRef.current = Date.now() + 750;
        },
        [clearPending],
    );

    const stopTargets = useCallback(
        async (deviceIds = selectedDeviceIds, notify = false) => {
            if (deviceIds.length === 0) return false;
            resetLocal(deviceIds);
            if (!connectedRef.current) return false;
            try {
                const result = await sendCommand("lovense:stop", {
                    targets: targetsFor(deviceIds),
                    output: null,
                });
                if (result.status !== "ok") {
                    toast.error(
                        result.message ?? "Unable to stop the selected toys",
                    );
                    return false;
                }
                if (notify) toast.success("Selected toys stopped");
                return true;
            } catch {
                if (connectedRef.current) toast.error("Stop command timed out");
                return false;
            }
        },
        [resetLocal, selectedDeviceIds, sendCommand],
    );

    const stopAll = useCallback(async () => {
        resetLocal();
        if (!connectedRef.current) return false;
        try {
            const result = await sendCommand("lovense:stop_all");
            if (result.status !== "ok") {
                toast.error(result.message ?? "Stop all failed");
                return false;
            }
            toast.success("All toy outputs stopped");
            return true;
        } catch {
            if (connectedRef.current) toast.error("Stop all timed out");
            return false;
        }
    }, [resetLocal, sendCommand]);

    const pulse = useCallback(
        async (value = 50) => {
            if (selectedDeviceIds.length === 0) return;
            await stopTargets(selectedDeviceIds);
            try {
                const result = await sendCommand("lovense:pulse", {
                    targets: targetsFor(selectedDeviceIds),
                    output: "Vibrate",
                    value: clampIntensity(value, selectedCap),
                    attack_ms: 250,
                    hold_ms: 700,
                    release_ms: 450,
                });
                if (result.status !== "ok") {
                    toast.error(result.message ?? "Pulse failed");
                }
            } catch {
                toast.error("Pulse command timed out");
            }
        },
        [selectedCap, selectedDeviceIds, sendCommand, stopTargets],
    );

    const preparePattern = useCallback(async () => {
        if (liveCommandsRef.current.size > 0)
            await stopTargets(selectedDeviceIds);
    }, [selectedDeviceIds, stopTargets]);

    const toggleDevice = useCallback(
        (deviceId: string) => {
            if (manualActive && selectedDeviceIds.includes(deviceId)) {
                void stopTargets(selectedDeviceIds);
            }
            setSelectedDeviceIds((current) => {
                if (current.includes(deviceId)) {
                    const next = current.filter((id) => id !== deviceId);
                    setActiveDeviceId((active) =>
                        active === deviceId ? (next[0] ?? null) : active,
                    );
                    return next;
                }
                setActiveDeviceId(deviceId);
                return [...current, deviceId];
            });
        },
        [manualActive, selectedDeviceIds, stopTargets],
    );

    const activateDevice = useCallback(
        (deviceId: string) => {
            if (!selectedDeviceIds.includes(deviceId) && manualActive) {
                void stopTargets(selectedDeviceIds);
            }
            setSelectedDeviceIds((current) =>
                current.includes(deviceId) ? current : [...current, deviceId],
            );
            setActiveDeviceId(deviceId);
        },
        [manualActive, selectedDeviceIds, stopTargets],
    );

    const selectOnly = useCallback(
        (deviceId: string) => {
            if (
                manualActive &&
                (selectedDeviceIds.length !== 1 ||
                    selectedDeviceIds[0] !== deviceId)
            ) {
                void stopTargets(selectedDeviceIds);
            }
            setSelectedDeviceIds([deviceId]);
            setActiveDeviceId(deviceId);
        },
        [manualActive, selectedDeviceIds, stopTargets],
    );

    useEffect(() => {
        if (!manualActive || !isConnected) return;
        const ttlMs = Math.max(3, manualHoldSeconds) * 1000;
        const heartbeatMs = Math.max(
            1000,
            Math.min(15000, Math.floor(ttlMs / 3)),
        );
        const heartbeat = () => {
            if (document.visibilityState !== "visible") return;
            for (const command of liveCommandsRef.current.values()) {
                if (command.value <= 0) continue;
                send("lovense:set", {
                    targets: targetsFor(command.deviceIds),
                    feature: command.feature,
                    output: command.output,
                    value: command.value,
                    mode: "absolute",
                    ramp_ms: 0,
                    force: false,
                });
            }
        };
        const interval = window.setInterval(heartbeat, heartbeatMs);
        return () => window.clearInterval(interval);
    }, [isConnected, manualActive, manualHoldSeconds, send]);

    useEffect(() => {
        if (isConnected) return;
        resetLocal();
    }, [isConnected, resetLocal]);

    useEffect(() => {
        mountedRef.current = true;
        const releaseOnBackground = () => {
            if (liveCommandsRef.current.size === 0) return;
            const ids = Array.from(
                new Set(
                    Array.from(liveCommandsRef.current.values()).flatMap(
                        (command) => command.deviceIds,
                    ),
                ),
            );
            clearPending();
            liveCommandsRef.current.clear();
            if (connectedRef.current && ids.length > 0) {
                send("lovense:stop", {
                    targets: targetsFor(ids),
                    output: null,
                });
            }
            if (mountedRef.current) {
                setManualActive(false);
                setValues((current) =>
                    Object.fromEntries(
                        Object.keys(current).map((key) => [key, 0]),
                    ),
                );
            }
        };
        const visibility = () => {
            if (document.visibilityState !== "visible") releaseOnBackground();
        };
        document.addEventListener("visibilitychange", visibility);
        window.addEventListener("pagehide", releaseOnBackground);
        return () => {
            mountedRef.current = false;
            document.removeEventListener("visibilitychange", visibility);
            window.removeEventListener("pagehide", releaseOnBackground);
            releaseOnBackground();
            if (flushTimerRef.current !== null)
                window.clearTimeout(flushTimerRef.current);
        };
    }, [clearPending, send]);

    return {
        devices,
        selectedDevices,
        selectedDeviceIds,
        activeDevice,
        activeDeviceId: activeDevice?.id ?? null,
        outputs,
        values,
        selectedCap,
        manualActive,
        canControl,
        isConnected,
        toggleDevice,
        activateDevice,
        selectOnly,
        setOutput,
        setAllFeatures,
        stopTargets,
        stopAll,
        pulse,
        preparePattern,
    };
}

export type LovenseController = ReturnType<typeof useLovenseController>;
