import { useState } from "react";
import { toast } from "sonner";

import { useWebSocket } from "@/hooks/useWebSocket";
import type { ProfileSummary } from "@/types";

/**
 * Delete flow shared by the profile card and inspector.
 *
 * The first attempt is unforced: the server refuses to delete a profile
 * that trigger rules reference. The failure message is kept so the dialog
 * can offer a forced second attempt.
 */
export function useProfileDelete(
    profile: ProfileSummary,
    onOpenChange: (open: boolean) => void,
) {
    const { sendCommand } = useWebSocket();
    const [deleting, setDeleting] = useState(false);
    const [warning, setWarning] = useState<string | null>(null);

    const requestDelete = async (force: boolean) => {
        setDeleting(true);
        try {
            const result = await sendCommand("profiles:delete", {
                name: profile.name,
                force,
            });
            if (result.status === "ok") {
                toast.success(`Profile "${profile.name}" deleted`, {
                    position: "bottom-right",
                });
                onOpenChange(false);
                return;
            }
            setWarning(result.message ?? "Failed to delete profile");
        } catch (error) {
            setWarning(
                error instanceof Error
                    ? error.message
                    : "Failed to delete profile",
            );
        } finally {
            setDeleting(false);
        }
    };

    const reset = () => setWarning(null);

    return { deleting, warning, requestDelete, reset };
}
