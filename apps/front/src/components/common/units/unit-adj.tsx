import * as React from "react"

import { cn } from "@pes/ui/lib/utils"
import { useMediaQuery } from "@pes/ui/hooks/use-media-query"
import { Button } from "@pes/ui/components/button"
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@pes/ui/components/dialog"
import {
    Drawer,
    DrawerClose,
    DrawerContent,
    DrawerDescription,
    DrawerFooter,
    DrawerHeader,
    DrawerTitle,
    DrawerTrigger,
} from "@pes/ui/components/drawer"
import { MinusIcon, PlusIcon } from "lucide-react"
import { useAppDispatch, useAppSelector } from "@/store/hooks"
import { unitsSelectors, unitUpdated } from "@/store/slices/unitsSlice"
import { useWebSocket } from "@/hooks/useWebSocket"
import { MODE_2B } from "@/types/units.types"
import { Link } from "react-router"

export function UnitAdj({ unitId, adjId, val }: { unitId: string, adjId: "adj_1" | "adj_2", val: number | undefined }) {
    const [open, setOpen] = React.useState(false)
    const isDesktop = useMediaQuery("(min-width: 768px)")
    const unit = useAppSelector(state => unitsSelectors.selectById(state, unitId));

    if (!unit || !adjId || unit.mode === undefined)
        return null;

    const modeData = MODE_2B[unit.mode];

    if (!modeData)
        return null;

    const adjLabel = modeData[adjId];

    if (isDesktop) {
        return (
            <Dialog open={open} onOpenChange={setOpen}>
                <DialogTrigger asChild>
                    <Button variant="outline" className="cursor-pointer">
                        {val}
                        <p className="text-xs text-primary/40">({adjLabel})</p>
                    </Button>
                </DialogTrigger>
                <DialogContent className="sm:max-w-[425px]">
                    <DialogHeader>
                        <DialogTitle>Update {adjId} ({adjLabel})</DialogTitle>
                        <DialogDescription>
                            Make changes to the {adjId}, adjusting the "{adjLabel}".

                            <div className="flex flex-col gap-3.5 mt-3 px-3 py-3 rounded-lg border border-border/35 bg-muted/20">
                                <p className="font-mono text-[10px] tracking-widest uppercase text-primary/40">Tips & Tricks</p>
                                <p>
                                    Depending on the mode you use, the {adjId} value will have a different meaning. See more on{" "}
                                    <span className="text-primary underline cursor-pointer"><Link to="https://e-stim.info/images/manuals/pdf/E-Stim_Systems_2106_Manual.pdf" target="_blank">2B manual</Link></span>
                                </p>
                            </div>
                        </DialogDescription>
                    </DialogHeader>
                    <AdjForm unitId={unitId} adjId={adjId} val={val} onClose={() => setOpen(false)} />
                </DialogContent>
            </Dialog>
        )
    }

    return (
        <Drawer open={open} onOpenChange={setOpen}>
            <DrawerTrigger asChild>
                <Button variant="outline" className="cursor-pointer">
                    {val} ({adjLabel})
                </Button>
            </DrawerTrigger>
            <DrawerContent>
                <DrawerHeader className="text-left">
                    <DrawerTitle>Update {adjId} ({adjLabel})</DrawerTitle>
                    <DrawerDescription>
                        Make changes to the {adjId}, adjusting the "{adjLabel}".


                        <div className="flex flex-col gap-3.5 mt-3 px-3 py-3 rounded-lg border border-border/35 bg-muted/20">
                            <p className="font-mono text-[10px] tracking-widest uppercase text-primary/40">Tips & Tricks</p>
                            <p>
                                Depending on the mode you use, the {adjId} value will have a different meaning. See more on{" "}
                                <span className="text-primary underline cursor-pointer"><Link to="https://e-stim.info/images/manuals/pdf/E-Stim_Systems_2106_Manual.pdf" target="_blank">2B manual</Link></span>
                            </p>
                        </div>
                    </DrawerDescription>
                </DrawerHeader>
                <AdjForm unitId={unitId} adjId={adjId} val={val} className="px-4" onClose={() => setOpen(false)} />
                <DrawerFooter className="pt-2">
                    <DrawerClose asChild>
                        <Button variant="outline">Cancel</Button>
                    </DrawerClose>
                </DrawerFooter>
            </DrawerContent>
        </Drawer>
    )
}

function AdjForm({ unitId, adjId, val, className, onClose }: { unitId: string, adjId: "adj_1" | "adj_2", val: number | undefined, className?: string, onClose?: () => void }) {
    const dispatch = useAppDispatch();
    const { sendCommand } = useWebSocket();

    const maxVal = 100;
    const [localVal, setLocalVal] = React.useState(val ?? 0);

    React.useEffect(() => {
        if (val !== undefined) setLocalVal(val);
    }, [val]);

    const changeLevel = (newVal: number) => {
        if (newVal < 0 || newVal > (maxVal ?? 100)) return;
        setLocalVal(newVal);
    };

    const updateLevel = async () => {
        try {
            await sendCommand('units:update_adj', {
                [unitId]: {
                    [adjId]: localVal,
                },
            });

            dispatch(unitUpdated({
                id: unitId,
                changes: { [adjId]: localVal }
            }));

            onClose?.();
        } catch (error) {
            console.error(`Failed to update ${adjId} to ${localVal}:`, error);
        }
    };

    return (
        <div className={cn("flex flex-col gap-2", className)}>
            <div className="flex items-center justify-center gap-6 py-6">
                <Button variant="outline" size="icon" onClick={() => changeLevel(localVal - 1)}>
                    <MinusIcon />
                </Button>
                <span className="font-mono text-4xl font-bold w-16 text-center">{localVal}</span>
                <Button variant="outline" size="icon" onClick={() => changeLevel(localVal + 1)}>
                    <PlusIcon />
                </Button>
            </div>

            <Button onClick={updateLevel} className="w-full">
                Update
            </Button>
        </div>
    )
}
