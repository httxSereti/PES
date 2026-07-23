import TriggerRulesActions from "@/components/common/events/trigger-rules/actions/trigger-rules-actions";
import { useWebSocket } from "@/hooks/useWebSocket";
import { useAppDispatch } from "@/store/hooks";
import { triggerRuleUpdated, triggerRuleRemoved } from "@/store/slices/triggerRulesSlice";
import type { TriggerRule } from "@/types";
import { Button } from "@pes/ui/components/button";
import { Card, CardContent, CardHeader, CardTitle } from "@pes/ui/components/card";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuItem } from "@pes/ui/components/dropdown-menu";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@pes/ui/components/dialog";
import { Separator } from "@pes/ui/components/separator";
import { Switch } from "@pes/ui/components/switch";
import { MoreVertical, Edit, Trash2, Activity, Zap, Tag } from "lucide-react";
import { Link } from "react-router";
import { useState } from "react";
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
    const [confirmOpen, setConfirmOpen] = useState(false);
    const [isDeleting, setIsDeleting] = useState(false);

    const handleDelete = async () => {
        setIsDeleting(true);
        try {
            await sendCommand('trigger_rules:delete', { rule_id: triggerRule.id });

            dispatch(triggerRuleRemoved(triggerRule.id));
            setConfirmOpen(false);

            toast.success(`Trigger rule '${triggerRule.name}' deleted`, {
                position: "bottom-right",
            });
        } catch (err: unknown) {
            const error = err as Error;

            toast.error("Can't delete TriggerRule", {
                description: error.message,
                position: "top-right",
            });

            console.error('Failed to delete TriggerRule:', error);
        } finally {
            setIsDeleting(false);
        }
    };

    const toggleStatus = async () => {
        const newStatus = !triggerRule.enabled;

        try {
            dispatch(triggerRuleUpdated({
                id: triggerRule.id,
                changes: { enabled: newStatus }
            }));

            await sendCommand('trigger_rules:update', {
                rule_id: triggerRule.id,
                enabled: newStatus
            });

        } catch (err: unknown) {
            const error: Error = err as Error;

            toast.error("Can't update TriggerRule status", {
                description: (error as Error).message,
                position: "top-right",
            })

            // revert optimistic ui
            dispatch(triggerRuleUpdated({
                id: triggerRule.id,
                changes: { enabled: !newStatus }
            }));

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
                    <Switch checked={triggerRule.enabled} onCheckedChange={toggleStatus} />

                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8">
                                <MoreVertical className="h-4 w-4" />
                            </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-48">
                            <DropdownMenuLabel>Actions</DropdownMenuLabel>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem asChild>
                                <Link to={`/app/events/trigger-rules/${triggerRule.id}/edit`}>
                                    <Edit className="mr-2 h-4 w-4" />
                                    <span>Edit</span>
                                </Link>
                            </DropdownMenuItem>
                            {/* <DropdownMenuSeparator /> */}
                            <DropdownMenuItem
                                className="text-red-600"
                                onSelect={(e) => {
                                    e.preventDefault();
                                    setConfirmOpen(true);
                                }}
                            >
                                <Trash2 className="mr-2 h-4 w-4" />
                                <span>Delete</span>
                            </DropdownMenuItem>
                        </DropdownMenuContent>
                    </DropdownMenu>

                    <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
                        <DialogContent className="sm:max-w-sm">
                            <DialogHeader>
                                <DialogTitle>Delete trigger rule</DialogTitle>
                                <DialogDescription>
                                    Delete <span className="font-mono text-foreground">{triggerRule.name}</span> and its actions? This can&apos;t be undone.
                                </DialogDescription>
                            </DialogHeader>
                            <DialogFooter>
                                <Button type="button" variant="ghost" onClick={() => setConfirmOpen(false)} disabled={isDeleting}>
                                    Cancel
                                </Button>
                                <Button type="button" variant="destructive" onClick={handleDelete} disabled={isDeleting}>
                                    {isDeleting ? (
                                        <>
                                            <span className="mr-2 h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />
                                            Deleting...
                                        </>
                                    ) : (
                                        <>
                                            <Trash2 className="mr-2 h-3.5 w-3.5" /> Delete
                                        </>
                                    )}
                                </Button>
                            </DialogFooter>
                        </DialogContent>
                    </Dialog>
                </div>

            </CardHeader>

            <CardContent>
                <div className="flex flex-col">
                    <div className="flex-row">
                        <div className="flex flex-row items-center gap-2">

                            <>
                                <Activity size={15} className="text-gray-400/90" />
                                <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-medium border font-mono bg-violet-800/15 text-violet-400 border-violet-700/30`}>
                                    {triggerRule.event_type}
                                </span>
                            </>

                            {triggerRule.labels.length > 0 ? (
                                <>
                                    <Tag size={15} className="text-gray-400/90" />
                                    {triggerRule.labels.map((label) => (
                                        <TriggerRuleLabelBadge key={label.id} name={label.name} />
                                    ))}
                                </>
                            ) : null}

                        </div>

                        <Separator className="my-3" />

                        <TriggerRulesActions triggerRule={triggerRule} />
                    </div>
                </div>
            </CardContent>
        </Card>
    )
}