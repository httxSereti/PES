import { SESSION_TYPE_META } from "@/components/common/session/session.constants";
import { useAppSelector } from "@/store/hooks";
import { CircleDashed } from "lucide-react";

export function useSessionInfo() {
  const activeSession = useAppSelector((state) => state.session.activeSession);
  const isLive =
    activeSession?.status === "running" && !!activeSession.started_at;

  if (!isLive) {
    return {
      activeSession,
      isLive: false as const,
      SessionIcon: CircleDashed,
      sessionHref: "/app/sessions",
    };
  }

  const sessionMeta = SESSION_TYPE_META.find(
    (meta) => meta.value === activeSession.type,
  );

  return {
    activeSession,
    isLive: true as const,
    SessionIcon: sessionMeta?.icon ?? CircleDashed,
    sessionHref: `/app/sessions/${activeSession.id}`,
  };
}
