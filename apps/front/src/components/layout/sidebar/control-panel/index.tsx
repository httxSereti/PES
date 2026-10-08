import { useSidebar } from "@pes/ui/components/sidebar";

import { ActiveProfileCard } from "./active-profile-card";
import { CollapsedControlPanel } from "./collapsed-control-panel";
import { ConnectionCard } from "./connection-card";
import { SessionActivity } from "./session-activity";
import { UserMenu } from "./user-menu";

export function ControlPanel() {
  const { open } = useSidebar();

  if (!open) {
    return <CollapsedControlPanel />;
  }

  return (
    <div className="flex flex-col gap-2">
      <ActiveProfileCard />
      <SessionActivity />
      <ConnectionCard />
      <UserMenu />
    </div>
  );
}
