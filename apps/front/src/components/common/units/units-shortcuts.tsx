import { Keyboard } from "lucide-react"
import { Button } from "@pes/ui/components/button"
import { Kbd, KbdGroup } from "@pes/ui/components/kbd"
import {
    Popover,
    PopoverContent,
    PopoverDescription,
    PopoverHeader,
    PopoverTitle,
    PopoverTrigger,
} from "@pes/ui/components/popover"

type UnitsShortcutsProps = {
    open: boolean;
    onOpenChange: (open: boolean) => void;
};

const SHORTCUTS: Array<{ keys: string[]; label: string }> = [
    { keys: ["1", "2", "3"], label: "Select a unit" },
    { keys: ["Alt", "1…3"], label: "Toggle multi-selection" },
    { keys: ["←", "→"], label: "Move highlight" },
    { keys: ["Space"], label: "Toggle highlighted unit" },
    { keys: ["+", "−"], label: "Level ±1 on selected units" },
    { keys: ["Shift", "+/−"], label: "Level ±5" },
    { keys: ["Ctrl", "+/−"], label: "Level ±10%" },
    { keys: ["A", "B"], label: "Set channel on selected units" },
    { keys: ["."], label: "Stop selected units (A+B)" },
    { keys: ["P"], label: "Cycle power mode (L→H→D)" },
    { keys: ["Ctrl", "Z"], label: "Undo last level change" },
    { keys: ["Esc"], label: "Collapse to highlighted unit" },
    { keys: ["?"], label: "Toggle this panel" },
];

export const UnitsShortcuts = ({ open, onOpenChange }: UnitsShortcutsProps) => {
    return (
        <Popover open={open} onOpenChange={onOpenChange}>
            <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className="cursor-pointer gap-2">
                    <Keyboard size={13} />
                    <span className="hidden sm:inline">Shortcuts</span>
                    <Kbd>?</Kbd>
                </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-80">
                <PopoverHeader>
                    <PopoverTitle>Keyboard shortcuts</PopoverTitle>
                    <PopoverDescription>
                        Control the selected units without the mouse.
                    </PopoverDescription>
                </PopoverHeader>
                <div className="mt-3 flex flex-col gap-2">
                    {SHORTCUTS.map(({ keys, label }) => (
                        <div key={label} className="flex items-center justify-between gap-3 text-xs">
                            <span className="text-muted-foreground">{label}</span>
                            <KbdGroup>
                                {keys.map(key => <Kbd key={key}>{key}</Kbd>)}
                            </KbdGroup>
                        </div>
                    ))}
                </div>
            </PopoverContent>
        </Popover>
    )
}
