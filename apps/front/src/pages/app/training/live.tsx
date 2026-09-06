import { Link } from "react-router";
import { Button } from "@pes/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@pes/ui/components/card";
import { ArrowRight, Flame, Plus, Radio } from "lucide-react";

import { useAppSelector } from "@/store/hooks";
import { hasPermission } from "@/lib/permissions";
import { GoalProgress } from "@/components/common/training/goal-progress";
import { TrainingTimer } from "@/components/common/training/training-timer";
import { EdgeTimeline } from "@/components/common/training/edge-timeline";
import { TrainingStatusBadge } from "@/components/common/training/training-status-badge";
import { Permission } from "@/types";

export function meta() {
  return [{ title: "PES | Training - Live" }];
}

export default function TrainingLivePage() {
  const liveSession = useAppSelector((state) => state.training.liveSession);
  const liveEdges = useAppSelector((state) => state.training.liveEdges);
  const user = useAppSelector((state) => state.auth.user);
  const canManage = hasPermission(user, Permission.TRAINING_EDGING_MANAGE);

  if (!liveSession) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center px-4 md:px-5">
        <Card className="w-full max-w-md border-dashed text-center shadow-none">
          <CardHeader className="items-center text-center gap-2">
            <span className="accent-tile mx-auto mb-1 flex h-14 w-14 items-center justify-center rounded-lg">
              <Radio size={22} className="accent-tile-icon" />
            </span>
            <CardTitle className="text-center text-base">
              No live session
            </CardTitle>
            <CardDescription className="mx-auto max-w-xs text-center">
              Nothing is running right now. Start or open an edging session and
              its live details will appear here.
            </CardDescription>
          </CardHeader>
          {canManage && (
            <CardContent className="flex justify-center pb-6">
              <Button asChild>
                <Link to="/app/training/edging/new">
                  <Plus size={14} />
                  Start a new session
                </Link>
              </Button>
            </CardContent>
          )}
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-4 px-4 md:px-5">
      {/* Hero: status, elapsed time and goal progress */}
      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <div className="flex min-w-0 flex-wrap items-center gap-2.5">
            <TrainingStatusBadge status={liveSession.status} />
            <CardTitle className="truncate text-base">
              {liveSession.name}
            </CardTitle>
          </div>
          <Link
            to={`/app/training/edging/${liveSession.id}`}
            className="flex shrink-0 items-center gap-1 text-xs text-violet-600 hover:underline dark:text-violet-400"
          >
            Session page
            <ArrowRight size={12} />
          </Link>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <TrainingTimer
              startedAt={liveSession.started_at}
              endedAt={liveSession.ended_at}
              className="text-5xl font-bold tracking-tight text-violet-600 dark:text-violet-400"
            />
            <span className="flex items-center gap-1.5 rounded-md border border-border/60 bg-muted/30 px-2.5 py-1.5 text-xs text-muted-foreground">
              <Flame size={12} className="text-violet-500" />
              {liveSession.edge_count} successful edge
              {liveSession.edge_count === 1 ? "" : "s"}
            </span>
          </div>
          <GoalProgress session={liveSession} />
        </CardContent>
      </Card>

      {/* Timeline */}
      <Card>
        <CardHeader>
          <CardTitle>Timeline</CardTitle>
          <CardDescription>
            {liveEdges.length} edge{liveEdges.length === 1 ? "" : "s"} recorded
            so far
          </CardDescription>
        </CardHeader>
        <CardContent>
          <EdgeTimeline edges={liveEdges} startedAt={liveSession.started_at} />
        </CardContent>
      </Card>
    </div>
  );
}
