import { EventTypeBadge } from "@/components/common/events/event-badges";
import TriggerRulesActions from "@/components/common/events/trigger-rules/actions/trigger-rules-actions";
import { useWebSocket } from "@/hooks/useWebSocket";
import { useAppDispatch } from "@/store/hooks";
import { triggerRuleUpdated } from "@/store/slices/triggerRulesSlice";
import type { TriggerRule } from "@/types";
import { Button } from "@pes/ui/components/button";
import { Card, CardContent, CardHeader, CardTitle } from "@pes/ui/components/card";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuItem } from "@pes/ui/components/dropdown-menu";
import { Separator } from "@pes/ui/components/separator";
import { Switch } from "@pes/ui/components/switch";
import { MoreVertical, Edit, Trash2, Activity, Zap, Tag } from "lucide-react";
import { toast } from "sonner";


export function TriggerRuleLabelBadge({ name }: { name: string }) {
    const color = "bg-violet-500/15 text-violet-300 border-violet-500/30"

    return (
        <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-medium border font-mono ${color}`}>
            {name}
        </span>
    );
}


export default function TriggerRulesCard({ triggerRule }: { triggerRule: TriggerRule }) {
    const dispatch = useAppDispatch()
    const { sendCommand } = useWebSocket();

    const toggleStatus = async () => {
        try {
            const newStatus = !triggerRule.enabled;

            dispatch(triggerRuleUpdated({
                id: triggerRule.id,
                changes: { enabled: newStatus }
            }));

            // await sendCommand('sensors:update', {
            //     [sensorId]: {
            //         alarm_enable: newStatus,
            //     },
            // });
        } catch (err: unknown) {
            const error: Error = err as Error;

            toast.error("Can't update TriggerRule status", {
                description: (error as Error).message,
                position: "top-right",
            })

            console.error('Failed to update TriggerRule:', error);
        }
    };

    return (
        <Card className="">
            <CardHeader className="flex flex-row justify-between items-center">
                <CardTitle className="flex gap-2">
                    <div className="p-2 rounded-lg bg-[#161226] border border-purple-800/40" >
                        <Zap size={14} className="text-violet-400" />
                    </div>
                    <div className="flex flex-col justify-center">
                        <div className="font-mono text-xs">
                            {triggerRule.name}
                        </div>
                        <div className="font-mono text-xs text-muted-foreground/50">
                            {triggerRule.description}
                        </div>
                    </div>
                </CardTitle>

                <div className="flex items-center gap-1">
                    <Button variant="ghost" size="icon" className="h-8 w-8">
                        <Switch checked={triggerRule.enabled} onCheckedChange={toggleStatus} />
                    </Button>

                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8">
                                <MoreVertical className="h-4 w-4" />
                            </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-48">
                            <DropdownMenuLabel>Actions</DropdownMenuLabel>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem >
                                <Edit className="mr-2 h-4 w-4" />
                                <span>Edit</span>
                            </DropdownMenuItem>
                            {/* <DropdownMenuSeparator /> */}
                            <DropdownMenuItem className="text-red-600">
                                <Trash2 className="mr-2 h-4 w-4" />
                                <span>Delete</span>
                            </DropdownMenuItem>
                        </DropdownMenuContent>
                    </DropdownMenu>
                </div>

            </CardHeader>

            <CardContent>
                <div className="flex flex-col">
                    <div className="flex-row">
                        <div className="flex flex-row items-center gap-2">
                            <Activity size={15} className="text-gray-400/90" />
                            <EventTypeBadge type={triggerRule.event_type} />
                            <Tag size={15} className="text-gray-400/90" />
                            {triggerRule.labels.map((label) => (
                                <TriggerRuleLabelBadge key={label.id} name={label.name} />
                            ))}
                        </div>

                        <Separator className="my-3" />

                        <TriggerRulesActions triggerRule={triggerRule} />
                    </div>
                </div>
            </CardContent>
        </Card>
    )
}