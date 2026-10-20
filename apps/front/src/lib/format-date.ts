/** Short date-time used across the UI, e.g. "26/08/2026 14:32". */
export function formatDateTime(iso: string | null | undefined): string {
    if (!iso) return "—";
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "—";
    return d.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" }) +
        " " +
        d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
}

/**
 * Compact relative time for live feeds ("just now", "2m ago", "3h ago").
 * Falls back to a date-time once the timestamp is more than a week old.
 */
export function formatRelativeTime(iso: string | null | undefined, now = Date.now()): string {
    if (!iso) return "—";
    const time = new Date(iso).getTime();
    if (Number.isNaN(time)) return "—";

    const diff = Math.max(0, now - time);
    if (diff < 45_000) return "just now";

    const minutes = Math.floor(diff / 60_000);
    if (minutes < 60) return `${minutes}m ago`;

    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;

    const days = Math.floor(hours / 24);
    if (days < 7) return `${days}d ago`;

    return formatDateTime(iso);
}
