import { useState } from "react";
import { useNavigate } from "react-router";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@pes/ui/components/card";
import { toast } from "sonner";

import { useAppSelector } from "@/store/hooks";
import { createTrainingSession } from "@/lib/training-api";
import { SessionForm } from "@/components/common/training/session-form";
import type { TrainingSessionFields } from "@/types";

export function meta() {
  return [{ title: "PES | Training - New Edging Session" }];
}

export default function NewEdgingSessionPage() {
  const navigate = useNavigate();
  const token = useAppSelector((state) => state.auth.token);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(fields: TrainingSessionFields) {
    if (!token) return;
    try {
      const session = await createTrainingSession(token, fields);
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
        <CardContent>
          <SessionForm
            submitLabel="Create session"
            onSubmit={handleSubmit}
            error={error}
          />
        </CardContent>
      </Card>
    </div>
  );
}
