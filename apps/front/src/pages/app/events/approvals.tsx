import { useState } from "react";
import { Check, Clock, Loader2, RefreshCw, ShieldCheck, ShieldX, X } from "lucide-react";

import { Button } from "@pes/ui/components/button";
import { cn } from "@pes/ui/lib/utils";

import { formatDateTime, formatRelativeTime } from "@/lib/format-date";
import { useApprovals, type ApprovalRequest } from "@/hooks/useApprovals";

type ApprovalStatus = "pending" | "approved" | "rejected" | "expired";

const STATUSES: Array<{ value: ApprovalStatus; label: string }> = [
    { value: "pending", label: "Pending" },
    { value: "approved", label: "Approved" },
    { value: "rejected", label: "Rejected" },
    { value: "expired", label: "Expired" },
];

function statusClass(status: string): string {
    if (status === "pending") return "border-amber-500/25 bg-amber-500/10 text-amber-700 dark:text-amber-300";
    if (status === "approved") return "border-emerald-500/25 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300";
    if (status === "rejected") return "border-destructive/25 bg-destructive/10 text-destructive";
    return "border-border bg-muted/40 text-muted-foreground";
}

function ApprovalCard({
    request,
    onApprove,
    onReject,
    busy,
}: {
    request: ApprovalRequest;
    onApprove: () => void;
    onReject: (reason: string) => void;
    busy: boolean;
}) {
    const [reason, setReason] = useState("");
    const [rejecting, setRejecting] = useState(false);

    return (
        <div className="rounded-xl border border-border/70 bg-background/40 p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                    <div className="flex items-center gap-2">
                        <span className={cn("rounded border px-1.5 py-0.5 font-mono text-[8px]", statusClass(request.status))}>
                            {request.status.toUpperCase()}
                        </span>
                        <span className="truncate text-sm font-medium">{request.rule_name}</span>
                    </div>
                    <p className="mt-1 font-mono text-[9px] text-muted-foreground/50">
                        event {request.event_id.slice(0, 12)}… · requested {formatDateTime(request.requested_at)}
                    </p>
                </div>
                <div className="flex items-center gap-1.5">
                    <Clock className="size-3 text-muted-foreground/50" />
                    <span className="font-mono text-[9px] text-muted-foreground/50">
                        expires {formatDateTime(request.expires_at)}
                    </span>
                </div>
            </div>

            <div className="mt-3 space-y-1.5">
                {request.actions.map((action, index) => (
                    <div
                        key={`${action.action_type}-${index}`}
                        className="flex flex-wrap items-center gap-2 rounded-lg border border-border/50 bg-muted/20 px-2.5 py-1.5"
                    >
                        <span className="rounded border border-violet-500/25 bg-violet-500/10 px-1.5 py-0.5 font-mono text-[8px] text-violet-600 dark:text-violet-300">
                            {action.action_type}
                        </span>
                        <span className="min-w-0 flex-1 truncate font-mono text-[9px] text-muted-foreground/60">
                            {JSON.stringify(action.payload)}
                        </span>
                        <span className="font-mono text-[8px] text-muted-foreground/40">
                            {action.duration === -1 ? "permanent" : `${action.duration ?? 0}s`}
                        </span>
                    </div>
                ))}
            </div>

            {request.status === "pending" && (
                <div className="mt-3 flex flex-wrap items-center gap-2">
                    <Button type="button" size="sm" onClick={onApprove} disabled={busy}>
                        {busy ? <Loader2 className="mr-1.5 size-3.5 animate-spin" /> : <Check className="mr-1.5 size-3.5" />}
                        Approve
                    </Button>
                    {rejecting ? (
                        <>
                            <input
                                value={reason}
                                onChange={(event) => setReason(event.target.value)}
                                placeholder="Reason (optional)"
                                className="h-8 min-w-40 flex-1 rounded-md border border-border/70 bg-background px-2 text-xs outline-none focus:border-destructive/50"
                            />
                            <Button
                                type="button"
                                size="sm"
                                variant="destructive"
                                onClick={() => onReject(reason.trim())}
                                disabled={busy}
                            >
                                <ShieldX className="mr-1.5 size-3.5" />
                                Confirm reject
                            </Button>
                            <Button type="button" size="sm" variant="ghost" onClick={() => setRejecting(false)} disabled={busy}>
                                <X className="mr-1.5 size-3.5" />
                                Cancel
                            </Button>
                        </>
                    ) : (
                        <Button type="button" size="sm" variant="outline" onClick={() => setRejecting(true)} disabled={busy}>
                            <ShieldX className="mr-1.5 size-3.5" />
                            Reject
                        </Button>
                    )}
                </div>
            )}

            {request.status !== "pending" && request.resolved_at && (
                <p className="mt-2 font-mono text-[9px] text-muted-foreground/45">
                    {request.status} {formatRelativeTime(request.resolved_at)}
                    {request.reason ? ` · ${request.reason}` : ""}
                </p>
            )}
        </div>
    );
}

export default function ApprovalsPage() {
    const [status, setStatus] = useState<ApprovalStatus>("pending");
    const { requests, loading, error, reload, approve, reject } = useApprovals(status);

    return (
        <div className="space-y-4 px-4 md:px-5">
            <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                    <p className="font-mono text-[9px] uppercase tracking-widest text-muted-foreground/40">
                        Events / Approvals
                    </p>
                    <h2 className="text-lg font-semibold tracking-tight">Approval queue</h2>
                    <p className="text-xs text-muted-foreground/60">
                        Actions from rules marked “Require approval”. Nothing runs until an admin decides.
                    </p>
                </div>
                <Button type="button" variant="outline" size="sm" onClick={() => void reload()} disabled={loading}>
                    <RefreshCw className={cn("mr-1.5 size-3.5", loading && "animate-spin")} />
                    Refresh
                </Button>
            </div>

            <div className="flex flex-wrap gap-1.5">
                {STATUSES.map((entry) => (
                    <button
                        key={entry.value}
                        type="button"
                        onClick={() => setStatus(entry.value)}
                        className={cn(
                            "rounded-md border px-2 py-1 font-mono text-[9px] transition-colors",
                            status === entry.value
                                ? "border-violet-500/40 bg-violet-500/10 text-violet-700 dark:text-violet-300"
                                : "border-border/70 text-muted-foreground/50 hover:bg-muted/30",
                        )}
                    >
                        {entry.label}
                    </button>
                ))}
            </div>

            {error && (
                <p className="rounded-lg border border-destructive/25 bg-destructive/10 p-2 text-xs text-destructive">
                    {error}
                </p>
            )}

            {requests.length === 0 ? (
                <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border py-16 text-center">
                    <span className="flex size-11 items-center justify-center rounded-full border border-emerald-500/25 bg-emerald-500/10">
                        <ShieldCheck className="size-5 text-emerald-600 dark:text-emerald-400" />
                    </span>
                    <p className="text-sm font-semibold">Nothing waiting for approval</p>
                    <p className="max-w-md text-xs text-muted-foreground/60">
                        Enable “Require approval” on a rule to route its actions through this queue.
                    </p>
                </div>
            ) : (
                <div className="space-y-2">
                    {requests.map((request) => (
                        <ApprovalCard
                            key={request.id}
                            request={request}
                            busy={loading}
                            onApprove={() => void approve(request.id)}
                            onReject={(reason) => void reject(request.id, reason)}
                        />
                    ))}
                </div>
            )}
        </div>
    );
}
