import { Card, CardContent, CardHeader, CardTitle } from "@pes/ui/components/card"
import { Computer } from "lucide-react"
import type { RampTarget } from "@/types"
import { UnitRamps } from "./unit-ramps"

const UNITS: RampTarget["unit"][] = ["UNIT1", "UNIT2", "UNIT3"];

export function RampsPanel() {
    return (
        <div className="w-full px-5 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 mb-5">
            {UNITS.map((unitId) => (
                <Card key={unitId}>
                    <CardHeader className="flex flex-row justify-between items-center">
                        <CardTitle className="flex gap-2">
                            <div className="p-2 rounded-lg accent-tile">
                                <Computer size={18} className="accent-tile-icon" />
                            </div>
                            <div className="flex flex-col justify-center">
                                <div className="flex text-sm">{unitId}</div>
                            </div>
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <UnitRamps unitId={unitId} />
                    </CardContent>
                </Card>
            ))}
        </div>
    );
}
