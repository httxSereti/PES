import { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router";
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
import { Textarea } from "@pes/ui/components/textarea";
import {
  Ban,
  CheckCheck,
  Ellipsis,
  Flame,
  Pencil,
  Play,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "sonner";

import { useAppSelector } from "@/store/hooks";
import { hasPermission } from "@/lib/permissions";
import {
  deleteTrainingSession,
  endTrainingSession,
  fetchTrainingSession,
  recordTrainingEdge,
  startTrainingSession,
  updateTrainingSession,
} from "@/lib/training-api";
import { formatDateTime } from "@/lib/format-date";
import { formatDuration } from "@/lib/training";
import { TrainingStatusBadge } from "@/components/common/training/training-status-badge";
import { TrainingTimer } from "@/components/common/training/training-timer";
import { GoalProgress } from "@/components/common/training/goal-progress";
import { EdgeTimeline } from "@/components/common/training/edge-timeline";
import { EdgeChart } from "@/components/common/training/edge-chart";
import { SessionStats } from "@/components/common/training/session-stats";
import { RatingStars } from "@/components/common/training/rating-stars";
import { SessionForm } from "@/components/common/training/session-form";
import { Permission } from "@/types";
import type { EdgeDifficulty, TrainingSessionDetail } from "@/types";

export function meta() {
  return [{ title: "PES | Training - Edging Session" }];
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
  const token = useAppSelector((state) => state.auth.token);
  const user = useAppSelector((state) => state.auth.user);
  const eventTs = useAppSelector((state) =>
    id ? state.training.events[id] : undefined,
  );

  const isHost = hasPermission(user, Permission.HOST);
  const canManage = hasPermission(user, Permission.TRAINING_EDGING_MANAGE);

  const [detail, setDetail] = useState<TrainingSessionDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [notes, setNotes] = useState("");
  const [notesDirty, setNotesDirty] = useState(false);
  const [editOpen, setEditOpen] = useState(false);

  const load = useCallback(async () => {
    if (!token || !id) return;
    try {
      const data = await fetchTrainingSession(token, id);
      setDetail(data);
      setNotes(data.session.notes ?? "");
      setNotesDirty(false);
      setError(null);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to load the session",
      );
    }
  }, [token, id]);

  useEffect(() => {
    void load();
  }, [load]);

  // Refetch whenever the session changed server-side (WS broadcast)
  useEffect(() => {
    if (eventTs) void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventTs]);

  async function run(action: () => Promise<unknown>, successMessage?: string) {
    if (!token || !id) return;
    setBusy(true);
    setError(null);
    try {
      await action();
      if (successMessage)
        toast.success(successMessage, { position: "bottom-right" });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Request failed");
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
  const goalsReached =
    running && session.goals_met && !session.auto_stop_on_goal;

  async function handleStart() {
    await run(
      () => startTrainingSession(token!, session.id),
      "Session started!",
    );
  }

  async function handleEdge(difficulty: EdgeDifficulty) {
    await run(async () => {
      const res = await recordTrainingEdge(
        token!,
        session.id,
        difficulty,
        "success",
      );
      // Optimistic local update; the WS refetch replaces it shortly after.
      setDetail((prev) =>
        prev
          ? { ...prev, session: res.session, edges: [...prev.edges, res.edge] }
          : prev,
      );
    });
  }

  async function handleFail() {
    await run(async () => {
      const res = await recordTrainingEdge(
        token!,
        session.id,
        "normal",
        "fail",
      );
      setDetail((prev) =>
        prev
          ? { ...prev, session: res.session, edges: [...prev.edges, res.edge] }
          : prev,
      );
    }, "Session failed and stopped");
  }

  async function handleEnd(status: "succeeded" | "cancelled") {
    await run(
      () => endTrainingSession(token!, session.id, status),
      status === "succeeded"
        ? "Session ended — goal reached!"
        : "Session cancelled",
    );
  }

  async function handleRating(rating: number) {
    await run(async () => {
      const updated = await updateTrainingSession(token!, session.id, {
        rating,
      });
      setDetail((prev) => (prev ? { ...prev, session: updated } : prev));
    });
  }

  async function handleSaveNotes() {
    await run(async () => {
      const updated = await updateTrainingSession(token!, session.id, {
        notes,
      });
      setDetail((prev) => (prev ? { ...prev, session: updated } : prev));
      setNotesDirty(false);
    }, "Notes saved");
  }

  async function handleDelete() {
    if (
      !window.confirm(
        `Delete session '${session.name}'? This cannot be undone.`,
      )
    )
      return;
    await run(async () => {
      await deleteTrainingSession(token!, session.id);
      navigate("/app/training/edging");
    }, "Session deleted");
  }

  return (
    <div className="space-y-4 px-4 md:px-5">
      {error && <p className="text-sm text-destructive">{error}</p>}

      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1">
          <div className="flex items-center gap-2.5">
            <TrainingStatusBadge status={session.status} />
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
          </p>
        </div>
        {configured && canManage && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="icon-sm">
                <Ellipsis size={14} />
                <span className="sr-only">Session actions</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={() => setEditOpen(true)}>
                <Pencil size={13} />
                Edit session
              </DropdownMenuItem>
              {isHost && (
                <DropdownMenuItem variant="destructive" onSelect={handleDelete}>
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

      {/* Live control panel */}
      {running && (
        <Card className="gap-0 border-emerald-500/30">
          <CardHeader>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <CardTitle>Session in progress</CardTitle>
                <CardDescription>
                  {session.edge_count} successful edge
                  {session.edge_count === 1 ? "" : "s"} · {edges.length}{" "}
                  recorded
                </CardDescription>
              </div>
              <TrainingTimer
                startedAt={session.started_at}
                endedAt={session.ended_at}
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
                    Record an edge — how hard was it?
                  </p>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {EDGE_BUTTONS.map((button) => (
                      <Button
                        key={button.difficulty}
                        disabled={busy}
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
                    variant="destructive"
                    size="sm"
                    disabled={busy}
                    onClick={() => void handleFail()}
                  >
                    <X size={14} />
                    Failed (stops session)
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

            {goalsReached && (
              <div className="flex flex-wrap items-center gap-3 rounded-lg border border-violet-500/30 bg-violet-500/10 px-4 py-3">
                <CheckCheck
                  size={16}
                  className="shrink-0 text-violet-600 dark:text-violet-400"
                />
                <p className="flex-1 min-w-40 text-sm">
                  <span className="font-medium">All goals reached!</span>{" "}
                  <span className="text-muted-foreground">
                    {isHost
                      ? "You can end the session or keep going."
                      : "Waiting for the Host to end it or continue."}
                  </span>
                </p>
                {isHost && (
                  <Button
                    size="sm"
                    disabled={busy}
                    onClick={() => void handleEnd("succeeded")}
                  >
                    <CheckCheck size={14} />
                    End session (success)
                  </Button>
                )}
              </div>
            )}
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
                  {session.notes || "No notes yet."}
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
            }}
            submitLabel="Save changes"
            onSubmit={async (fields) => {
              await updateTrainingSession(token!, session.id, fields);
              setEditOpen(false);
              await load();
            }}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}
