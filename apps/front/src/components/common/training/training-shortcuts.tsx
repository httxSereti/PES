import { useEffect } from "react";

import type { EdgeDifficulty } from "@/types";

const DIFFICULTY_KEYS: Record<string, EdgeDifficulty> = {
    "1": "easy",
    "2": "normal",
    "3": "hard",
    "4": "extreme",
};

interface TrainingShortcutsProps {
    enabled: boolean;
    canRecord: boolean;
    canPause: boolean;
    paused: boolean;
    busy: boolean;
    onEdge: (difficulty: EdgeDifficulty) => void;
    onTogglePause: () => void;
}

function isTypingTarget(target: EventTarget | null): boolean {
    if (!(target instanceof HTMLElement)) return false;
    return Boolean(
        target.closest(
            "input, textarea, select, [contenteditable='true'], [role='textbox']",
        ),
    );
}

/**
 * 1–4 record an edge, Space toggles pause/resume. Disabled while a dialog or
 * menu is open and while the user is typing in a form field.
 */
export function TrainingShortcuts({
    enabled,
    canRecord,
    canPause,
    paused,
    busy,
    onEdge,
    onTogglePause,
}: TrainingShortcutsProps) {
    useEffect(() => {
        if (!enabled) return;

        function handleKeyDown(event: KeyboardEvent) {
            if (
                event.defaultPrevented ||
                event.repeat ||
                event.ctrlKey ||
                event.metaKey ||
                event.altKey ||
                isTypingTarget(event.target)
            ) {
                return;
            }

            // Radix dialogs/menus manage their own keyboard interactions.
            if (document.querySelector("[role='dialog'], [role='menu']")) {
                return;
            }

            if (event.code === "Space" || event.key === " ") {
                if (!canPause || busy) return;
                event.preventDefault();
                onTogglePause();
                return;
            }

            const difficulty = DIFFICULTY_KEYS[event.key];
            if (!difficulty || !canRecord || paused || busy) return;
            event.preventDefault();
            onEdge(difficulty);
        }

        window.addEventListener("keydown", handleKeyDown);
        return () => window.removeEventListener("keydown", handleKeyDown);
    }, [
        enabled,
        canRecord,
        canPause,
        paused,
        busy,
        onEdge,
        onTogglePause,
    ]);

    return null;
}
