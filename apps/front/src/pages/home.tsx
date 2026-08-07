import type { Route } from "../pages/+types/home";
import { RampsPanel } from "@/components/common/ramps/ramps-panel";

// eslint-disable-next-line no-empty-pattern
export function meta({ }: Route.MetaArgs) {
  return [
    { title: "PES" },
    { name: "description", content: "Welcome to React Router!" },
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
      <RampsPanel />
    </div>
  );
}
