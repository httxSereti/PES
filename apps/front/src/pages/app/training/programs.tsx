import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@pes/ui/components/card";
import { Button } from "@pes/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@pes/ui/components/dialog";
import { Input } from "@pes/ui/components/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@pes/ui/components/select";
import { Switch } from "@pes/ui/components/switch";
import { Progress } from "@pes/ui/components/progress";
import { Check, ListChecks, Play, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { useWebSocket, useWebSocketEvent } from "@/hooks/useWebSocket";
import { useAppSelector } from "@/store/hooks";
import { hasPermission } from "@/lib/permissions";
import { ConfirmDeleteDialog } from "@/components/common/dialogs/confirm-delete-dialog";
import { Permission } from "@/types";
import type { TrainingProgram } from "@/types";

export function meta() {
  return [{ title: "PES | Training - Programs" }];
}

interface StepDraft {
  name: string;
  type: "duration" | "edges";
  value: number;
  auto_stop_on_goal: boolean;
}

function defaultStep(index: number): StepDraft {
  return {
    name: `Step ${index + 1}`,
    type: "duration",
    value: 10,
    auto_stop_on_goal: true,
  };
}

function goalSummary(program: TrainingProgram, index: number): string {
  const step = program.steps[index];
  return (step?.goals ?? [])
    .map((goal) =>
      goal.type === "duration"
        ? `${Math.round(goal.value / 60)} min`
        : `${goal.value} edges`,
    )
    .join(" + ");
}

export default function TrainingProgramsPage() {
  const navigate = useNavigate();
  const { sendCommand } = useWebSocket();
  const user = useAppSelector((state) => state.auth.user);
  const canManage = hasPermission(user, Permission.TRAINING_EDGING_MANAGE);

  const [programs, setPrograms] = useState<TrainingProgram[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [createOpen, setCreateOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [steps, setSteps] = useState<StepDraft[]>([defaultStep(0)]);
  const [deleteTarget, setDeleteTarget] = useState<TrainingProgram | null>(null);

  const load = useCallback(async () => {
    try {
      const result = await sendCommand("training:programs");
      if (result.status !== "ok") {
        setError(result.message ?? "Failed to load programs");
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to load programs",
      );
    }
  }, [sendCommand]);

  useEffect(() => {
    void load();
  }, [load]);

  useWebSocketEvent("training:programs", (payload) => {
    setPrograms(payload);
    setError(null);
  });

  useWebSocketEvent("training:session", (session) => {
    if (
      session.status === "succeeded" ||
      session.status === "failed" ||
      session.status === "cancelled"
    ) {
      void load();
    }
  });

  function resetForm() {
    setName("");
    setDescription("");
    setSteps([defaultStep(0)]);
  }

  function updateStep(index: number, changes: Partial<StepDraft>) {
    setSteps((current) =>
      current.map((step, stepIndex) =>
        stepIndex === index ? { ...step, ...changes } : step,
      ),
    );
  }

  async function handleCreate() {
    if (!name.trim()) {
      setError("Program name is required");
      return;
    }
    if (
      steps.some(
        (step) =>
          !step.name.trim() ||
          !Number.isFinite(step.value) ||
          step.value <= 0,
      )
    ) {
      setError("Every step needs a name and a positive target");
      return;
    }

    setBusy(true);
    setError(null);
    try {
      const result = await sendCommand("training:program_save", {
        name: name.trim(),
        description: description.trim() || null,
        steps: steps.map((step) => ({
          name: step.name.trim(),
          goals: [
            {
              type: step.type,
              value:
                step.type === "duration"
                  ? Math.round(step.value * 60)
                  : Math.round(step.value),
            },
          ],
          auto_stop_on_goal: step.auto_stop_on_goal,
        })),
      });
      if (result.status !== "ok") {
        setError(result.message ?? "Failed to save the program");
        return;
      }
      toast.success("Program created", { position: "bottom-right" });
      setCreateOpen(false);
      resetForm();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to save the program",
      );
    } finally {
      setBusy(false);
    }
  }

  async function handleStart(program: TrainingProgram) {
    setBusy(true);
    setError(null);
    try {
      const result = await sendCommand("training:program_start", {
        program_id: program.id,
      });
      if (result.status !== "ok" || !result.session) {
        setError(result.message ?? "Failed to start the next step");
        return;
      }
      navigate(`/app/training/edging/${result.session.id}`);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to start the next step",
      );
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    setBusy(true);
    try {
      const result = await sendCommand("training:program_delete", {
        program_id: deleteTarget.id,
      });
      if (result.status !== "ok") {
        setError(result.message ?? "Failed to delete the program");
        return;
      }
      toast.success("Program deleted", { position: "bottom-right" });
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to delete the program",
      );
    } finally {
      setBusy(false);
      setDeleteTarget(null);
    }
  }

  return (
    <div className="space-y-4 px-4 md:px-5">
      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Programs</h2>
          <p className="text-xs text-muted-foreground">
            Progressive session plans — each succeeded step unlocks the next.
          </p>
        </div>
        {canManage && (
          <Button onClick={() => setCreateOpen(true)}>
            <Plus size={14} />
            New program
          </Button>
        )}
      </div>

      {programs === null ? (
        <Card>
          <CardContent className="py-8 text-center text-sm text-muted-foreground">
            Loading programs…
          </CardContent>
        </Card>
      ) : programs.length === 0 ? (
        <Card className="border-dashed shadow-none">
          <CardHeader className="items-center text-center">
            <span className="accent-tile mx-auto flex h-12 w-12 items-center justify-center rounded-lg">
              <ListChecks size={18} className="accent-tile-icon" />
            </span>
            <CardTitle className="text-center text-base">
              No programs yet
            </CardTitle>
            <CardDescription className="mx-auto max-w-sm text-center">
              Create a plan of sessions with increasing goals. Start the next
              step from here, then let the Host run it.
            </CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {programs.map((program) => {
            const progress =
              program.step_count > 0
                ? Math.round(
                    (program.completed_steps / program.step_count) * 100,
                  )
                : 0;
            return (
              <Card key={program.id}>
                <CardHeader>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <CardTitle className="truncate text-base">
                        {program.name}
                      </CardTitle>
                      <CardDescription>
                        {program.description || "No description"}
                      </CardDescription>
                    </div>
                    {canManage && (
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label={`Delete program ${program.name}`}
                        onClick={() => setDeleteTarget(program)}
                      >
                        <Trash2 size={13} />
                      </Button>
                    )}
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                      <span>
                        {program.completed_steps} / {program.step_count} steps
                        completed
                      </span>
                      <span className="font-mono tabular-nums">
                        {progress}%
                      </span>
                    </div>
                    <Progress
                      value={progress}
                      className="h-1.5 bg-foreground/10 [&_[data-slot=progress-indicator]]:bg-violet-500"
                    />
                  </div>

                  <ol className="space-y-1.5">
                    {program.steps.map((step, index) => {
                      const completed =
                        program.completed_step_indices.includes(index);
                      const next = index === program.next_step;
                      return (
                        <li
                          key={`${program.id}-${index}`}
                          className={`flex items-center gap-2 rounded-md border px-2.5 py-2 text-xs ${
                            next
                              ? "border-violet-500/40 bg-violet-500/10"
                              : "border-border/50"
                          }`}
                        >
                          <span
                            className={`flex size-4 shrink-0 items-center justify-center rounded-full text-[9px] ${
                              completed
                                ? "bg-emerald-500 text-white"
                                : "bg-muted text-muted-foreground"
                            }`}
                          >
                            {completed ? <Check size={10} /> : index + 1}
                          </span>
                          <span className="min-w-0 flex-1 truncate">
                            {step.name}
                          </span>
                          <span className="shrink-0 text-[10px] text-muted-foreground/70">
                            {goalSummary(program, index)}
                          </span>
                        </li>
                      );
                    })}
                  </ol>

                  {canManage && (
                    <div className="flex justify-end">
                      <Button
                        size="sm"
                        disabled={busy || program.next_step === null}
                        onClick={() => void handleStart(program)}
                      >
                        <Play size={13} />
                        {program.next_step === null
                          ? "Program complete"
                          : `Start step ${program.next_step + 1}`}
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="md:max-w-2xl">
          <DialogHeader>
            <DialogTitle>New training program</DialogTitle>
            <DialogDescription>
              Steps are played in order. A step is completed when its session
              succeeds.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Input
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="Program name"
                maxLength={120}
              />
              <Input
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                placeholder="Description (optional)"
              />
            </div>

            <div className="space-y-2">
              {steps.map((step, index) => (
                <div
                  key={index}
                  className="flex flex-wrap items-center gap-2 rounded-lg border border-border/60 p-2"
                >
                  <Input
                    value={step.name}
                    onChange={(event) =>
                      updateStep(index, { name: event.target.value })
                    }
                    placeholder="Step name"
                    className="min-w-36 flex-1"
                  />
                  <Select
                    value={step.type}
                    onValueChange={(value) =>
                      updateStep(index, {
                        type: value as "duration" | "edges",
                      })
                    }
                  >
                    <SelectTrigger className="w-36">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="duration">Duration (min)</SelectItem>
                      <SelectItem value="edges">Edges</SelectItem>
                    </SelectContent>
                  </Select>
                  <Input
                    type="number"
                    min={0.5}
                    step={0.5}
                    value={step.value}
                    onChange={(event) =>
                      updateStep(index, {
                        value: Number(event.target.value),
                      })
                    }
                    className="w-24"
                  />
                  <Switch
                    checked={step.auto_stop_on_goal}
                    onCheckedChange={(checked) =>
                      updateStep(index, { auto_stop_on_goal: checked })
                    }
                    aria-label="Auto-stop on success"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-label="Remove step"
                    disabled={steps.length <= 1}
                    onClick={() =>
                      setSteps((current) =>
                        current.filter((_, stepIndex) => stepIndex !== index),
                      )
                    }
                  >
                    <Trash2 size={13} />
                  </Button>
                </div>
              ))}
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={steps.length >= 30}
                onClick={() =>
                  setSteps((current) => [
                    ...current,
                    defaultStep(current.length),
                  ])
                }
              >
                <Plus size={13} />
                Add step
              </Button>
            </div>

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setCreateOpen(false)}>
                Cancel
              </Button>
              <Button disabled={busy} onClick={() => void handleCreate()}>
                Create program
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <ConfirmDeleteDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
        title={`Delete program '${deleteTarget?.name ?? ""}'?`}
        busy={busy}
        onConfirm={() => void handleDelete()}
      />
    </div>
  );
}
