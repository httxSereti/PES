import { IdleChannels } from "./idle-channels";
import { RunningRamps } from "./running-ramps";

/** Ramps cockpit: active ramps first, then the idle channels. */
export function RampsPanel() {
    return (
        <div className="flex min-w-0 flex-col gap-6">
            <RunningRamps />
            <IdleChannels />
        </div>
    );
}
