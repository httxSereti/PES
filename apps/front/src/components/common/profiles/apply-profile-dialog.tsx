import { useEffect, useState, type FormEvent } from "react";
import { toast } from "sonner";

import { Button } from "@pes/ui/components/button";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from "@pes/ui/components/dialog";
import {
    Field,
    FieldDescription,
    FieldGroup,
    FieldLabel,
} from "@pes/ui/components/field";
import { Input } from "@pes/ui/components/input";
import { Slider } from "@pes/ui/components/slider";

import { useWebSocket } from "@/hooks/useWebSocket";
import type { ProfileSummary } from "@/types";

type ApplyProfileDialogProps = {
    profile: ProfileSummary;
    open: boolean;
    onOpenChange: (open: boolean) => void;
};

export function ApplyProfileDialog({
    profile,
    open,
    onOpenChange,
}: ApplyProfileDialogProps) {
    const { sendCommand } = useWebSocket();
    const [levelPct, setLevelPct] = useState(100);
    const [duration, setDuration] = useState(-1);
    const [submitting, setSubmitting] = useState(false);

    useEffect(() => {
        if (open) {
            setLevelPct(100);
            setDuration(-1);
        }
    }, [open]);

    const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        setSubmitting(true);
        try {
            const result = await sendCommand("profiles:apply", {
                name: profile.name,
                level_pct: levelPct,
                duration,
            });

            if (result.status === "ok") {
                toast.success(`Profile "${profile.name}" queued`, {
                    description:
                        duration === -1
                            ? `Level ${levelPct}% · runs until stopped`
                            : `Level ${levelPct}% · reverts after ${duration}s`,
                    position: "bottom-right",
                });
                onOpenChange(false);
                return;
            }

            toast.error("Failed to apply profile", {
                description: result.message ?? undefined,
                position: "bottom-right",
            });
        } catch (error) {
            toast.error("Failed to apply profile", {
                description: error instanceof Error ? error.message : undefined,
                position: "bottom-right",
            });
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="gap-3 p-5 sm:max-w-[18rem]">
                <DialogHeader>
                    <DialogTitle>{`Apply "${profile.name}"`}</DialogTitle>
                    <DialogDescription>Restores the previous state when it ends.</DialogDescription>
                </DialogHeader>

                <form onSubmit={onSubmit} className="flex flex-col gap-3">
                    <FieldGroup className="gap-3">
                        <Field>
                            <div className="flex items-center justify-between">
                                <FieldLabel>Level</FieldLabel>
                                <span className="font-mono text-xs text-muted-foreground">
                                    {levelPct}%
                                </span>
                            </div>
                            <Slider
                                value={[levelPct]}
                                min={0}
                                max={150}
                                step={5}
                                onValueChange={([value]) => setLevelPct(value ?? 0)}
                            />
                            <FieldDescription>
                                Over 100% amplifies, capped by usage limits.
                            </FieldDescription>
                        </Field>

                        <Field>
                            <FieldLabel>Duration (seconds)</FieldLabel>
                            <Input
                                type="number"
                                min={-1}
                                value={duration}
                                onChange={(event) =>
                                    setDuration(Number(event.target.value))
                                }
                            />
                            <FieldDescription>-1 = until stopped.</FieldDescription>
                        </Field>
                    </FieldGroup>

                    <Button type="submit" className="w-full" disabled={submitting}>
                        {submitting ? "Queuing..." : "Apply profile"}
                    </Button>
                </form>
            </DialogContent>
        </Dialog>
    );
}
