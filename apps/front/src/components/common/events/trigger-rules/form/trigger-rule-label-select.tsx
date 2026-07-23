import { useState } from "react";
import { Check, Plus, Tag, X } from "lucide-react";

import { Button } from "@pes/ui/components/button";
import { Badge } from "@pes/ui/components/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@pes/ui/components/popover";
import {
    Command,
    CommandEmpty,
    CommandGroup,
    CommandInput,
    CommandItem,
    CommandList,
} from "@pes/ui/components/command";

import { useAppSelector } from "@/store/hooks";
import { triggerRuleLabelsSelectors } from "@/store/slices/triggerRuleLabelsSlice";

/**
 * Multi-select for trigger rule labels. Works on label *names*:
 * existing labels are picked from the store, and typing a new name lets you
 * create it on the fly (it is materialized server-side on submit).
 */
export default function TriggerRuleLabelSelect({
    value,
    onChange,
}: {
    value: string[];
    onChange: (names: string[]) => void;
}) {
    const labels = useAppSelector(triggerRuleLabelsSelectors.selectAll);
    const [open, setOpen] = useState(false);
    const [query, setQuery] = useState("");

    const toggle = (name: string) => {
        if (value.includes(name)) {
            onChange(value.filter((n) => n !== name));
        } else {
            onChange([...value, name]);
        }
    };

    const remove = (name: string) => onChange(value.filter((n) => n !== name));

    const trimmed = query.trim();
    const existingNames = labels.map((l) => l.name);
    const canCreate =
        trimmed.length > 0 &&
        !existingNames.some((n) => n.toLowerCase() === trimmed.toLowerCase()) &&
        !value.some((n) => n.toLowerCase() === trimmed.toLowerCase());

    return (
        <div className="space-y-2">
            <Popover open={open} onOpenChange={setOpen}>
                <PopoverTrigger asChild>
                    <Button type="button" variant="outline" className="w-fit">
                        <Tag className="mr-2 h-4 w-4" />
                        {value.length > 0 ? `${value.length} label${value.length > 1 ? "s" : ""}` : "Add labels"}
                    </Button>
                </PopoverTrigger>
                <PopoverContent className="w-64 p-0" align="start">
                    <Command>
                        <CommandInput placeholder="Search or create…" value={query} onValueChange={setQuery} />
                        <CommandList>
                            <CommandEmpty>{canCreate ? null : "No labels found."}</CommandEmpty>
                            {labels.length > 0 && (
                                <CommandGroup heading="Existing">
                                    {labels.map((label) => {
                                        const selected = value.includes(label.name);
                                        return (
                                            <CommandItem
                                                key={label.id}
                                                value={label.name}
                                                onSelect={() => toggle(label.name)}
                                            >
                                                <Check
                                                    className={`mr-2 h-4 w-4 ${selected ? "opacity-100" : "opacity-0"}`}
                                                />
                                                {label.name}
                                            </CommandItem>
                                        );
                                    })}
                                </CommandGroup>
                            )}
                            {canCreate && (
                                <CommandGroup heading="Create">
                                    <CommandItem
                                        value={`create-${trimmed}`}
                                        onSelect={() => {
                                            toggle(trimmed);
                                            setQuery("");
                                        }}
                                    >
                                        <Plus className="mr-2 h-4 w-4" />
                                        Create &quot;{trimmed}&quot;
                                    </CommandItem>
                                </CommandGroup>
                            )}
                        </CommandList>
                    </Command>
                </PopoverContent>
            </Popover>

            {value.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                    {value.map((name) => (
                        <Badge
                            key={name}
                            variant="outline"
                            className="gap-1 border-violet-500/30 bg-violet-500/15 font-mono text-[10px] text-violet-700 dark:text-violet-300"
                        >
                            {name}
                            <button
                                type="button"
                                onClick={() => remove(name)}
                                className="rounded-sm opacity-60 hover:opacity-100"
                                aria-label={`Remove ${name}`}
                            >
                                <X className="h-3 w-3" />
                            </button>
                        </Badge>
                    ))}
                </div>
            )}
        </div>
    );
}
