import { Button } from "@pes/ui/components/button";
import { Square } from "lucide-react";

import { useUnitStop } from "@/hooks/useUnitStop";

type UnitStopButtonProps = {
    unitId: string;
};

export function UnitStopButton({ unitId }: UnitStopButtonProps) {
    const { stopping, stop } = useUnitStop(unitId);

    return (
        <Button
            type="button"
            variant="ghost"
            size="icon"
            disabled={stopping}
            aria-label={`Stop ${unitId} — cancel ramps and set both channels to zero`}
            title={`Stop ${unitId} — cancel ramps and set both channels to zero`}
            className="h-7 w-7 text-red-500 hover:bg-red-500/10 hover:text-red-400"
            onClick={stop}
        >
            <Square className="size-3.5 fill-current" />
        </Button>
    );
}
