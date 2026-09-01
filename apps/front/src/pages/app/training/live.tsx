import { Link } from "react-router";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@pes/ui/components/card";
import { Radio } from "lucide-react";

import { useAppSelector } from "@/store/hooks";
import { GoalProgress } from "@/components/common/training/goal-progress";
import { TrainingTimer } from "@/components/common/training/training-timer";
import { EdgeTimeline } from "@/components/common/training/edge-timeline";
import { TrainingStatusBadge } from "@/components/common/training/training-status-badge";

export function meta() {
    return [{ title: "PES | Training - Live" }];
}

export default function TrainingLivePage() {
    const liveSession = useAppSelector((state) => state.training.liveSession);
    const liveEdges = useAppSelector((state) => state.training.liveEdges);

    if (!liveSession) {
        return (
            <div className="px-4 md:px-5">
                <Card>
                    <CardHeader className="items-center text-center">
                        <span className="accent-tile flex h-10 w-10 items-center justify-center rounded-md">
                            <Radio size={16} className="accent-tile-icon" />
                        </span>
                        <CardTitle>No live session</CardTitle>
                        <CardDescription>
                            Nothing is running right now. Check back when the Host starts
                            an edging session.
                        </CardDescription>
                    </CardHeader>
                </Card>
            </div>
        );
    }

    return (
        <div className="space-y-4 px-4 md:px-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                    <TrainingStatusBadge status={liveSession.status} />
                    <h2 className="text-lg font-semibold">{liveSession.name}</h2>
                </div>
                <Link
                    to={`/app/training/edging/${liveSession.id}`}
                    className="text-xs text-violet-600 dark:text-violet-400 hover:underline"
                >
                    Open session page →
                </Link>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
                <div className="space-y-4">
                    <GoalProgress session={liveSession} />

                    <Card>
                        <CardHeader>
                            <CardTitle>Timeline</CardTitle>
                            <CardDescription>
                                {liveEdges.length} edge{liveEdges.length === 1 ? "" : "s"} recorded
                            </CardDescription>
                        </CardHeader>
                        <CardContent>
                            <EdgeTimeline edges={liveEdges} startedAt={liveSession.started_at} />
                        </CardContent>
                    </Card>
                </div>

                <Card>
                    <CardHeader>
                        <CardTitle>Elapsed time</CardTitle>
                        <CardDescription>{liveSession.edge_count} successful edges so far</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <TrainingTimer
                            startedAt={liveSession.started_at}
                            endedAt={liveSession.ended_at}
                            className="text-4xl font-bold text-violet-600 dark:text-violet-400"
                        />
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
