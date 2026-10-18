import { Switch } from "@pes/ui/components/switch";
import { formatClock } from "../profile-shape";
import { Input } from "@pes/ui/components/input";

import { LevelControl, ToggleChip } from "./editor-controls";
import {
    DURATION_PRESETS,
    UNIT_IDS,
    type ProfileDraft,
} from "./profile-document";
import type { ProfileEditorActions } from "./use-profile-editor";

type EditorApplyTabProps = {
    draft: ProfileDraft;
    actions: ProfileEditorActions;
};

/**
 * Optional per-profile apply defaults: prefill values for the apply dialog.
 * The executor ignores them; trigger rules keep their own level/duration.
 */
export function EditorApplyTab({ draft, actions }: EditorApplyTabProps) {
    const { defaults } = draft;
    const included = UNIT_IDS.filter((id) => draft.units[id]);
    // An empty list means "all units" (same convention as the apply payload)
    const selectedUnits = defaults.units.length > 0 ? defaults.units : included;

    return (
        <div className="flex flex-col gap-4">
            <label className="flex items-center justify-between gap-3 rounded-xl border bg-card p-3.5">
                <span className="flex flex-col gap-0.5">
                    <span className="text-[13px] font-medium">
                        Apply defaults on this profile
                    </span>
                    <span className="text-[11px] text-muted-foreground">
                        Prefills the apply dialog when you or a trigger picks
                        this profile. Trigger rules still set their own level
                        and duration.
                    </span>
                </span>
                <Switch
                    checked={defaults.enabled}
                    onCheckedChange={(checked) =>
                        actions.patchDefaults({ enabled: checked })
                    }
                />
            </label>

            {!defaults.enabled ? (
                <p className="rounded-xl border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">
                    No defaults stored — the apply dialog starts at 100% and
                    runs until stopped.
                </p>
            ) : (
                <>
                    <div className="flex flex-col gap-2 rounded-xl border bg-card p-3.5">
                        <div className="flex items-center justify-between">
                            <span className="text-[13px] font-medium">
                                Intensity
                            </span>
                            <span className="font-mono text-xs text-muted-foreground tabular-nums">
                                {defaults.level_pct}%
                            </span>
                        </div>
                        <LevelControl
                            value={defaults.level_pct}
                            max={150}
                            aria-label="Default apply intensity"
                            onChange={(level_pct) =>
                                actions.patchDefaults({ level_pct })
                            }
                        />
                        <p className="text-[11px] text-muted-foreground">
                            Over 100% amplifies the stored levels, capped by the
                            usage limits of each channel.
                        </p>
                    </div>

                    <div className="flex flex-col gap-2 rounded-xl border bg-card p-3.5">
                        <div className="flex items-center justify-between">
                            <span className="text-[13px] font-medium">
                                Duration
                            </span>
                            <span className="font-mono text-xs text-muted-foreground tabular-nums">
                                {defaults.duration === -1
                                    ? "until stopped"
                                    : formatClock(defaults.duration)}
                            </span>
                        </div>
                        <div className="flex flex-wrap items-center gap-1.5">
                            {DURATION_PRESETS.map((preset) => (
                                <ToggleChip
                                    key={preset.value}
                                    active={defaults.duration === preset.value}
                                    onClick={() =>
                                        actions.patchDefaults({
                                            duration: preset.value,
                                        })
                                    }
                                >
                                    {preset.label}
                                </ToggleChip>
                            ))}
                            <Input
                                type="number"
                                min={-1}
                                value={defaults.duration}
                                aria-label="Default duration in seconds"
                                onChange={(event) =>
                                    actions.patchDefaults({
                                        duration: Number(event.target.value),
                                    })
                                }
                                className="h-7 w-24 text-center font-mono text-xs"
                            />
                            <span className="text-[11px] text-muted-foreground">
                                seconds (-1 = ∞)
                            </span>
                        </div>
                    </div>

                    <div className="flex flex-col gap-2 rounded-xl border bg-card p-3.5">
                        <div className="flex items-center justify-between">
                            <span className="text-[13px] font-medium">
                                Units
                            </span>
                            <span className="font-mono text-xs text-muted-foreground tabular-nums">
                                {selectedUnits.length === included.length
                                    ? "all"
                                    : `${selectedUnits.length}/${included.length}`}
                            </span>
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                            {included.map((id) => {
                                const active = selectedUnits.includes(id);
                                return (
                                    <ToggleChip
                                        key={id}
                                        active={active}
                                        disabled={
                                            active && selectedUnits.length <= 1
                                        }
                                        title={
                                            active && selectedUnits.length <= 1
                                                ? "At least one unit is required"
                                                : undefined
                                        }
                                        className="font-mono"
                                        onClick={() =>
                                            actions.patchDefaults({
                                                units: active
                                                    ? selectedUnits.filter(
                                                          (unit) => unit !== id,
                                                      )
                                                    : [...selectedUnits, id],
                                            })
                                        }
                                    >
                                        {id}
                                    </ToggleChip>
                                );
                            })}
                            <ToggleChip
                                active={
                                    selectedUnits.length === included.length
                                }
                                onClick={() =>
                                    actions.patchDefaults({ units: included })
                                }
                            >
                                All
                            </ToggleChip>
                        </div>
                        <p className="text-[11px] text-muted-foreground">
                            Only the units ticked here are preselected; the
                            apply dialog can still change them per run.
                        </p>
                    </div>
                </>
            )}
        </div>
    );
}
