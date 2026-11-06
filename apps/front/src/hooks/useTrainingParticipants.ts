import { useEffect, useState } from "react";

import { useWebSocket, useWebSocketEvent } from "@/hooks/useWebSocket";
import type { TrainingParticipant } from "@/types";

/**
 * Active users that can be added to a training session. The command requires
 * TRAINING_EDGING_MANAGE; read-only viewers get an empty list.
 */
export function useTrainingParticipants(enabled = true) {
  const { sendCommand } = useWebSocket();
  const [participants, setParticipants] = useState<TrainingParticipant[]>([]);

  useEffect(() => {
    if (!enabled) return;
    void sendCommand("training:participants").catch(() => undefined);
  }, [enabled, sendCommand]);

  useWebSocketEvent("training:participants", (payload) => {
    setParticipants(payload);
  });

  return participants;
}
