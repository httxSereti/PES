import { type FC } from "react"
import { Button } from "@pes/ui/components/button"
import { useAppSelector } from "@/store/hooks"
import { unitsSelectors } from "@/store/slices/unitsSlice"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@pes/ui/components/dropdown-menu"
import { Link, MoreVertical, PowerOff } from "lucide-react"

type UnitDropdownProps = {
    unitId: string;
};

export const UnitDropdown: FC<UnitDropdownProps> = ({ unitId }) => {
    const unit = useAppSelector(state => unitsSelectors.selectById(state, unitId));

    if (!unit)
        return null;

    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8">
                    <MoreVertical className="h-4 w-4" />
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuLabel>Actions</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem>
                    <Link className="mr-2 h-4 w-4" />
                    <span>Link Channel A & B</span>
                </DropdownMenuItem>
                <DropdownMenuItem className="text-red-600">
                    <PowerOff className="mr-2 h-4 w-4" />
                    <span>Stop {unit.id}</span>
                </DropdownMenuItem>
            </DropdownMenuContent>
        </DropdownMenu>
    )
}
