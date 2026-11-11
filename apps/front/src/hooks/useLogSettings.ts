import { useCallback, useEffect, useState } from "react";

import { useAppSelector } from "@/store/hooks";
import type { LogSettings } from "@/types/logs.types";

const API_URL = import.meta.env.VITE_API_URL;

/** Read/update the backend log level + log directory. */
export function useLogSettings() {
    const token = useAppSelector((state) => state.auth.token);
    const [settings, setSettings] = useState<LogSettings | null>(null);
    const [saving, setSaving] = useState(false);

    const load = useCallback(async () => {
        if (!token) return;
        try {
            const response = await fetch(`${API_URL}/logs/settings`, {
                headers: { Authorization: `Bearer ${token}` },
            });
            if (!response.ok) return;
            setSettings((await response.json()) as LogSettings);
        } catch {
            // The viewer still works without the settings footer.
        }
    }, [token]);

    useEffect(() => {
        void load();
    }, [load]);

    const setLevel = useCallback(
        async (level: string) => {
            if (!token) return false;
            setSaving(true);
            try {
                const response = await fetch(`${API_URL}/logs/settings`, {
                    method: "PUT",
                    headers: {
                        Authorization: `Bearer ${token}`,
                        "Content-Type": "application/json",
                    },
                    body: JSON.stringify({ level }),
                });
                if (!response.ok) return false;
                setSettings((await response.json()) as LogSettings);
                return true;
            } catch {
                return false;
            } finally {
                setSaving(false);
            }
        },
        [token],
    );

    return { settings, saving, setLevel, reload: load };
}
