import { useCallback, useEffect, useRef, useState } from "react";
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
import {
  Copy,
  Download,
  Pencil,
  Plus,
  Trash2,
  Upload,
  Users,
} from "lucide-react";
import { toast } from "sonner";

import { useWebSocket, useWebSocketEvent } from "@/hooks/useWebSocket";
import {
  downloadJson,
  readJsonFile,
  slugify,
  exportDateStamp,
} from "@/lib/training-export";
import type { TrainingSessionFields, TrainingTemplate } from "@/types";
import { ConfirmDeleteDialog } from "@/components/common/dialogs/confirm-delete-dialog";
import { SessionForm } from "./session-form";

interface TemplatePanelProps {
  canManage: boolean;
}

function templateInitial(
  template: TrainingTemplate,
): Partial<TrainingSessionFields> {
  return {
    name: template.name,
    goals: template.goals.map((goal) => ({
      type: goal.type === "edges" ? "edges" : "duration",
      value: goal.value,
    })),
    auto_stop_on_goal: template.auto_stop_on_goal,
    mode: template.mode === "guided" ? "guided" : "manual",
    guided_config: template.guided_config,
    participant_ids: template.participant_ids ?? [],
    min_edge_interval_seconds: template.min_edge_interval_seconds,
    notification_level: template.notification_level,
    allow_partner_edges: template.allow_partner_edges,
    visibility: template.visibility,
  };
}

function goalSummary(template: TrainingTemplate): string {
  return template.goals
    .map((goal) =>
      goal.type === "duration"
        ? `${Math.round(goal.value / 60)} min`
        : `${goal.value} edges`,
    )
    .join(" + ");
}

function importedTemplate(value: unknown): Partial<TrainingSessionFields> {
  const wrapped = value as {
    kind?: string;
    template?: unknown;
  };
  const raw =
    wrapped && wrapped.kind === "pes.training.template"
      ? wrapped.template
      : value;
  if (!raw || typeof raw !== "object") {
    throw new Error("Invalid template file");
  }
  const data = raw as Record<string, unknown>;
  if (typeof data.name !== "string" || !Array.isArray(data.goals)) {
    throw new Error("Invalid template file");
  }
  return {
    name: data.name.slice(0, 120),
    goals: data.goals as TrainingSessionFields["goals"],
    auto_stop_on_goal: Boolean(data.auto_stop_on_goal),
    mode: data.mode === "guided" ? "guided" : "manual",
    guided_config:
      (data.guided_config as TrainingSessionFields["guided_config"]) ?? null,
    participant_ids: Array.isArray(data.participant_ids)
      ? (data.participant_ids as string[])
      : [],
    min_edge_interval_seconds: Number(data.min_edge_interval_seconds) || 0,
    notification_level:
      (data.notification_level as TrainingSessionFields["notification_level"]) ??
      "all",
    allow_partner_edges: Boolean(data.allow_partner_edges),
    visibility: data.visibility === "everyone" ? "everyone" : "private",
  };
}

export function TemplatePanel({ canManage }: TemplatePanelProps) {
  const { sendCommand } = useWebSocket();
  const fileInput = useRef<HTMLInputElement>(null);

  const [templates, setTemplates] = useState<TrainingTemplate[] | null>(
    canManage ? null : [],
  );
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<TrainingTemplate | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<TrainingTemplate | null>(
    null,
  );

  const load = useCallback(async () => {
    if (!canManage) return;
    try {
      const result = await sendCommand("training:templates");
      if (result.status !== "ok") {
        setError(result.message ?? "Failed to load templates");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load templates");
    }
  }, [canManage, sendCommand]);

  useEffect(() => {
    void load();
  }, [load]);

  useWebSocketEvent("training:templates", (payload) => {
    setTemplates(payload);
    setError(null);
  });

  function openEditor(template: TrainingTemplate | null) {
    setEditing(template);
    setEditorOpen(true);
  }

  async function saveTemplate(
    fields: TrainingSessionFields,
    templateId: string | null,
  ) {
    const result = await sendCommand("training:template_save", {
      template_id: templateId,
      name: fields.name,
      goals: fields.goals,
      auto_stop_on_goal: fields.auto_stop_on_goal,
      mode: fields.mode,
      guided_config: fields.guided_config ?? null,
      participant_ids: fields.participant_ids ?? [],
      min_edge_interval_seconds: fields.min_edge_interval_seconds,
      notification_level: fields.notification_level,
      allow_partner_edges: fields.allow_partner_edges,
      visibility: fields.visibility,
    });
    if (result.status !== "ok") {
      throw new Error(result.message ?? "Failed to save the template");
    }
  }

  async function handleSubmit(fields: TrainingSessionFields) {
    try {
      await saveTemplate(fields, editing?.id ?? null);
      toast.success(editing ? "Template updated" : "Template created", {
        position: "bottom-right",
      });
      setEditorOpen(false);
      setEditing(null);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to save the template",
      );
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    setBusy(true);
    try {
      const result = await sendCommand("training:template_delete", {
        template_id: deleteTarget.id,
      });
      if (result.status !== "ok") {
        setError(result.message ?? "Failed to delete the template");
        return;
      }
      toast.success("Template deleted", { position: "bottom-right" });
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to delete the template",
      );
    } finally {
      setBusy(false);
      setDeleteTarget(null);
    }
  }

  async function handleDuplicate(template: TrainingTemplate) {
    try {
      await saveTemplate(
        {
          ...templateInitial(template),
          name: `${template.name} (copy)`.slice(0, 120),
        } as TrainingSessionFields,
        null,
      );
      toast.success("Template duplicated", { position: "bottom-right" });
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to duplicate the template",
      );
    }
  }

  function handleExport(template: TrainingTemplate) {
    downloadJson(
      `training-template-${slugify(template.name)}-${exportDateStamp()}.json`,
      {
        kind: "pes.training.template",
        version: 1,
        exported_at: new Date().toISOString(),
        template: {
          name: template.name,
          goals: template.goals,
          auto_stop_on_goal: template.auto_stop_on_goal,
          mode: template.mode,
          guided_config: template.guided_config,
          participant_ids: template.participant_ids,
          min_edge_interval_seconds: template.min_edge_interval_seconds,
          notification_level: template.notification_level,
          allow_partner_edges: template.allow_partner_edges,
          visibility: template.visibility,
        },
      },
    );
  }

  async function handleImport(file: File) {
    try {
      const fields = importedTemplate(await readJsonFile(file));
      await saveTemplate(fields as TrainingSessionFields, null);
      toast.success("Template imported", { position: "bottom-right" });
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to import the template",
      );
    } finally {
      if (fileInput.current) fileInput.current.value = "";
    }
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <CardTitle className="text-base">Templates</CardTitle>
            <CardDescription>
              Reusable session presets: goals, mode, participants and defaults.
            </CardDescription>
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
                size="sm"
                onClick={() => fileInput.current?.click()}
              >
                <Upload size={13} />
                Import JSON
              </Button>
              <Button size="sm" onClick={() => openEditor(null)}>
                <Plus size={13} />
                New template
              </Button>
            </div>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        {error && <p className="text-sm text-destructive">{error}</p>}
        {templates === null ? (
          <p className="py-3 text-xs text-muted-foreground">
            Loading templates…
          </p>
        ) : templates.length === 0 ? (
          <p className="py-3 text-xs text-muted-foreground">
            No template yet. Save a session as a template to reuse it later.
          </p>
        ) : (
          templates.map((template) => (
            <div
              key={template.id}
              className="flex flex-wrap items-center gap-3 rounded-lg border border-border/50 px-3 py-2"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{template.name}</p>
                <p className="truncate text-[11px] text-muted-foreground">
                  {goalSummary(template)} · {template.mode}
                  {template.participant_ids.length > 0 && (
                    <span className="ml-2 inline-flex items-center gap-1">
                      <Users size={10} />
                      {template.participant_ids.length}
                    </span>
                  )}
                </p>
              </div>
              {canManage && (
                <div className="flex shrink-0 items-center gap-1">
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`Edit template ${template.name}`}
                    onClick={() => openEditor(template)}
                  >
                    <Pencil size={13} />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`Duplicate template ${template.name}`}
                    onClick={() => void handleDuplicate(template)}
                  >
                    <Copy size={13} />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`Export template ${template.name}`}
                    onClick={() => handleExport(template)}
                  >
                    <Download size={13} />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`Delete template ${template.name}`}
                    onClick={() => setDeleteTarget(template)}
                  >
                    <Trash2 size={13} />
                  </Button>
                </div>
              )}
            </div>
          ))
        )}
      </CardContent>

      <Dialog
        open={editorOpen}
        onOpenChange={(open) => {
          setEditorOpen(open);
          if (!open) setEditing(null);
        }}
      >
        <DialogContent className="max-h-[90vh] overflow-y-auto md:max-w-3xl">
          <DialogHeader>
            <DialogTitle>
              {editing ? "Edit template" : "New template"}
            </DialogTitle>
            <DialogDescription>
              These values are copied into a new session when the template is
              selected.
            </DialogDescription>
          </DialogHeader>
          <SessionForm
            key={editing?.id ?? "new"}
            initial={editing ? templateInitial(editing) : undefined}
            submitLabel={editing ? "Save changes" : "Create template"}
            onSubmit={handleSubmit}
            error={error}
          />
        </DialogContent>
      </Dialog>

      <ConfirmDeleteDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
        title={`Delete template '${deleteTarget?.name ?? ""}'?`}
        busy={busy}
        onConfirm={() => void handleDelete()}
      />
    </Card>
  );
}
