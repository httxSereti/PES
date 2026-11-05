import type { EdgingSessionSummary } from "@/types";
import { edgeCooldownRemaining } from "@/lib/training";
import { useCooldownTimer } from "./useCooldownTimer";

type CooldownSession = Pick<
    EdgingSessionSummary,
    "last_edge_at" | "min_edge_interval_seconds"
>;

/**
 * Live countdown until the next successful training edge is allowed.
 * Returns 0 when no cooldown is configured or the session is null.
 */
export function useEdgeCooldown(
    session: CooldownSession | null | undefined,
): number {
    return useCooldownTimer(
        session ? edgeCooldownRemaining(session) : 0,
    );
}
