import { useEffect, useState } from "react";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@pes/ui/components/select";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";

import { useWebSocket, useWebSocketEvent } from "@/hooks/useWebSocket";
import { useAppSelector } from "@/store/hooks";
import { hasPermission } from "@/lib/permissions";
import { SessionForm } from "@/components/common/training/session-form";
import { Permission } from "@/types";
import type { TrainingSessionFields, TrainingTemplate } from "@/types";

export function meta() {
  return [{ title: "PES | Training - New Edging Session" }];
}

const NO_TEMPLATE = "none";

export default function NewEdgingSessionPage() {
  const navigate = useNavigate();
  const { sendCommand } = useWebSocket();
  const user = useAppSelector((state) => state.auth.user);
  const canManage = hasPermission(user, Permission.TRAINING_EDGING_MANAGE);

  const [error, setError] = useState<string | null>(null);
  const [templates, setTemplates] = useState<TrainingTemplate[]>([]);
  const [templateId, setTemplateId] = useState(NO_TEMPLATE);
  const [initial, setInitial] = useState<
    Partial<TrainingSessionFields> | undefined
  >();
  const [formKey, setFormKey] = useState(0);

  useEffect(() => {
    async function loadTemplates() {
      try {
        const result = await sendCommand("training:templates");
        if (result.status !== "ok") {
          setError(result.message ?? "Failed to load templates");
        }
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Failed to load templates",
        );
      }
    }
    void loadTemplates();
  }, [sendCommand]);

  useWebSocketEvent("training:templates", (payload) => {
    setTemplates(payload);
    setError(null);
  });

  function applyTemplate(nextId: string) {
    setTemplateId(nextId);
    if (nextId === NO_TEMPLATE) {
      setInitial(undefined);
      setFormKey((key) => key + 1);
      return;
    }

    const template = templates.find((entry) => entry.id === nextId);
    if (!template) return;
    setInitial({
      name: template.name,
      goals: template.goals.map((goal) => ({
        type: goal.type as "duration" | "edges",
        value: goal.value,
      })),
      auto_stop_on_goal: template.auto_stop_on_goal,
      mode: template.mode === "guided" ? "guided" : "manual",
    });
    setFormKey((key) => key + 1);
  }

  async function handleDeleteTemplate() {
    if (templateId === NO_TEMPLATE) return;
    try {
      const result = await sendCommand("training:template_delete", {
        template_id: templateId,
      });
      if (result.status !== "ok") {
        setError(result.message ?? "Failed to delete the template");
        return;
      }
      toast.success("Template deleted", { position: "bottom-right" });
      setTemplateId(NO_TEMPLATE);
      setInitial(undefined);
      setFormKey((key) => key + 1);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to delete the template",
      );
    }
  }

  async function handleSubmit(fields: TrainingSessionFields) {
    try {
      const result = await sendCommand("training:create", {
        name: fields.name,
        goals: fields.goals,
        auto_stop_on_goal: fields.auto_stop_on_goal,
        mode: fields.mode,
        min_edge_interval_seconds: fields.min_edge_interval_seconds,
        notification_level: fields.notification_level,
      });
      if (result.status !== "ok" || !result.session) {
        setError(result.message ?? "Failed to create the session");
        return;
      }
      const session = result.session;
      toast.success(`Session '${session.name}' created`, {
        description: "The Host can start it from the session page.",
        position: "bottom-right",
      });
      navigate(`/app/training/edging/${session.id}`);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to create the session",
      );
    }
  }

  return (
    <div className="px-4 md:px-5">
      <Card className="mx-auto max-w-2xl">
        <CardHeader>
          <CardTitle>New edging session</CardTitle>
          <CardDescription>
            Configure the goals for the session. The Host will start it when
            ready.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="flex flex-wrap items-end gap-2">
            <div className="min-w-52 flex-1 space-y-1.5">
              <p className="text-xs font-medium text-muted-foreground">
                Start from a template
              </p>
              <Select value={templateId} onValueChange={applyTemplate}>
                <SelectTrigger aria-label="Training template">
                  <SelectValue placeholder="No template" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_TEMPLATE}>No template</SelectItem>
                  {templates.map((template) => (
                    <SelectItem key={template.id} value={template.id}>
                      {template.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {canManage && templateId !== NO_TEMPLATE && (
              <Button
                type="button"
                variant="outline"
                size="icon"
                aria-label="Delete selected template"
                onClick={() => void handleDeleteTemplate()}
              >
                <Trash2 size={14} />
              </Button>
            )}
          </div>

            <SessionForm
              key={formKey}
              initial={initial}
              submitLabel="Create session"
              onSubmit={handleSubmit}
              error={error}
            />
        </CardContent>
      </Card>
    </div>
  );
}
