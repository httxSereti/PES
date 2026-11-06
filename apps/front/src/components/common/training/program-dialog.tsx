import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@pes/ui/components/dialog";
import { Button } from "@pes/ui/components/button";
import { Input } from "@pes/ui/components/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@pes/ui/components/select";
import { Switch } from "@pes/ui/components/switch";
import { ArrowDown, ArrowUp, Plus, Sparkles, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { useWebSocket } from "@/hooks/useWebSocket";
import { useAppSelector } from "@/store/hooks";
import { profilesSelectors } from "@/store/slices/profilesSlice";
import type {
  TrainingProgram,
  TrainingProgramFields,
  TrainingProgramGoalType,
} from "@/types";

const NO_PROFILE = "__none__";
const MAX_STEPS = 30;
const MAX_GOALS = 10;

interface StepDraft {
  name: string;
  type: "duration" | "edges";
  value: number;
  auto_stop_on_goal: boolean;
}

interface ProgramGoalDraft {
  type: TrainingProgramGoalType;
  value: number;
}

interface ProgramDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  program?: TrainingProgram | null;
}

function defaultStep(index: number): StepDraft {
  return {
    name: `Step ${index + 1}`,
    type: "duration",
    value: 10,
    auto_stop_on_goal: true,
  };
}

function stepDraftFrom(program: TrainingProgram): StepDraft[] {
  if (program.steps.length === 0) return [defaultStep(0)];
  return program.steps.map((step) => {
    const duration = step.goals.find((goal) => goal.type === "duration");
    const goal = duration ?? step.goals[0];
    return {
      name: step.name,
      type: goal?.type === "edges" ? "edges" : "duration",
      value:
        goal?.type === "edges"
          ? (goal?.value ?? 1)
          : Math.max(0.5, (goal?.value ?? 600) / 60),
      auto_stop_on_goal: step.auto_stop_on_goal,
    };
  });
}

function goalDraftFrom(program: TrainingProgram): ProgramGoalDraft[] {
  return program.goals.map((goal) => ({
    type: goal.type === "sessions" ? "sessions" : "duration",
    value: goal.type === "duration" ? Math.max(1, goal.value / 60) : goal.value,
  }));
}

export function ProgramDialog({
  open,
  onOpenChange,
  program = null,
}: ProgramDialogProps) {
  const { sendCommand } = useWebSocket();
  const profiles = useAppSelector(profilesSelectors.selectAll);
  const profilesInitialized = useAppSelector(
    (state) => state.profiles.initialized,
  );

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [steps, setSteps] = useState<StepDraft[]>([defaultStep(0)]);
  const [goals, setGoals] = useState<ProgramGoalDraft[]>([]);
  const [rewardProfile, setRewardProfile] = useState<string | null>(null);
  const [rewardLevel, setRewardLevel] = useState(80);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setName(program?.name ?? "");
    setDescription(program?.description ?? "");
    setSteps(program ? stepDraftFrom(program) : [defaultStep(0)]);
    setGoals(program ? goalDraftFrom(program) : []);
    setRewardProfile(program?.reward_profile ?? null);
    setRewardLevel(program?.reward_level_pct ?? 80);
    setError(null);
  }, [open, program]);

  useEffect(() => {
    if (open && !profilesInitialized) {
      void sendCommand("profiles:list").catch(() => undefined);
    }
  }, [open, profilesInitialized, sendCommand]);

  function updateStep(index: number, changes: Partial<StepDraft>) {
    setSteps((current) =>
      current.map((step, stepIndex) =>
        stepIndex === index ? { ...step, ...changes } : step,
      ),
    );
  }

  function moveStep(index: number, direction: -1 | 1) {
    setSteps((current) => {
      const target = index + direction;
      const moved = current[index];
      if (!moved || target < 0 || target >= current.length) return current;
      const next = [...current];
      next.splice(index, 1);
      next.splice(target, 0, moved);
      return next;
    });
  }

  function updateGoal(index: number, changes: Partial<ProgramGoalDraft>) {
    setGoals((current) =>
      current.map((goal, goalIndex) =>
        goalIndex === index ? { ...goal, ...changes } : goal,
      ),
    );
  }

  async function handleSubmit() {
    if (!name.trim()) {
      setError("Program name is required");
      return;
    }
    if (
      steps.some(
        (step) =>
          !step.name.trim() || !Number.isFinite(step.value) || step.value <= 0,
      )
    ) {
      setError("Every step needs a name and a positive target");
      return;
    }
    if (goals.some((goal) => !Number.isFinite(goal.value) || goal.value <= 0)) {
      setError("Program goals need positive targets");
      return;
    }

    const payload: TrainingProgramFields = {
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
      goals: goals.map((goal) => ({
        type: goal.type,
        value:
          goal.type === "duration"
            ? Math.round(goal.value * 60)
            : Math.round(goal.value),
      })),
      reward_profile: rewardProfile,
      reward_level_pct: Math.round(rewardLevel),
    };

    setBusy(true);
    setError(null);
    try {
      const result = await sendCommand("training:program_save", {
        program_id: program?.id ?? null,
        ...payload,
      });
      if (result.status !== "ok") {
        setError(result.message ?? "Failed to save the program");
        return;
      }
      toast.success(program ? "Program updated" : "Program created", {
        position: "bottom-right",
      });
      onOpenChange(false);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to save the program",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto md:max-w-3xl">
        <DialogHeader>
          <DialogTitle>
            {program ? "Edit training program" : "New training program"}
          </DialogTitle>
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
            <div className="flex items-center justify-between">
              <p className="text-xs font-medium text-muted-foreground">Steps</p>
              <span className="text-[10px] text-muted-foreground/60">
                {steps.length}/{MAX_STEPS}
              </span>
            </div>
            {steps.map((step, index) => (
              <div
                key={index}
                className="flex flex-wrap items-center gap-2 rounded-lg border border-border/60 p-2"
              >
                <div className="flex flex-col gap-0.5">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-xs"
                    aria-label={`Move step ${index + 1} up`}
                    disabled={index === 0}
                    onClick={() => moveStep(index, -1)}
                  >
                    <ArrowUp size={12} />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-xs"
                    aria-label={`Move step ${index + 1} down`}
                    disabled={index === steps.length - 1}
                    onClick={() => moveStep(index, 1)}
                  >
                    <ArrowDown size={12} />
                  </Button>
                </div>
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
              disabled={steps.length >= MAX_STEPS}
              onClick={() =>
                setSteps((current) => [...current, defaultStep(current.length)])
              }
            >
              <Plus size={13} />
              Add step
            </Button>
          </div>

          <div className="space-y-2 rounded-lg border border-border/40 p-3">
            <div className="flex items-center justify-between gap-2">
              <div>
                <p className="text-xs font-medium">Program goals (optional)</p>
                <p className="text-[10px] text-muted-foreground/60">
                  Counted across succeeded sessions linked to this program.
                </p>
              </div>
              <Button
                type="button"
                variant="outline"
                size="xs"
                disabled={goals.length >= MAX_GOALS}
                onClick={() =>
                  setGoals((current) => [
                    ...current,
                    { type: "sessions", value: 1 },
                  ])
                }
              >
                <Plus size={13} />
                Add goal
              </Button>
            </div>
            {goals.length === 0 ? (
              <p className="text-[11px] text-muted-foreground/60">
                No whole-program goal: every step is enough to complete it.
              </p>
            ) : (
              goals.map((goal, index) => (
                <div key={index} className="flex flex-wrap items-center gap-2">
                  <Select
                    value={goal.type}
                    onValueChange={(value) =>
                      updateGoal(index, {
                        type: value as TrainingProgramGoalType,
                      })
                    }
                  >
                    <SelectTrigger className="w-52">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="sessions">
                        Succeeded sessions
                      </SelectItem>
                      <SelectItem value="duration">
                        Cumulative duration (min)
                      </SelectItem>
                    </SelectContent>
                  </Select>
                  <Input
                    type="number"
                    min={1}
                    step={1}
                    value={goal.value}
                    onChange={(event) =>
                      updateGoal(index, { value: Number(event.target.value) })
                    }
                    className="w-24"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-label="Remove program goal"
                    onClick={() =>
                      setGoals((current) =>
                        current.filter((_, goalIndex) => goalIndex !== index),
                      )
                    }
                  >
                    <Trash2 size={13} />
                  </Button>
                </div>
              ))
            )}
          </div>

          <div className="grid grid-cols-1 gap-3 rounded-lg border border-amber-500/20 bg-amber-500/5 p-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <p className="flex items-center gap-1.5 text-xs font-medium">
                <Sparkles size={12} className="text-amber-500" />
                Automatic reward
              </p>
              <Select
                value={rewardProfile ?? NO_PROFILE}
                onValueChange={(value) =>
                  setRewardProfile(value === NO_PROFILE ? null : value)
                }
              >
                <SelectTrigger aria-label="Program reward profile">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_PROFILE}>No reward</SelectItem>
                  {profiles.map((profile) => (
                    <SelectItem key={profile.name} value={profile.name}>
                      {profile.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <p className="text-xs font-medium">Reward level (%)</p>
              <Input
                type="number"
                min={0}
                max={100}
                step={5}
                value={rewardLevel}
                onChange={(event) =>
                  setRewardLevel(
                    Math.max(0, Math.min(100, Number(event.target.value) || 0)),
                  )
                }
              />
            </div>
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button disabled={busy} onClick={() => void handleSubmit()}>
              {program ? "Save changes" : "Create program"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
