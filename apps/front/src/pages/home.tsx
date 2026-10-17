import type { Route } from "../pages/+types/home";
import { HomeStatusStrip } from "@/components/common/home/status-strip";
import { RecentActivity } from "@/components/common/home/recent-activity";
import { RampsPanel } from "@/components/common/ramps/ramps-panel";

// eslint-disable-next-line no-empty-pattern
export function meta({ }: Route.MetaArgs) {
  return [
    { title: "PES | Home" },
    { name: "description", content: "Ramps cockpit — start, watch and stop your units' ramps" },
  ];
}

export default function Home() {
  return (
    <div className="flex flex-col gap-4">
      <div className="px-5 mb-2">
        <h1 className="font-syne text-xl sm:text-2xl lg:text-[26px] font-extrabold">Ramps</h1>
        <p className="text-muted-foreground text-xs">
          Software ramps for your units — start, pause and stop them here.
        </p>
      </div>

      <div className="px-5 mb-5 flex flex-col gap-6">
        <HomeStatusStrip />

        <div className="grid grid-cols-1 items-start gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
          <RampsPanel />
          <div className="hidden xl:block">
            <RecentActivity />
          </div>
        </div>
      </div>
    </div>
  );
}
