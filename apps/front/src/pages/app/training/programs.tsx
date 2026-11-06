import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@pes/ui/components/card";
import { Button } from "@pes/ui/components/button";
import { Progress } from "@pes/ui/components/progress";
import {
  Check,
  Copy,
  Download,
  ListChecks,
  Pencil,
  Play,
  Plus,
  Sparkles,
  Trash2,
  Upload,
} from "lucide-react";
import { toast } from "sonner";

import { useWebSocket, useWebSocketEvent } from "@/hooks/useWebSocket";
import { useAppSelector } from "@/store/hooks";
import { hasPermission } from "@/lib/permissions";
import {
  downloadJson,
  exportDateStamp,
  readJsonFile,
  slugify,
} from "@/lib/training-export";
import { ConfirmDeleteDialog } from "@/components/common/dialogs/confirm-delete-dialog";
import { ProgramDialog } from "@/components/common/training/program-dialog";
import { TemplatePanel } from "@/components/common/training/template-panel";
import { Permission } from "@/types";
import type { TrainingProgram, TrainingProgramFields } from "@/types";

export function meta() {
  return [{ title: "PES | Training - Programs" }];
}

function stepSummary(program: TrainingProgram, index: number): string {
  const step = program.steps[index];
  return (step?.goals ?? [])
    .map((goal) =>
      goal.type === "duration"
        ? `${Math.round(goal.value / 60)} min`
        : `${goal.value} edges`,
    )
    .join(" + ");
}

function programGoalsSummary(program: TrainingProgram): string {
  return program.goals
    .map((goal) =>
      goal.type === "sessions"
        ? `${goal.value} succeeded sessions`
        : `${Math.round(goal.value / 60)} min cumulative`,
    )
    .join(" + ");
}

function programFields(program: TrainingProgram): TrainingProgramFields {
  return {
    name: program.name,
    description: program.description,
    steps: program.steps.map((step) => ({
      name: step.name,
      goals: step.goals.map((goal) => ({
        type: goal.type === "edges" ? "edges" : "duration",
        value: goal.value,
      })),
      auto_stop_on_goal: step.auto_stop_on_goal,
    })),
    goals: program.goals.map((goal) => ({
      type: goal.type === "sessions" ? "sessions" : "duration",
      value: goal.value,
    })),
    reward_profile: program.reward_profile,
    reward_level_pct: program.reward_level_pct,
  };
}

function importedProgram(value: unknown): TrainingProgramFields {
  const wrapped = value as { kind?: string; program?: unknown };
  const raw =
    wrapped && wrapped.kind === "pes.training.program"
      ? wrapped.program
      : value;
  if (!raw || typeof raw !== "object") {
    throw new Error("Invalid program file");
  }
  const data = raw as Record<string, unknown>;
  if (
    typeof data.name !== "string" ||
    !Array.isArray(data.steps) ||
    !Array.isArray(data.goals)
  ) {
    throw new Error("Invalid program file");
  }
  return {
    name: data.name.slice(0, 120),
    description: typeof data.description === "string" ? data.description : null,
    steps: data.steps as TrainingProgramFields["steps"],
    goals: data.goals as TrainingProgramFields["goals"],
    reward_profile:
      typeof data.reward_profile === "string" ? data.reward_profile : null,
    reward_level_pct: Number(data.reward_level_pct) || 80,
  };
}

export default function TrainingProgramsPage() {
  const navigate = useNavigate();
  const { sendCommand } = useWebSocket();
  const user = useAppSelector((state) => state.auth.user);
  const canManage = hasPermission(user, Permission.TRAINING_EDGING_MANAGE);
  const fileInput = useRef<HTMLInputElement>(null);

  const [programs, setPrograms] = useState<TrainingProgram[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<TrainingProgram | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<TrainingProgram | null>(
    null,
  );

  const load = useCallback(async () => {
    if (!canManage) {
      setPrograms([]);
      return;
    }
    try {
      const result = await sendCommand("training:programs");
      if (result.status !== "ok") {
        setError(result.message ?? "Failed to load programs");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load programs");
    }
  }, [canManage, sendCommand]);

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

  function openEditor(program: TrainingProgram | null) {
    setEditing(program);
    setEditorOpen(true);
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

  async function saveProgram(
    fields: TrainingProgramFields,
    programId: string | null,
  ) {
    const result = await sendCommand("training:program_save", {
      program_id: programId,
      ...fields,
    });
    if (result.status !== "ok") {
      throw new Error(result.message ?? "Failed to save the program");
    }
  }

  async function handleDuplicate(program: TrainingProgram) {
    try {
      await saveProgram(
        {
          ...programFields(program),
          name: `${program.name} (copy)`.slice(0, 120),
        },
        null,
      );
      toast.success("Program duplicated", { position: "bottom-right" });
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to duplicate the program",
      );
    }
  }

  function handleExport(program: TrainingProgram) {
    downloadJson(
      `training-program-${slugify(program.name)}-${exportDateStamp()}.json`,
      {
        kind: "pes.training.program",
        version: 1,
        exported_at: new Date().toISOString(),
        program: programFields(program),
      },
    );
  }

  async function handleImport(file: File) {
    try {
      await saveProgram(importedProgram(await readJsonFile(file)), null);
      toast.success("Program imported", { position: "bottom-right" });
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to import the program",
      );
    } finally {
      if (fileInput.current) fileInput.current.value = "";
    }
  }

  return (
    <div className="space-y-4 px-4 md:px-5">
      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Programs & templates</h2>
          <p className="text-xs text-muted-foreground">
            Progressive session plans — each succeeded step unlocks the next.
          </p>
        </div>
        {canManage && (
          <div className="flex flex-wrap gap-2">
            <input
              ref={fileInput}
              type="file"
              accept="application/json,.json"
              className="hidden"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void handleImport(file);
              }}
            />
            <Button
              variant="outline"
              onClick={() => fileInput.current?.click()}
            >
              <Upload size={14} />
              Import JSON
            </Button>
            <Button onClick={() => openEditor(null)}>
              <Plus size={14} />
              New program
            </Button>
          </div>
        )}
      </div>

      <TemplatePanel canManage={canManage} />

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
              Create a plan of sessions with increasing goals, optional
              whole-program goals and an automatic final reward.
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
                      <div className="flex flex-wrap items-center gap-2">
                        <CardTitle className="truncate text-base">
                          {program.name}
                        </CardTitle>
                        {program.completed && (
                          <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-medium text-emerald-700 dark:text-emerald-300">
                            Complete
                          </span>
                        )}
                      </div>
                      <CardDescription>
                        {program.description || "No description"}
                      </CardDescription>
                    </div>
                    {canManage && (
                      <div className="flex shrink-0 items-center gap-1">
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          aria-label={`Edit program ${program.name}`}
                          onClick={() => openEditor(program)}
                        >
                          <Pencil size={13} />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          aria-label={`Duplicate program ${program.name}`}
                          onClick={() => void handleDuplicate(program)}
                        >
                          <Copy size={13} />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          aria-label={`Export program ${program.name}`}
                          onClick={() => handleExport(program)}
                        >
                          <Download size={13} />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          aria-label={`Delete program ${program.name}`}
                          onClick={() => setDeleteTarget(program)}
                        >
                          <Trash2 size={13} />
                        </Button>
                      </div>
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
                            {stepSummary(program, index)}
                          </span>
                        </li>
                      );
                    })}
                  </ol>

                  {(program.goals.length > 0 || program.reward_profile) && (
                    <div className="space-y-1 rounded-md border border-border/40 bg-muted/20 px-2.5 py-2 text-[11px]">
                      {program.goals.length > 0 && (
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="text-muted-foreground">
                            Goals: {programGoalsSummary(program)}
                          </span>
                          <span className="font-mono text-[10px]">
                            {program.sessions_succeeded} sessions ·{" "}
                            {Math.round(program.duration_seconds / 60)} min
                          </span>
                        </div>
                      )}
                      {program.reward_profile && (
                        <p className="flex items-center gap-1 text-amber-600 dark:text-amber-300">
                          <Sparkles size={11} />
                          Reward: {program.reward_profile} at{" "}
                          {program.reward_level_pct}%
                          {program.rewarded_at ? " (applied)" : ""}
                        </p>
                      )}
                    </div>
                  )}

                  {canManage && (
                    <div className="flex justify-end">
                      <Button
                        size="sm"
                        disabled={busy || program.next_step === null}
                        onClick={() => void handleStart(program)}
                      >
                        <Play size={13} />
                        {program.next_step === null
                          ? program.completed
                            ? "Program complete"
                            : "All steps done"
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

      <ProgramDialog
        open={editorOpen}
        onOpenChange={(open) => {
          setEditorOpen(open);
          if (!open) setEditing(null);
        }}
        program={editing}
      />

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
