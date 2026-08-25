import { BookOpen, Crosshair, Percent } from "lucide-react";
import { EVENT_GROUPS } from "@/components/common/events/event-groups";
import { Card, CardContent, CardHeader, CardTitle } from "@pes/ui/components/card";

/** Short human description per triggerable event type (see events/enums.py). */
const EVENT_DESCRIPTIONS: Record<string, string> = {
    chaster_pillory_vote: "A vote was cast on an active pillory",
    chaster_pillory_started: "A pillory sentence started",
    chaster_pillory_ended: "A pillory sentence ended",
    chaster_vote_add: "An upvote was received on a shared link",
    chaster_vote_sub: "A downvote was received on a shared link",
    chaster_time_add: "Time was added to a lock",
    chaster_time_sub: "Time was removed from a lock",
    chaster_wof_turned: "The Wheel of Fortune was turned",
    chaster_lock_frozen: "The lock was frozen",
    chaster_lock_unfrozen: "The lock was unfrozen",
    sensor_sound_alarm: "Noise crossed the alarm threshold",
    sensor_position_alarm: "Position/orientation alarm fired",
    sensor_move_alarm: "Movement was detected",
};

const UNIT_TARGETING: Array<[string, string]> = [
    ["1", "unit 1 only"],
    ["123", "units 1, 2 and 3"],
    ["12RO", "one random unit among 1 and 2"],
    ["12RM", "random mix of 1 and 2 (at least one)"],
];

const CHANNEL_TARGETING: Array<[string, string]> = [
    ["A", "channel A only"],
    ["AB", "channels A and B"],
    ["ABRO", "one random channel among A and B"],
    ["ABRM", "random mix of A and B (at least one)"],
];

const MAGIC_NUMBERS: Array<[string, string]> = [
    ["5", "set the value to exactly 5"],
    ["+5", "add 5 to the current value"],
    ["-5", "subtract 5 from the current value"],
    ["%+25", "add 25% of the current value"],
    ["%-25", "remove 25% of the current value"],
    ["[5-25]", "pick a random value between 5 and 25"],
    ["+[5-25]", "add a random amount between 5 and 25"],
    ["%-[5-25]", "remove a random percentage between 5% and 25%"],
];

function Code({ children }: { children: React.ReactNode }) {
    return (
        <code className="px-1.5 py-0.5 rounded bg-muted dark:bg-black/30 border border-border/60 font-mono text-[11px] text-violet-700 dark:text-violet-300 whitespace-nowrap">
            {children}
        </code>
    );
}

function WikiSection({ icon, title, children }: {
    icon: React.ReactNode;
    title: string;
    children: React.ReactNode;
}) {
    return (
        <div className="space-y-3">
            <div className="flex items-center gap-2">
                {icon}
                <span className="text-[11px] uppercase tracking-widest text-muted-foreground/70 font-semibold">{title}</span>
            </div>
            {children}
        </div>
    );
}

function DefinitionList({ entries }: { entries: Array<[string, string]> }) {
    return (
        <div className="space-y-1.5">
            {entries.map(([expr, desc]) => (
                <div key={expr} className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                    <Code>{expr}</Code>
                    <span className="text-xs text-muted-foreground/80">{desc}</span>
                </div>
            ))}
        </div>
    );
}

export default function EventsWiki() {
    return (
        <Card>
            <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-sm">
                    <BookOpen size={14} className="accent-tile-icon" />
                    Events handbook
                </CardTitle>
            </CardHeader>
            <CardContent className="pt-0 space-y-6">

                <WikiSection icon={<BookOpen size={12} className="text-muted-foreground/50" />} title="Available events">
                    <p className="text-xs text-muted-foreground/70">
                        Every event below can be selected when creating a trigger rule.
                        They are grouped by provider/service.
                    </p>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {Object.entries(EVENT_GROUPS).map(([groupKey, group]) => (
                            <div key={groupKey} className="rounded-lg border border-border/60 p-3 space-y-2">
                                <div className="text-xs font-semibold text-foreground">{group.label}</div>
                                <div className="space-y-1">
                                    {group.types.map(type => (
                                        <div key={type} className="flex flex-col sm:flex-row sm:items-baseline gap-0.5 sm:gap-2">
                                            <code className="font-mono text-[11px] text-violet-700 dark:text-violet-300 whitespace-nowrap">
                                                {type}
                                            </code>
                                            <span className="text-[11px] text-muted-foreground/60">
                                                {EVENT_DESCRIPTIONS[type] ?? ""}
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        ))}
                    </div>
                </WikiSection>

                <WikiSection icon={<Crosshair size={12} className="text-muted-foreground/50" />} title="Targeting units & channels">
                    <p className="text-xs text-muted-foreground/80">
                        In LEVEL/MULT actions, list the units (<Code>1</Code>–<Code>3</Code>) and channels
                        (<Code>A</Code>,<Code>B</Code>) to target. Add a suffix for randomness — for example{" "}
                        <Code>12RM</Code> targets units 1 and/or 2 at random, so every run hits differently.
                    </p>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="rounded-lg border border-border/60 p-3 space-y-2">
                            <div className="text-xs font-semibold text-foreground">Units</div>
                            <DefinitionList entries={UNIT_TARGETING} />
                        </div>
                        <div className="rounded-lg border border-border/60 p-3 space-y-2">
                            <div className="text-xs font-semibold text-foreground">Channels</div>
                            <DefinitionList entries={CHANNEL_TARGETING} />
                        </div>
                    </div>
                    <p className="text-[11px] text-muted-foreground/50">
                        <Code>RO</Code> = random one · <Code>RM</Code> = random many (each candidate has a chance, at least one is always kept)
                    </p>
                </WikiSection>

                <WikiSection icon={<Percent size={12} className="text-muted-foreground/50" />} title="Magic numbers (values & operators)">
                    <p className="text-xs text-muted-foreground/80">
                        Values accept absolute numbers, relative operators and ranges. Results are always
                        clamped to 0–99. With a current level of 20:
                    </p>
                    <DefinitionList entries={MAGIC_NUMBERS} />
                </WikiSection>

            </CardContent>
        </Card>
    );
}
