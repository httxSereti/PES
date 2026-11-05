import { useEffect } from "react";
import type { TrainingGuidedConfig } from "@/types";
import { useWebSocket } from "@/hooks/useWebSocket";
import { useAppSelector } from "@/store/hooks";
import { profilesSelectors } from "@/store/slices/profilesSlice";
import { Input } from "@pes/ui/components/input";
import { Field, FieldLabel } from "@pes/ui/components/field";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@pes/ui/components/select";
import { Switch } from "@pes/ui/components/switch";
import { Cpu, ShieldCheck } from "lucide-react";

const NO_PROFILE = "__none__";

export const DEFAULT_GUIDED_CONFIG: TrainingGuidedConfig = {
  enabled: false,
  profile: null,
  start_level_pct: 60,
  phase_step_pct: 5,
  max_level_pct: 80,
  edge_drop_pct: 0,
  edge_cooldown_seconds: 0,
  restore_after_cooldown: true,
  reward_profile: null,
  reward_level_pct: 60,
  fail_profile: null,
  fail_level_pct: 30,
  neutralize_on_fail: true,
};

/** Merge a stored config with the safe defaults (null = automation off). */
export function guidedConfigFrom(
  value: TrainingGuidedConfig | null | undefined,
): TrainingGuidedConfig {
  if (!value) return { ...DEFAULT_GUIDED_CONFIG };
  return {
    enabled: value.enabled ?? DEFAULT_GUIDED_CONFIG.enabled,
    profile: value.profile ?? null,
    start_level_pct:
      value.start_level_pct ?? DEFAULT_GUIDED_CONFIG.start_level_pct,
    phase_step_pct:
      value.phase_step_pct ?? DEFAULT_GUIDED_CONFIG.phase_step_pct,
    max_level_pct: value.max_level_pct ?? DEFAULT_GUIDED_CONFIG.max_level_pct,
    edge_drop_pct: value.edge_drop_pct ?? DEFAULT_GUIDED_CONFIG.edge_drop_pct,
    edge_cooldown_seconds:
      value.edge_cooldown_seconds ??
      DEFAULT_GUIDED_CONFIG.edge_cooldown_seconds,
    restore_after_cooldown:
      value.restore_after_cooldown ??
      DEFAULT_GUIDED_CONFIG.restore_after_cooldown,
    reward_profile: value.reward_profile ?? null,
    reward_level_pct:
      value.reward_level_pct ?? DEFAULT_GUIDED_CONFIG.reward_level_pct,
    fail_profile: value.fail_profile ?? null,
    fail_level_pct:
      value.fail_level_pct ?? DEFAULT_GUIDED_CONFIG.fail_level_pct,
    neutralize_on_fail:
      value.neutralize_on_fail ?? DEFAULT_GUIDED_CONFIG.neutralize_on_fail,
  };
}

interface GuidedAutomationFieldsProps {
  value: TrainingGuidedConfig;
  onChange: (next: TrainingGuidedConfig) => void;
  disabled?: boolean;
}

function clampNumber(raw: string, min: number, max: number): number {
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return min;
  return Math.max(min, Math.min(max, Math.round(parsed)));
}

/** Optional profile/phase automation, shown for guided sessions only. */
export function GuidedAutomationFields({
  value,
  onChange,
  disabled = false,
}: GuidedAutomationFieldsProps) {
  const profiles = useAppSelector(profilesSelectors.selectAll);
  const profilesInitialized = useAppSelector(
    (state) => state.profiles.initialized,
  );
  const { sendCommand } = useWebSocket();

  useEffect(() => {
    if (!profilesInitialized) {
      sendCommand("profiles:list").catch(() => undefined);
    }
  }, [profilesInitialized, sendCommand]);

  function update<K extends keyof TrainingGuidedConfig>(
    key: K,
    next: TrainingGuidedConfig[K],
  ) {
    onChange({ ...value, [key]: next });
  }

  return (
    <div
      className={`space-y-3 rounded-lg border p-3.5 transition-colors ${
        value.enabled
          ? "border-amber-500/25 bg-amber-500/5"
          : "border-border/30 bg-transparent"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-2">
          <Cpu
            size={13}
            className={
              value.enabled
                ? "mt-0.5 text-amber-500"
                : "mt-0.5 text-muted-foreground/30"
            }
          />
          <div className="flex flex-col">
            <span
              className={`font-mono text-[11px] ${
                value.enabled
                  ? "text-amber-600 dark:text-amber-300"
                  : "text-muted-foreground/40"
              }`}
            >
              Hardware automation
            </span>
            <span className="text-[10px] text-muted-foreground/50">
              Applies a profile at start, steps it up per phase and lowers it
              after each edge.
            </span>
          </div>
        </div>
        <Switch
          id="form-training-session-guided-automation"
          checked={value.enabled}
          disabled={disabled}
          onCheckedChange={(checked) => update("enabled", checked)}
        />
      </div>

      {value.enabled && (
        <div className="space-y-3 border-t border-amber-500/15 pt-3">
          <div className="space-y-1.5">
            <FieldLabel htmlFor="form-training-guided-profile">
              Start profile
            </FieldLabel>
            <Select
              value={value.profile ?? NO_PROFILE}
              onValueChange={(next) =>
                update("profile", next === NO_PROFILE ? null : next)
              }
              disabled={disabled}
            >
              <SelectTrigger
                id="form-training-guided-profile"
                aria-label="Guided automation profile"
              >
                <SelectValue placeholder="Select a profile" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NO_PROFILE}>No profile</SelectItem>
                {profiles.map((profile) => (
                  <SelectItem key={profile.name} value={profile.name}>
                    {profile.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {!value.profile && (
              <p className="text-[10px] text-destructive">
                Automation needs a start profile.
              </p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field className="space-y-1">
              <FieldLabel htmlFor="form-training-guided-start">
                Start level (%)
              </FieldLabel>
              <Input
                id="form-training-guided-start"
                type="number"
                min={0}
                max={100}
                step={5}
                value={value.start_level_pct}
                disabled={disabled}
                onChange={(event) =>
                  update(
                    "start_level_pct",
                    clampNumber(event.target.value, 0, 100),
                  )
                }
              />
            </Field>
            <Field className="space-y-1">
              <FieldLabel htmlFor="form-training-guided-max">
                Safety ceiling (%)
              </FieldLabel>
              <Input
                id="form-training-guided-max"
                type="number"
                min={0}
                max={100}
                step={5}
                value={value.max_level_pct}
                disabled={disabled}
                onChange={(event) =>
                  update(
                    "max_level_pct",
                    clampNumber(event.target.value, 0, 100),
                  )
                }
              />
            </Field>
            <Field className="space-y-1">
              <FieldLabel htmlFor="form-training-guided-step">
                Phase step (%)
              </FieldLabel>
              <Input
                id="form-training-guided-step"
                type="number"
                min={0}
                max={30}
                step={1}
                value={value.phase_step_pct}
                disabled={disabled}
                onChange={(event) =>
                  update(
                    "phase_step_pct",
                    clampNumber(event.target.value, 0, 30),
                  )
                }
              />
            </Field>
            <Field className="space-y-1">
              <FieldLabel htmlFor="form-training-guided-drop">
                Drop after an edge (%)
              </FieldLabel>
              <Input
                id="form-training-guided-drop"
                type="number"
                min={0}
                max={50}
                step={1}
                value={value.edge_drop_pct}
                disabled={disabled}
                onChange={(event) =>
                  update(
                    "edge_drop_pct",
                    clampNumber(event.target.value, 0, 50),
                  )
                }
              />
            </Field>
          </div>

          <Field className="space-y-1">
            <FieldLabel htmlFor="form-training-guided-cooldown">
              Automation cooldown (seconds)
            </FieldLabel>
            <Input
              id="form-training-guided-cooldown"
              type="number"
              min={0}
              max={3600}
              step={5}
              value={value.edge_cooldown_seconds}
              disabled={disabled}
              onChange={(event) =>
                update(
                  "edge_cooldown_seconds",
                  clampNumber(event.target.value, 0, 3600),
                )
              }
            />
            <p className="text-[10px] text-muted-foreground/50">
              Keeps the reduced level for this long after an edge. 0 leaves it
              reduced until the next phase.
            </p>
          </Field>

          <div className="flex items-center justify-between gap-3">
            <div className="flex flex-col">
              <span className="text-[11px] font-medium">
                Restore the phase level after the cooldown
              </span>
              <span className="text-[10px] text-muted-foreground/50">
                Off keeps the reduced level until the next phase.
              </span>
            </div>
            <Switch
              checked={value.restore_after_cooldown}
              disabled={disabled}
              onCheckedChange={(checked) =>
                update("restore_after_cooldown", checked)
              }
            />
          </div>

          <div className="grid grid-cols-2 gap-3 border-t border-border/20 pt-3">
            <div className="space-y-1.5">
              <FieldLabel htmlFor="form-training-guided-reward">
                Reward profile
              </FieldLabel>
              <Select
                value={value.reward_profile ?? NO_PROFILE}
                onValueChange={(next) =>
                  update("reward_profile", next === NO_PROFILE ? null : next)
                }
                disabled={disabled}
              >
                <SelectTrigger
                  id="form-training-guided-reward"
                  aria-label="Guided reward profile"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_PROFILE}>None</SelectItem>
                  {profiles.map((profile) => (
                    <SelectItem key={profile.name} value={profile.name}>
                      {profile.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Field className="space-y-1">
              <FieldLabel htmlFor="form-training-guided-reward-level">
                Reward level (%)
              </FieldLabel>
              <Input
                id="form-training-guided-reward-level"
                type="number"
                min={0}
                max={100}
                step={5}
                value={value.reward_level_pct}
                disabled={disabled}
                onChange={(event) =>
                  update(
                    "reward_level_pct",
                    clampNumber(event.target.value, 0, 100),
                  )
                }
              />
            </Field>
          </div>

          <div className="space-y-3 border-t border-border/20 pt-3">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <ShieldCheck size={12} className="text-rose-500/80" />
                <div className="flex flex-col">
                  <span className="text-[11px] font-medium">
                    Neutralize on failure
                  </span>
                  <span className="text-[10px] text-muted-foreground/50">
                    Cancels the queue, ramps and outputs.
                  </span>
                </div>
              </div>
              <Switch
                checked={value.neutralize_on_fail}
                disabled={disabled}
                onCheckedChange={(checked) =>
                  update("neutralize_on_fail", checked)
                }
              />
            </div>

            {!value.neutralize_on_fail && (
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <FieldLabel htmlFor="form-training-guided-fail">
                    Punishment profile
                  </FieldLabel>
                  <Select
                    value={value.fail_profile ?? NO_PROFILE}
                    onValueChange={(next) =>
                      update("fail_profile", next === NO_PROFILE ? null : next)
                    }
                    disabled={disabled}
                  >
                    <SelectTrigger
                      id="form-training-guided-fail"
                      aria-label="Guided punishment profile"
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NO_PROFILE}>None</SelectItem>
                      {profiles.map((profile) => (
                        <SelectItem key={profile.name} value={profile.name}>
                          {profile.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <Field className="space-y-1">
                  <FieldLabel htmlFor="form-training-guided-fail-level">
                    Punishment level (%)
                  </FieldLabel>
                  <Input
                    id="form-training-guided-fail-level"
                    type="number"
                    min={0}
                    max={100}
                    step={5}
                    value={value.fail_level_pct}
                    disabled={disabled}
                    onChange={(event) =>
                      update(
                        "fail_level_pct",
                        clampNumber(event.target.value, 0, 100),
                      )
                    }
                  />
                </Field>
              </div>
            )}
          </div>

          <p className="rounded-md border border-amber-500/15 bg-amber-500/5 px-2.5 py-2 text-[10px] leading-relaxed text-muted-foreground/70">
            Hardware automation is opt-in and capped by the safety ceiling.
            Every automated change is reversed when the session is cancelled or
            interrupted, and the normal stop / neutralize paths always win.
          </p>
        </div>
      )}
    </div>
  );
}
