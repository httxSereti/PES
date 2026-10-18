import { useEffect, useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@pes/ui/components/alert-dialog";
import { Button } from "@pes/ui/components/button";
import { Dialog, DialogContent, DialogTitle } from "@pes/ui/components/dialog";
import { Input } from "@pes/ui/components/input";
import { Tabs, TabsList, TabsTrigger } from "@pes/ui/components/tabs";

import { useWebSocket } from "@/hooks/useWebSocket";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import {
    closeProfileEdit,
    selectActiveProfile,
    selectEditingProfileName,
    selectProfileDetail,
} from "@/store/slices/profilesSlice";
import { rampsSelectors } from "@/store/slices/rampsSlice";
import { unitsSelectors } from "@/store/slices/unitsSlice";
import { ProfileMonogram, ProfileTypeBadge } from "../profile-badges";
import { EditorApplyTab } from "./editor-apply-tab";
import { EditorLevelsTab } from "./editor-levels-tab";
import { EditorRampsTab } from "./editor-ramps-tab";
import { EditorUnitRail } from "./editor-unit-rail";
import {
    buildUpdatePayload,
    validateDraft,
    type UnitId,
} from "./profile-document";
import { useProfileEditorDraft } from "./use-profile-editor";

type EditorTab = "levels" | "ramps" | "apply";

/**
 * Profile studio: edits a profile file (units, levels, ramps, apply
 * defaults) without touching the live hardware. Applying stays the explicit,
 * reversible action of the apply dialog.
 */
export function ProfileEditorDialog() {
    const dispatch = useAppDispatch();
    const { sendCommand } = useWebSocket();

    const name = useAppSelector(selectEditingProfileName);
    const detail = useAppSelector((state) =>
        name ? selectProfileDetail(state, name) : undefined,
    );
    const liveUnits = useAppSelector(unitsSelectors.selectEntities);
    const liveRamps = useAppSelector(rampsSelectors.selectAll);
    const activeProfile = useAppSelector(selectActiveProfile);

    const { draft, actions, isDirty, reset, includedUnits, rampCount } =
        useProfileEditorDraft(detail, liveUnits);

    const [tab, setTab] = useState<EditorTab>("levels");
    const [selectedUnit, setSelectedUnit] = useState<UnitId | null>(null);
    const [saving, setSaving] = useState(false);
    const [confirmDiscard, setConfirmDiscard] = useState(false);

    // Fresh request every time the editor opens: the file may have changed
    // outside the app since the last `profiles:detail` reply.
    useEffect(() => {
        if (!name) return;
        setTab("levels");
        setSelectedUnit(null);

        let cancelled = false;
        sendCommand("profiles:detail", { name })
            .then((result) => {
                if (cancelled) return;
                if (result.status !== "ok") {
                    toast.error("Failed to load profile", {
                        description: result.message ?? undefined,
                        position: "bottom-right",
                    });
                    dispatch(closeProfileEdit());
                }
            })
            .catch((error: unknown) => {
                if (cancelled) return;
                toast.error("Failed to load profile", {
                    description:
                        error instanceof Error ? error.message : undefined,
                    position: "bottom-right",
                });
                dispatch(closeProfileEdit());
            });
        return () => {
            cancelled = true;
        };
    }, [name, sendCommand, dispatch]);

    // Keep the selected unit valid while units are added/removed.
    useEffect(() => {
        if (selectedUnit && includedUnits.includes(selectedUnit)) return;
        setSelectedUnit(includedUnits[0] ?? null);
    }, [includedUnits, selectedUnit]);

    const loaded = Boolean(detail && name && detail.name === name && draft);
    const validationError = draft ? validateDraft(draft) : null;
    const selectedUnitDraft =
        draft && selectedUnit ? (draft.units[selectedUnit] ?? null) : null;

    const liveRampsForUnit = useMemo(
        () => liveRamps.map((ramp) => ({ ...ramp })),
        [liveRamps],
    );

    const handleOpenChange = (open: boolean) => {
        if (open) return;
        if (isDirty) setConfirmDiscard(true);
        else dispatch(closeProfileEdit());
    };

    const handleSave = async () => {
        if (!draft || !detail || validationError) {
            if (validationError) toast.error(validationError);
            return;
        }
        setSaving(true);
        try {
            const result = await sendCommand("profiles:update", {
                name: detail.name,
                ...buildUpdatePayload(draft, detail.name),
                from_current: false,
                include_ramps: true,
            });

            if (result.status === "ok") {
                toast.success(`Profile "${draft.name.trim()}" updated`, {
                    description: "Future applies use the new settings.",
                    position: "bottom-right",
                });
                dispatch(closeProfileEdit());
                return;
            }

            toast.error("Failed to update profile", {
                description: result.message ?? undefined,
                position: "bottom-right",
            });
        } catch (error) {
            toast.error("Failed to update profile", {
                description: error instanceof Error ? error.message : undefined,
                position: "bottom-right",
            });
        } finally {
            setSaving(false);
        }
    };

    const unitCount = includedUnits.length;
    const isActive = Boolean(detail && activeProfile?.name === detail.name);
    // Invalid ramps / unknown units are dropped on save: allow saving just to
    // clean the file even when nothing else was edited.
    const hasDroppedEntries = Boolean(
        draft?.warnings.some((warning) => warning.includes("will be removed")),
    );
    const canSave = isDirty || hasDroppedEntries;

    return (
        <>
            <Dialog open={Boolean(name)} onOpenChange={handleOpenChange}>
                <DialogContent
                    showCloseButton
                    className="flex h-dvh max-h-none w-screen max-w-none flex-col gap-0 overflow-hidden rounded-none p-0 sm:h-[min(92dvh,960px)] sm:w-[min(1160px,calc(100vw-2rem))] sm:max-w-[1160px] sm:rounded-xl"
                >
                    <DialogTitle className="sr-only">
                        {`Edit profile ${name ?? ""}`}
                    </DialogTitle>

                    {!loaded || !draft || !detail ? (
                        <div className="flex flex-1 flex-col items-center justify-center gap-3">
                            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                            <p className="text-sm text-muted-foreground">
                                Loading {name}...
                            </p>
                        </div>
                    ) : (
                        <>
                            <header className="flex shrink-0 items-start gap-3 border-b px-4 py-3 pr-12 sm:px-5">
                                <ProfileMonogram
                                    name={draft.name}
                                    legacy={detail.legacy}
                                    className="mt-0.5 h-9 w-9 rounded-[10px] text-sm"
                                />
                                <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                                    <div className="flex flex-wrap items-center gap-2">
                                        <Input
                                            value={draft.name}
                                            onChange={(event) =>
                                                actions.setName(
                                                    event.target.value,
                                                )
                                            }
                                            aria-label="Profile name"
                                            autoComplete="off"
                                            className="h-8 w-full max-w-64 font-mono text-sm"
                                        />
                                        <ProfileTypeBadge
                                            legacy={detail.legacy}
                                        />
                                        {isDirty && (
                                            <span className="font-mono text-[10px] text-amber-500">
                                                unsaved changes
                                            </span>
                                        )}
                                    </div>
                                    <Input
                                        value={draft.description}
                                        onChange={(event) =>
                                            actions.setDescription(
                                                event.target.value,
                                            )
                                        }
                                        aria-label="Profile description"
                                        placeholder="What this profile feels like..."
                                        maxLength={200}
                                        className="h-7 w-full max-w-xl text-xs"
                                    />
                                </div>
                            </header>

                            {isActive && (
                                <p className="shrink-0 border-b bg-purple-500/10 px-4 py-2 text-[11px] text-purple-700 sm:px-5 dark:text-purple-200">
                                    This profile is applied right now — edits
                                    apply to future applies only.
                                </p>
                            )}

                            <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
                                <EditorUnitRail
                                    draft={draft}
                                    detail={detail}
                                    liveUnits={liveUnits}
                                    selectedUnit={selectedUnit}
                                    onSelect={setSelectedUnit}
                                    actions={actions}
                                />

                                <div className="flex min-h-0 flex-1 flex-col">
                                    <div className="flex shrink-0 items-center gap-3 border-b px-4 py-2 sm:px-5">
                                        <Tabs
                                            value={tab}
                                            onValueChange={(value) =>
                                                setTab(value as EditorTab)
                                            }
                                        >
                                            <TabsList className="h-8">
                                                <TabsTrigger
                                                    value="levels"
                                                    className="text-xs"
                                                >
                                                    Levels
                                                </TabsTrigger>
                                                <TabsTrigger
                                                    value="ramps"
                                                    className="text-xs"
                                                >
                                                    Ramps
                                                    {rampCount > 0 && (
                                                        <span className="font-mono text-[10px] text-muted-foreground">
                                                            {rampCount}
                                                        </span>
                                                    )}
                                                </TabsTrigger>
                                                <TabsTrigger
                                                    value="apply"
                                                    className="text-xs"
                                                >
                                                    Apply
                                                    {draft.defaults.enabled && (
                                                        <span className="h-1.5 w-1.5 rounded-full bg-purple-500" />
                                                    )}
                                                </TabsTrigger>
                                            </TabsList>
                                        </Tabs>
                                        {selectedUnitDraft &&
                                            tab !== "apply" && (
                                                <span className="ml-auto font-mono text-[10px] text-muted-foreground">
                                                    editing{" "}
                                                    {selectedUnitDraft.id}
                                                </span>
                                            )}
                                    </div>

                                    <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-5">
                                        {draft.warnings.length > 0 && (
                                            <div className="mb-3 flex flex-col gap-1 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2">
                                                {draft.warnings.map(
                                                    (warning) => (
                                                        <p
                                                            key={warning}
                                                            className="text-[11px] text-amber-700 dark:text-amber-200"
                                                        >
                                                            {warning}
                                                        </p>
                                                    ),
                                                )}
                                            </div>
                                        )}

                                        {tab === "apply" ? (
                                            <EditorApplyTab
                                                draft={draft}
                                                actions={actions}
                                            />
                                        ) : !selectedUnitDraft ? (
                                            <p className="py-10 text-center text-sm text-muted-foreground">
                                                Add a unit to start editing.
                                            </p>
                                        ) : tab === "levels" ? (
                                            <EditorLevelsTab
                                                unit={selectedUnitDraft}
                                                detail={detail}
                                                live={
                                                    liveUnits[
                                                        selectedUnitDraft.id
                                                    ]
                                                }
                                                actions={actions}
                                            />
                                        ) : (
                                            <EditorRampsTab
                                                unit={selectedUnitDraft}
                                                liveRamps={liveRampsForUnit}
                                                actions={actions}
                                            />
                                        )}
                                    </div>
                                </div>
                            </div>

                            <footer className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-t px-4 py-3 sm:px-5">
                                <span className="font-mono text-[10px] text-muted-foreground">
                                    {unitCount} unit
                                    {unitCount === 1 ? "" : "s"} · {rampCount}{" "}
                                    ramp
                                    {rampCount === 1 ? "" : "s"}
                                    {validationError && (
                                        <span className="text-amber-500">
                                            {" "}
                                            · {validationError}
                                        </span>
                                    )}
                                </span>
                                <div className="flex items-center gap-2">
                                    <Button
                                        type="button"
                                        variant="outline"
                                        disabled={!isDirty || saving}
                                        onClick={reset}
                                    >
                                        Discard
                                    </Button>
                                    <Button
                                        type="button"
                                        disabled={
                                            saving ||
                                            !canSave ||
                                            Boolean(validationError)
                                        }
                                        onClick={() => void handleSave()}
                                    >
                                        {saving ? "Saving..." : "Save changes"}
                                    </Button>
                                </div>
                            </footer>
                        </>
                    )}
                </DialogContent>
            </Dialog>

            <AlertDialog open={confirmDiscard} onOpenChange={setConfirmDiscard}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>
                            Discard unsaved changes?
                        </AlertDialogTitle>
                        <AlertDialogDescription>
                            {`Your edits to "${draft?.name ?? name ?? ""}" will be lost.`}
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Keep editing</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={() => {
                                reset();
                                dispatch(closeProfileEdit());
                                setConfirmDiscard(false);
                            }}
                        >
                            Discard
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </>
    );
}
