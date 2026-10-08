export const STATUS_META = {
  connected: { label: "Connected", dot: "bg-emerald-500" },
  connecting: { label: "Connecting…", dot: "bg-amber-500" },
  error: { label: "Connection error", dot: "bg-red-500" },
  disconnected: { label: "Disconnected", dot: "bg-red-500" },
} as const;

export function getStatusMeta(status: string) {
  return (
    STATUS_META[status as keyof typeof STATUS_META] ?? STATUS_META.disconnected
  );
}
