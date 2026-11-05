import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { Button } from "@pes/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@pes/ui/components/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@pes/ui/components/dropdown-menu";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@pes/ui/components/card";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@pes/ui/components/tabs";
import { Input } from "@pes/ui/components/input";
import { Textarea } from "@pes/ui/components/textarea";
import {
  Ban,
  Copy,
  Ellipsis,
  Flame,
  Pause,
  Pencil,
  Play,
  Save,
  Trash2,
  Undo2,
  X,
} from "lucide-react";
import { toast } from "sonner";

import { useWebSocket } from "@/hooks/useWebSocket";
import { useAppSelector } from "@/store/hooks";
import { hasPermission } from "@/lib/permissions";
import { formatDateTime } from "@/lib/format-date";
import { formatDuration } from "@/lib/training";
import { TrainingStatusBadge } from "@/components/common/training/training-status-badge";
import { TrainingTimer } from "@/components/common/training/training-timer";
import { GoalProgress } from "@/components/common/training/goal-progress";
import { GuidedPhase } from "@/components/common/training/guided-phase";
import { GoalsReachedBanner } from "@/components/common/training/goals-reached-banner";
import { EdgeTimeline } from "@/components/common/training/edge-timeline";
import { EdgeChart } from "@/components/common/training/edge-chart";
import { SessionStats } from "@/components/common/training/session-stats";
import { RatingStars } from "@/components/common/training/rating-stars";
import { SessionForm } from "@/components/common/training/session-form";
import { ConfirmDeleteDialog } from "@/components/common/dialogs/confirm-delete-dialog";
import { Permission } from "@/types";
import type { CommandResult, EdgeDifficulty } from "@/types";

export function meta() {
  return [{ title: "PES | Training - Edging Session" }];
}

function newClientEdgeId(): string {
  if (typeof globalThis.crypto?.randomUUID === "function") {
    return globalThis.crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

const EDGE_BUTTONS: {
  difficulty: EdgeDifficulty;
  label: string;
  className: string;
}[] = [
  {
    difficulty: "easy",
    label: "Easy",
    className: "bg-emerald-600 hover:bg-emerald-500",
  },
  {
    difficulty: "normal",
    label: "Normal",
    className: "bg-sky-600 hover:bg-sky-500",
  },
  {
    difficulty: "hard",
    label: "Hard",
    className: "bg-orange-600 hover:bg-orange-500",
  },
  {
    difficulty: "extreme",
    label: "Extreme",
    className: "bg-rose-600 hover:bg-rose-500",
  },
];

export default function EdgingSessionPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { sendCommand } = useWebSocket();
  const user = useAppSelector((state) => state.auth.user);
  const detail = useAppSelector((state) =>
    id ? state.training.details[id] : undefined,
  );
  const eventTs = useAppSelector((state) =>
    id ? state.training.events[id] : undefined,
  );

  const isHost = hasPermission(user, Permission.HOST);
  const canManage = hasPermission(user, Permission.TRAINING_EDGING_MANAGE);

  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [notes, setNotes] = useState("");
  const [notesDirty, setNotesDirty] = useState(false);
  const [edgeNote, setEdgeNote] = useState("");
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [templateOpen, setTemplateOpen] = useState(false);
  const [templateName, setTemplateName] = useState("");
  const [renameOpen, setRenameOpen] = useState(false);
  const [renameName, setRenameName] = useState("");

  const load = useCallback(async () => {
    if (!id) return;
    try {
      const result = await sendCommand("training:session_detail", {
        session_id: id,
      });
      if (result.status !== "ok") {
        setError(result.message ?? "Failed to load the session");
      } else {
        setError(null);
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to load the session",
      );
    }
  }, [sendCommand, id]);

  useEffect(() => {
    void load();
  }, [load]);

  // Refetch whenever the session changed server-side (WS broadcast)
  useEffect(() => {
    if (eventTs) void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventTs]);

  // Sync the notes editor with the loaded session (never clobber typing)
  useEffect(() => {
    if (detail && !notesDirty) {
      setNotes(detail.session.notes ?? "");
    }
  }, [detail, notesDirty]);

  async function run(
    action: () => Promise<CommandResult>,
    successMessage?: string,
  ): Promise<boolean> {
    if (!id) return false;
    setBusy(true);
    setError(null);
    try {
      const result = await action();
      if (result.status !== "ok") {
        setError(result.message ?? "Request failed");
        return false;
      }
      if (successMessage)
        toast.success(successMessage, { position: "bottom-right" });
      await load();
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Request failed");
      return false;
    } finally {
      setBusy(false);
    }
  }

  if (!detail) {
    return (
      <div className="px-4 md:px-5">
        {error ? (
          <p className="text-sm text-destructive">{error}</p>
        ) : (
          <p className="text-sm text-muted-foreground">Loading…</p>
        )}
      </div>
    );
  }

  const { session, edges, stats } = detail;
  const running = session.status === "running";
  const configured = session.status === "configured";
  const ended = !running && !configured;
  const participantCount = session.participant_ids?.length ?? 0;

  async function handleStart() {
    await run(
      () => sendCommand("training:start", { session_id: session.id }),
      "Session started!",
    );
  }

  async function handleEdge(difficulty: EdgeDifficulty) {
    const note = edgeNote.trim() || undefined;
    const saved = await run(() =>
      sendCommand("training:record_edge", {
        session_id: session.id,
        difficulty,
        outcome: "success",
        client_edge_id: newClientEdgeId(),
        note,
      }),
    );
    if (saved) setEdgeNote("");
  }

  async function handlePause() {
    await run(
      () => sendCommand("training:pause", { session_id: session.id }),
      "Session paused",
    );
  }

  async function handleResume() {
    await run(
      () => sendCommand("training:resume", { session_id: session.id }),
      "Session resumed",
    );
  }

  async function handleFail() {
    await run(
      () =>
        sendCommand("training:record_edge", {
          session_id: session.id,
          difficulty: "normal",
          outcome: "fail",
        }),
      "Session failed and stopped",
    );
  }

  async function handleUndoEdge() {
    const lastEdge = edges[edges.length - 1];
    if (!lastEdge) return;
    await run(
      () =>
        sendCommand("training:delete_edge", {
          session_id: session.id,
          edge_id: lastEdge.id,
        }),
      "Last edge removed",
    );
  }

  async function handleEnd(status: "succeeded" | "cancelled") {
    await run(
      () => sendCommand("training:end", { session_id: session.id, status }),
      status === "succeeded"
        ? "Session ended — goal reached!"
        : "Session cancelled",
    );
  }

  async function handleRating(rating: number) {
    await run(() =>
      sendCommand("training:update", { session_id: session.id, rating }),
    );
  }

  async function handleSaveNotes() {
    await run(async () => {
      const result = await sendCommand("training:update", {
        session_id: session.id,
        notes,
      });
      if (result.status === "ok") setNotesDirty(false);
      return result;
    }, "Notes saved");
  }

  async function handleDelete() {
    await run(async () => {
      const result = await sendCommand("training:delete", {
        session_id: session.id,
      });
      if (result.status === "ok") navigate("/app/training/edging");
      return result;
    }, "Session deleted");
    setDeleteOpen(false);
  }

  async function handleDuplicate() {
    try {
      const result = await sendCommand("training:create", {
        name: `${session.name} (copy)`.slice(0, 120),
        goals: session.goals.map((goal) => ({
          type: goal.type as "duration" | "edges",
          value: goal.value,
        })),
        auto_stop_on_goal: session.auto_stop_on_goal,
        participant_ids: session.participant_ids ?? [],
        mode: session.mode === "guided" ? "guided" : "manual",
      });
      if (result.status !== "ok" || !result.session) {
        setError(result.message ?? "Failed to duplicate the session");
        return;
      }
      toast.success("Session duplicated", { position: "bottom-right" });
      navigate(`/app/training/edging/${result.session.id}`);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to duplicate the session",
      );
    }
  }

  async function handleRename() {
    const name = renameName.trim();
    if (!name) {
      setError("Session name is required");
      return;
    }
    const saved = await run(
      () =>
        sendCommand("training:update", {
          session_id: session.id,
          name,
        }),
      "Session renamed",
    );
    if (saved) setRenameOpen(false);
  }

  async function handleSaveTemplate() {
    const saved = await run(
      () =>
        sendCommand("training:template_save", {
          name: templateName.trim() || session.name,
          goals: session.goals.map((goal) => ({
            type: goal.type as "duration" | "edges",
            value: goal.value,
          })),
          auto_stop_on_goal: session.auto_stop_on_goal,
          mode: session.mode === "guided" ? "guided" : "manual",
        }),
      "Template saved",
    );
    if (saved) setTemplateOpen(false);
  }

  return (
    <div className="space-y-4 px-4 md:px-5">
      {error && <p className="text-sm text-destructive">{error}</p>}

      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1">
          <div className="flex items-center gap-2.5">
            <TrainingStatusBadge
              status={session.status}
              paused={Boolean(session.paused_at)}
            />
            <h2 className="truncate text-lg font-semibold">{session.name}</h2>
          </div>
          <p className="text-[11px] text-muted-foreground/70">
            Created {formatDateTime(session.created_at)}
            {session.started_at && (
              <> · started {formatDateTime(session.started_at)}</>
            )}
            {session.ended_at && (
              <> · ended {formatDateTime(session.ended_at)}</>
            )}
            {session.app_session_id && (
              <>
                {" · "}
                <Link
                  to={`/app/sessions/${session.app_session_id}`}
                  className="text-violet-600 hover:underline dark:text-violet-400"
                >
                  application session
                </Link>
              </>
            )}
            {participantCount > 0 && (
              <>
                {" · shared with "}
                {participantCount}
                {participantCount === 1 ? " participant" : " participants"}
              </>
            )}
            {session.program_id && (
              <>
                {" · "}
                <Link
                  to="/app/training/programs"
                  className="text-violet-600 hover:underline dark:text-violet-400"
                >
                  program step {(session.program_step ?? 0) + 1}
                </Link>
              </>
            )}
          </p>
        </div>
        {(canManage || (isHost && !running)) && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="icon-sm">
                <Ellipsis size={14} />
                <span className="sr-only">Session actions</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {configured && canManage && (
                <DropdownMenuItem onSelect={() => setEditOpen(true)}>
                  <Pencil size={13} />
                  Edit goals
                </DropdownMenuItem>
              )}
              {canManage && (
                <DropdownMenuItem
                  onSelect={() => {
                    setRenameName(session.name);
                    setRenameOpen(true);
                  }}
                >
                  <Pencil size={13} />
                  Rename session
                </DropdownMenuItem>
              )}
              {canManage && (
                <>
                  <DropdownMenuItem
                    onSelect={() => {
                      setTemplateName(session.name);
                      setTemplateOpen(true);
                    }}
                  >
                    <Save size={13} />
                    Save as template
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => void handleDuplicate()}>
                    <Copy size={13} />
                    Duplicate session
                  </DropdownMenuItem>
                </>
              )}
              {isHost && !running && (
                <DropdownMenuItem
                  variant="destructive"
                  onSelect={() => setDeleteOpen(true)}
                >
                  <Trash2 size={13} />
                  Delete session
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>

      {/* Goals */}
      <GoalProgress session={session} />
      <GuidedPhase session={session} />

      {/* Live control panel */}
      {running && (
        <Card className="gap-0 border-emerald-500/30">
          <CardHeader>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <CardTitle>
                  {session.paused_at ? "Session paused" : "Session in progress"}
                </CardTitle>
                <CardDescription>
                  {session.edge_count} successful edge
                  {session.edge_count === 1 ? "" : "s"} · {edges.length}{" "}
                  recorded
                  {session.paused_at ? " · timer paused" : ""}
                </CardDescription>
              </div>
              <TrainingTimer
                startedAt={session.started_at}
                endedAt={session.ended_at}
                pausedAt={session.paused_at}
                totalPausedSeconds={session.total_paused_seconds}
                className="text-4xl font-bold tracking-tight text-violet-600 dark:text-violet-400"
              />
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {isHost ? (
              <>
                {/* Record an edge */}
                <div className="space-y-2">
                  <p className="text-xs font-medium text-muted-foreground">
                    {session.paused_at
                      ? "Session paused — resume to record edges."
                      : "Record an edge — how hard was it?"}
                  </p>
                  <Input
                    value={edgeNote}
                    onChange={(event) => setEdgeNote(event.target.value)}
                    placeholder="Optional note for the next edge"
                    maxLength={500}
                    disabled={busy || Boolean(session.paused_at)}
                  />
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {EDGE_BUTTONS.map((button) => (
                      <Button
                        key={button.difficulty}
                        disabled={busy || Boolean(session.paused_at)}
                        onClick={() => void handleEdge(button.difficulty)}
                        className={`${button.className} text-white`}
                      >
                        <Flame size={14} />
                        {button.label}
                      </Button>
                    ))}
                  </div>
                </div>

                {/* Session control */}
                <div className="flex flex-wrap items-center gap-2 pt-1">
                  <Button
                    variant={session.paused_at ? "secondary" : "outline"}
                    size="sm"
                    disabled={busy}
                    onClick={() =>
                      void (session.paused_at
                        ? handleResume()
                        : handlePause())
                    }
                  >
                    {session.paused_at ? (
                      <>
                        <Play size={14} />
                        Resume
                      </>
                    ) : (
                      <>
                        <Pause size={14} />
                        Pause
                      </>
                    )}
                  </Button>
                  <Button
                    variant="destructive"
                    size="sm"
                    disabled={busy || Boolean(session.paused_at)}
                    onClick={() => void handleFail()}
                  >
                    <X size={14} />
                    Failed (stops session)
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={busy || edges.length === 0}
                    onClick={() => void handleUndoEdge()}
                  >
                    <Undo2 size={14} />
                    Undo last edge
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={busy}
                    onClick={() => void handleEnd("cancelled")}
                  >
                    <Ban size={14} />
                    Cancel
                  </Button>
                </div>
              </>
            ) : (
              <p className="text-xs text-muted-foreground">
                The Host is running this session — sit tight.
              </p>
            )}

            <GoalsReachedBanner
              session={session}
              isHost={isHost}
              busy={busy}
              onEnd={() => void handleEnd("succeeded")}
            />
          </CardContent>
        </Card>
      )}

      {/* Configured control panel */}
      {configured && (
        <Card className="gap-3">
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <div className="flex flex-col gap-1.5">
              <CardTitle>Ready to start</CardTitle>
              <CardDescription>
                {isHost
                  ? "Everything is configured — start whenever you're ready."
                  : "Waiting for the Host to start this session."}
              </CardDescription>
            </div>
            {isHost && (
              <Button disabled={busy} onClick={() => void handleStart()}>
                <Play size={14} />
                Start session
              </Button>
            )}
          </CardHeader>
        </Card>
      )}

      {/* Ended: rating + notes (Host editable) */}
      {ended && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-stretch">
          <Card>
            <CardHeader>
              <CardTitle>Result</CardTitle>
              <CardDescription>
                {formatDuration(session.duration_seconds)} ·{" "}
                {session.edge_count} edges
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-1">
              <span className="text-sm text-muted-foreground">Rating</span>
              <RatingStars
                value={session.rating}
                onChange={
                  isHost ? (rating) => void handleRating(rating) : undefined
                }
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Notes</CardTitle>
              <CardDescription>
                {isHost
                  ? "Only the Host can write notes"
                  : "Written by the Host"}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {isHost ? (
                <>
                  <Textarea
                    value={notes}
                    onChange={(event) => {
                      setNotes(event.target.value);
                      setNotesDirty(true);
                    }}
                    placeholder="How did it go? What to try next time…"
                    rows={4}
                  />
                  <div className="flex justify-end">
                    <Button
                      size="sm"
                      disabled={!notesDirty || busy}
                      onClick={() => void handleSaveNotes()}
                    >
                      Save notes
                    </Button>
                  </div>
                </>
              ) : (
                <p className="whitespace-pre-wrap text-sm text-muted-foreground">
                  {session.notes ||
                    (canManage
                      ? "No notes yet."
                      : "Notes are private to the Host.")}
                </p>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* Analysis: performance, chart and timeline grouped in one card */}
      <Card>
        <CardHeader>
          <CardTitle>Session analysis</CardTitle>
          <CardDescription>
            Performance compared to your average, plus the full edge history
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="performance">
            <TabsList>
              <TabsTrigger value="performance">Performance</TabsTrigger>
              <TabsTrigger value="chart">Edges over time</TabsTrigger>
              <TabsTrigger value="timeline">Timeline</TabsTrigger>
            </TabsList>
            <TabsContent value="performance" className="pt-4">
              <SessionStats stats={stats} />
            </TabsContent>
            <TabsContent value="chart" className="pt-4">
              <EdgeChart edges={edges} startedAt={session.started_at} />
            </TabsContent>
            <TabsContent value="timeline" className="pt-4">
              <EdgeTimeline edges={edges} startedAt={session.started_at} />
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      {/* Edit dialog (configured sessions only) */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="md:max-w-lg">
          <DialogHeader>
            <DialogTitle>Edit session</DialogTitle>
            <DialogDescription>
              Adjust the name, goals or auto-stop behavior before it starts.
            </DialogDescription>
          </DialogHeader>
          <SessionForm
            initial={{
              name: session.name,
              goals: session.goals.map((goal) => ({
                type: goal.type as "duration" | "edges",
                value: goal.value,
              })),
              auto_stop_on_goal: session.auto_stop_on_goal,
              mode: session.mode === "guided" ? "guided" : "manual",
            }}
            submitLabel="Save changes"
            onSubmit={async (fields) => {
              const result = await sendCommand("training:update", {
                session_id: session.id,
                ...fields,
              });
              if (result.status !== "ok") {
                setError(result.message ?? "Failed to save the session");
                return;
              }
              setEditOpen(false);
              await load();
            }}
          />
        </DialogContent>
      </Dialog>

      <Dialog open={renameOpen} onOpenChange={setRenameOpen}>
        <DialogContent className="md:max-w-md">
          <DialogHeader>
            <DialogTitle>Rename session</DialogTitle>
            <DialogDescription>
              The new name is shown in lists, notifications and events.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <Input
              value={renameName}
              onChange={(event) => setRenameName(event.target.value)}
              maxLength={120}
              placeholder="Session name"
              autoFocus
            />
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setRenameOpen(false)}>
                Cancel
              </Button>
              <Button
                disabled={busy || !renameName.trim()}
                onClick={() => void handleRename()}
              >
                Save name
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={templateOpen} onOpenChange={setTemplateOpen}>
        <DialogContent className="md:max-w-md">
          <DialogHeader>
            <DialogTitle>Save as template</DialogTitle>
            <DialogDescription>
              Reuse these goals and auto-stop settings for future sessions.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <Input
              value={templateName}
              onChange={(event) => setTemplateName(event.target.value)}
              placeholder="Template name"
              maxLength={120}
            />
            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                onClick={() => setTemplateOpen(false)}
              >
                Cancel
              </Button>
              <Button
                disabled={busy || !templateName.trim()}
                onClick={() => void handleSaveTemplate()}
              >
                <Save size={14} />
                Save template
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <ConfirmDeleteDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title={`Delete session '${session.name}'?`}
        busy={busy}
        onConfirm={() => void handleDelete()}
      />
    </div>
  );
}
