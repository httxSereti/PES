import { useState } from "react";
import { Activity, Settings2 } from "lucide-react";
import { toast } from "sonner";
import type { Route } from ".react-router/types/src/pages/app/admin/+types/logs";

import { Button } from "@pes/ui/components/button";
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from "@pes/ui/components/card";
import { Label } from "@pes/ui/components/label";
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from "@pes/ui/components/popover";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@pes/ui/components/select";
import { LiveLogViewer } from "@/components/common/admin/log-viewer/live-log-viewer";
import { LogFilesList } from "@/components/common/admin/log-viewer/log-files-list";
import { useLogSettings } from "@/hooks/useLogSettings";

// eslint-disable-next-line no-empty-pattern
export function meta({}: Route.MetaArgs) {
    return [
        { title: "PES | Admin - Logs" },
        {
            name: "description",
            content: "Live application logs, filters and log files",
        },
    ];
}

const LOG_LEVELS = ["DEBUG", "INFO", "WARNING", "ERROR"] as const;

function LogSettingsPopover({
    level,
    logDir,
    saving,
    onLevelChange,
}: {
    level: string;
    logDir?: string;
    saving: boolean;
    onLevelChange: (level: string) => Promise<void>;
}) {
    return (
        <Popover>
            <PopoverTrigger asChild>
                <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    className="size-8 shrink-0"
                >
                    <Settings2 className="size-4" />
                    <span className="sr-only">Log settings</span>
                </Button>
            </PopoverTrigger>
            <PopoverContent className="w-80" align="end">
                <div className="space-y-4">
                    <div className="space-y-1">
                        <h4 className="text-sm font-medium">
                            Log configuration
                        </h4>
                        <p className="text-xs text-muted-foreground">
                            Runtime configuration for the application logger.
                        </p>
                    </div>

                    <div className="space-y-1.5">
                        <Label className="text-xs">Level</Label>
                        <Select
                            value={level}
                            disabled={saving}
                            onValueChange={(value) => void onLevelChange(value)}
                        >
                            <SelectTrigger className="h-8 w-full">
                                <SelectValue placeholder="Select a level" />
                            </SelectTrigger>
                            <SelectContent>
                                {LOG_LEVELS.map((value) => (
                                    <SelectItem key={value} value={value}>
                                        {value}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                        <p className="text-[10.5px] text-muted-foreground/60">
                            Applies immediately. Resets to INFO on restart.
                        </p>
                    </div>

                    {logDir && (
                        <div className="space-y-1">
                            <Label className="text-xs">Log directory</Label>
                            <code className="block break-all rounded border bg-muted/30 p-2 font-mono text-[10.5px]">
                                {logDir}
                            </code>
                        </div>
                    )}
                </div>
            </PopoverContent>
        </Popover>
    );
}

export default function LogsPage() {
    const { settings, saving, setLevel } = useLogSettings();
    const [changingLevel, setChangingLevel] = useState(false);

    const level = settings?.level?.toUpperCase() ?? "INFO";

    const changeLevel = async (value: string) => {
        setChangingLevel(true);
        try {
            const ok = await setLevel(value);
            if (!ok) {
                toast.error("Failed to update the log level");
                return;
            }
            toast.success(`Log level set to ${value}`);
        } finally {
            setChangingLevel(false);
        }
    };

    return (
        <div className="space-y-4">
            <div className="mb-8 flex justify-between gap-4 px-5">
                <div className="flex-col">
                    <h1 className="font-syne text-xl font-extrabold sm:text-2xl lg:text-[26px]">
                        Logs
                    </h1>
                    <div className="text-xs text-muted-foreground">
                        Live application output, searchable and filterable in
                        real time
                    </div>
                </div>
                <div className="ml-auto flex items-center gap-2">
                    <div className="flex items-center gap-2 rounded-md px-3 py-1.5 accent-tile">
                        <Activity size={11} className="accent-tile-icon" />
                        <span className="font-mono-dm text-[11px] tracking-[0.06em] accent-tile-icon">
                            SSE
                        </span>
                    </div>
                </div>
            </div>

            <div className="space-y-6 px-5">
                <Card>
                    <CardHeader className="flex flex-row items-start justify-between gap-4 pb-3">
                        <div className="space-y-1">
                            <CardTitle className="flex items-center gap-2 text-sm">
                                <Activity className="size-3.5 accent-tile-icon" />
                                Live tail
                            </CardTitle>
                            <CardDescription className="text-xs">
                                Server-Sent Events stream · new lines appear
                                automatically
                            </CardDescription>
                        </div>
                        <LogSettingsPopover
                            level={level}
                            logDir={settings?.logDir}
                            saving={saving || changingLevel}
                            onLevelChange={changeLevel}
                        />
                    </CardHeader>
                    <CardContent>
                        <LiveLogViewer />
                    </CardContent>
                </Card>

                <LogFilesList />
            </div>
        </div>
    );
}
