import { Button } from "@pes/ui/components/button";
import { Flame } from "lucide-react";

import { EDGE_BUTTONS } from "@/lib/training";
import type { EdgeDifficulty } from "@/types";

interface TrainingEdgeButtonsProps {
    disabled: boolean;
    onRecord: (difficulty: EdgeDifficulty) => void;
    variant?: "default" | "kiosk";
}

/** Difficulty buttons shared by the session page, partner control and kiosk. */
export function TrainingEdgeButtons({
    disabled,
    onRecord,
    variant = "default",
}: TrainingEdgeButtonsProps) {
    if (variant === "kiosk") {
        return (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                {EDGE_BUTTONS.map((button, index) => (
                    <Button
                        key={button.difficulty}
                        type="button"
                        disabled={disabled}
                        onClick={() => onRecord(button.difficulty)}
                        className={`${button.className} flex h-40 flex-col gap-3 text-2xl text-white`}
                    >
                        <Flame size={38} />
                        <span>{button.label}</span>
                        <span className="text-xs font-normal opacity-75">
                            Shortcut {index + 1}
                        </span>
                    </Button>
                ))}
            </div>
        );
    }

    return (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {EDGE_BUTTONS.map((button, index) => (
                <Button
                    key={button.difficulty}
                    type="button"
                    disabled={disabled}
                    onClick={() => onRecord(button.difficulty)}
                    className={`${button.className} text-white`}
                >
                    <Flame size={14} />
                    {button.label}
                    <span className="ml-1 hidden rounded border border-white/25 px-1 text-[10px] opacity-70 sm:inline">
                        {index + 1}
                    </span>
                </Button>
            ))}
        </div>
    );
}
