import { toast } from "sonner";

import { useWebSocketEvent } from "@/hooks/useWebSocket";
import { useAppSelector } from "@/store/hooks";

/**
 * Global training notifications: targeted WS messages from the backend,
 * shown as toasts on every page. The actor who triggered the action is
 * excluded server-side, and checked again here as a safety net.
 */
export function TrainingNotifications() {
  const userId = useAppSelector((state) => state.auth.user?.id);

  useWebSocketEvent("training:notification", (payload) => {
    if (payload.actor_user_id && payload.actor_user_id === userId) return;

    const options = {
      position: "bottom-right" as const,
      duration: 5000,
    };

    if (payload.kind === "ended" && payload.status === "failed") {
      toast.error(payload.message, options);
      return;
    }

    if (
      payload.kind === "goal_reached" ||
      payload.kind === "program_completed" ||
      (payload.kind === "ended" && payload.status === "succeeded")
    ) {
      toast.success(payload.message, options);
      return;
    }

    toast.info(payload.message, options);
  });

  return null;
}
