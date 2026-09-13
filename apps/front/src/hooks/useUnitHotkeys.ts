import { useEffect, useRef, useState } from 'react';
import type { UnitSettings } from '@/types';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import { unitsSelectors, unitUpdated } from '@/store/slices/unitsSlice';
import {
    channelSet,
    selectChannelByUnit,
    selectHighlightedUnitId,
    selectSelectedUnitIds,
    selectUndoStack,
    unitHighlighted,
    unitSelected,
    undoPushed,
    undoRemoved,
    type UndoEntry,
    type UnitChannel,
} from '@/store/slices/unitsUiSlice';
import { useWebSocket } from '@/hooks/useWebSocket';

/** Physical key codes for the three fixed units, main row and numpad. */
const UNIT_IDS = ['UNIT1', 'UNIT2', 'UNIT3'] as const;

const CODE_TO_UNIT_INDEX: Record<string, number> = {
    Digit1: 0,
    Digit2: 1,
    Digit3: 2,
    Numpad1: 0,
    Numpad2: 1,
    Numpad3: 2,
};

function isEditableTarget(target: EventTarget | null): boolean {
    const element = target as HTMLElement | null;
    if (!element || !element.tagName)
        return false;

    return (
        element.tagName === 'INPUT' ||
        element.tagName === 'TEXTAREA' ||
        element.tagName === 'SELECT' ||
        element.isContentEditable
    );
}

function isInteractiveTarget(target: EventTarget | null): boolean {
    const element = target as HTMLElement | null;
    if (!element || !element.tagName)
        return false;

    return (
        element.tagName === 'BUTTON' ||
        element.tagName === 'A' ||
        element.getAttribute('role') === 'button' ||
        element.getAttribute('role') === 'menuitem'
    );
}

/** Don't steal keys while a Radix overlay owns focus. */
function isUiLayerOpen(): boolean {
    if (typeof document === 'undefined')
        return false;

    return document.querySelector(
        '[role="dialog"][data-state="open"], [role="menu"][data-state="open"], [role="listbox"], [data-slot="popover-content"][data-state="open"]',
    ) !== null;
}

interface HotkeyContext {
    units: UnitSettings[];
    selectedUnitIds: string[];
    highlightedUnitId: string | null;
    channelByUnit: Record<string, UnitChannel>;
    undoStack: UndoEntry[];
    sendCommand: ReturnType<typeof useWebSocket>['sendCommand'];
}

/**
 * Page-scoped keyboard control for the unit cards.
 * Mount once (in `Units`); it attaches a single window listener and stays subscribed.
 */
export function useUnitHotkeys() {
    const dispatch = useAppDispatch();
    const { sendCommand } = useWebSocket();

    const units = useAppSelector(state => unitsSelectors.selectAll(state));
    const selectedUnitIds = useAppSelector(selectSelectedUnitIds);
    const highlightedUnitId = useAppSelector(selectHighlightedUnitId);
    const channelByUnit = useAppSelector(selectChannelByUnit);
    const undoStack = useAppSelector(selectUndoStack);

    const [shortcutsOpen, setShortcutsOpen] = useState(false);

    // Keep the latest state available to the (stable) listener without re-subscribing.
    const context = useRef<HotkeyContext>({
        units,
        selectedUnitIds,
        highlightedUnitId,
        channelByUnit,
        undoStack,
        sendCommand,
    });
    context.current = { units, selectedUnitIds, highlightedUnitId, channelByUnit, undoStack, sendCommand };

    useEffect(() => {
        const findUnit = (unitId: string) => context.current.units.find(unit => unit.id === unitId);

        const orderedUnitIds = (): string[] => {
            const available = context.current.units.map(unit => unit.id);
            return UNIT_IDS.filter(id => available.includes(id));
        };

        const moveHighlight = (direction: 1 | -1) => {
            const ids = orderedUnitIds();
            if (ids.length === 0)
                return;

            const current = context.current.highlightedUnitId;
            const index = current ? ids.indexOf(current) : -1;
            const next = index === -1
                ? 0
                : (index + direction + ids.length) % ids.length;

            const nextId = ids[next];
            if (nextId)
                dispatch(unitHighlighted(nextId));
        };

        const setSelectionChannel = (channel: UnitChannel) => {
            const { selectedUnitIds: selection } = context.current;
            if (selection.length === 0)
                return;

            dispatch(channelSet({ unitIds: selection, channel }));
        };

        const stopSelectedUnits = () => {
            const { selectedUnitIds: selection } = context.current;
            const payload: Record<string, { ch_A?: string; ch_B?: string }> = {};

            for (const unitId of selection) {
                const unit = findUnit(unitId);
                if (!unit)
                    continue;

                payload[unitId] = { ch_A: '0', ch_B: '0' };
                dispatch(undoPushed({ unitId, channel: 'channelA', previous: unit.ch_A }));
                dispatch(undoPushed({ unitId, channel: 'channelB', previous: unit.ch_B }));
            }

            if (Object.keys(payload).length === 0)
                return;

            void context.current.sendCommand('units:update_level', payload).catch(error => {
                console.error('[hotkeys] Failed to stop units', error);
            });
        };

        const adjustLevels = (direction: 1 | -1, event: KeyboardEvent) => {
            const operator = event.ctrlKey
                ? `%${direction === 1 ? '+' : '-'}10`
                : event.shiftKey
                    ? `${direction === 1 ? '+' : '-'}5`
                    : `${direction === 1 ? '+' : '-'}1`;

            const { selectedUnitIds: selection, channelByUnit: channels } = context.current;
            const payload: Record<string, { ch_A?: string; ch_B?: string }> = {};

            for (const unitId of selection) {
                const unit = findUnit(unitId);
                if (!unit)
                    continue;

                const channel = channels[unitId] ?? 'channelA';
                const field: 'ch_A' | 'ch_B' = channel === 'channelA' ? 'ch_A' : 'ch_B';

                payload[unitId] = channel === 'channelA' ? { ch_A: operator } : { ch_B: operator };
                dispatch(undoPushed({ unitId, channel, previous: unit[field] }));
            }

            if (Object.keys(payload).length === 0)
                return;

            void context.current.sendCommand('units:update_level', payload).catch(error => {
                console.error('[hotkeys] Failed to update level', error);
            });
        };

        const undoLastLevel = () => {
            const stack = context.current.undoStack;
            if (stack.length === 0)
                return;

            const unitId = context.current.highlightedUnitId ?? context.current.selectedUnitIds[0];
            if (!unitId)
                return;

            const channel = context.current.channelByUnit[unitId] ?? 'channelA';
            let index = -1;
            for (let i = stack.length - 1; i >= 0; i--) {
                const entry = stack[i];
                if (entry && entry.unitId === unitId && entry.channel === channel) {
                    index = i;
                    break;
                }
            }
            if (index === -1)
                return;

            const entry = stack[index];
            if (!entry)
                return;

            const previous = entry.previous;
            dispatch(undoRemoved(index));

            const changes = channel === 'channelA' ? { ch_A: String(previous) } : { ch_B: String(previous) };
            void context.current.sendCommand('units:update_level', { [unitId]: changes }).catch(error => {
                console.error('[hotkeys] Failed to undo level', error);
            });
        };

        const cyclePowerMode = () => {
            const { selectedUnitIds: selection } = context.current;
            const payload: Record<string, { power_mode: 'L' | 'H' | 'D' }> = {};
            const optimistic: Array<{ id: string; changes: Partial<UnitSettings> }> = [];

            for (const unitId of selection) {
                const unit = findUnit(unitId);
                if (!unit)
                    continue;

                const current = unit.level_d ? 'D' : unit.level_h ? 'H' : 'L';
                const next = current === 'L' ? 'H' : current === 'H' ? 'D' : 'L';

                payload[unitId] = { power_mode: next };
                optimistic.push({ id: unitId, changes: { level_h: next === 'H', level_d: next === 'D' } });
            }

            if (Object.keys(payload).length === 0)
                return;

            void context.current.sendCommand('units:update_power_mode', payload).then(() => {
                for (const { id, changes } of optimistic)
                    dispatch(unitUpdated({ id, changes }));
            }).catch(error => {
                console.error('[hotkeys] Failed to cycle power mode', error);
            });
        };

        const handleKeyDown = (event: KeyboardEvent) => {
            if (isEditableTarget(event.target))
                return;

            const { code } = event;

            // Cheat sheet works even while its own popover is open.
            if (code === 'Slash' && event.shiftKey) {
                event.preventDefault();
                setShortcutsOpen(open => !open);
                return;
            }

            if (isUiLayerOpen())
                return;

            if ((event.ctrlKey || event.metaKey) && code === 'KeyZ' && !event.shiftKey) {
                event.preventDefault();
                undoLastLevel();
                return;
            }

            if (event.metaKey)
                return;

            const unitIndex = CODE_TO_UNIT_INDEX[code];
            const unitId = unitIndex === undefined ? undefined : UNIT_IDS[unitIndex];
            if (unitId && !event.ctrlKey) {
                event.preventDefault();
                dispatch(unitSelected({ unitId, additive: event.altKey }));
                return;
            }

            if (code === 'ArrowLeft' || code === 'ArrowRight') {
                if (event.altKey)
                    return;
                event.preventDefault();
                moveHighlight(code === 'ArrowRight' ? 1 : -1);
                return;
            }

            if (code === 'Space') {
                if (isInteractiveTarget(event.target))
                    return;
                const highlighted = context.current.highlightedUnitId;
                if (!highlighted)
                    return;
                event.preventDefault();
                dispatch(unitSelected({ unitId: highlighted, additive: true }));
                return;
            }

            if (code === 'NumpadAdd' || code === 'Equal') {
                event.preventDefault();
                adjustLevels(1, event);
                return;
            }

            if (code === 'NumpadSubtract' || code === 'Minus') {
                event.preventDefault();
                adjustLevels(-1, event);
                return;
            }

            if (code === 'NumpadDecimal') {
                event.preventDefault();
                stopSelectedUnits();
                return;
            }

            if (code === 'KeyA' || code === 'KeyB') {
                if (event.altKey || event.ctrlKey)
                    return;
                event.preventDefault();
                setSelectionChannel(code === 'KeyA' ? 'channelA' : 'channelB');
                return;
            }

            if (code === 'KeyP') {
                if (event.altKey || event.ctrlKey)
                    return;
                event.preventDefault();
                cyclePowerMode();
                return;
            }

            if (code === 'Escape') {
                const target = context.current.highlightedUnitId ?? context.current.selectedUnitIds[0];
                if (!target)
                    return;
                event.preventDefault();
                dispatch(unitSelected({ unitId: target }));
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [dispatch]);

    return { shortcutsOpen, setShortcutsOpen };
}
