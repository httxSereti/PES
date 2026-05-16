import { Search, X } from "lucide-react";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectSeparator, SelectTrigger, SelectValue } from "@pes/ui/components/select";
import { EVENT_GROUPS, STATIC_GROUPED } from "./event-groups";

interface EventsToolbarProps {
    search: string;
    onSearchChange: (v: string) => void;
    selectedFilter: string;
    onFilterChange: (v: string) => void;
    unknownTypes: string[];
    filteredCount: number;
    totalCount: number;
}

export function EventsToolbar({
    search, onSearchChange,
    selectedFilter, onFilterChange,
    unknownTypes,
    filteredCount, totalCount,
}: EventsToolbarProps) {
    const hasFilters = search !== "" || selectedFilter !== "all";

    return (
        <div className="flex items-center gap-3">
            {/* Search */}
            <div className="relative flex-1 max-w-sm">
                <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground/50" />
                <input
                    id="events-search"
                    type="text"
                    value={search}
                    onChange={e => onSearchChange(e.target.value)}
                    placeholder="Search events..."
                    className="w-full pl-8 pr-3 py-1.5 text-xs bg-white/[0.04] border border-white/10 rounded-md text-slate-200 placeholder:text-muted-foreground/40 focus:outline-none focus:border-purple-500/50 focus:ring-1 focus:ring-purple-500/20 transition"
                />
            </div>

            {/* Group / type filter */}
            <Select value={selectedFilter} onValueChange={onFilterChange}>
                <SelectTrigger className="h-[30px] px-3 py-1.5 text-xs bg-white/[0.04] border border-white/10 rounded-md text-slate-200 focus:ring-purple-500/20 focus:border-purple-500/50 transition cursor-pointer font-normal">
                    <SelectValue placeholder="All events" />
                </SelectTrigger>
                <SelectContent>
                    <SelectItem value="all" className="text-xs">All events</SelectItem>

                    {Object.entries(STATIC_GROUPED).map(([groupKey, types]) => (
                        <SelectGroup key={groupKey}>
                            <SelectSeparator />
                            <SelectItem value={groupKey} className="text-[10px] uppercase tracking-widest text-muted-foreground/50 px-2 py-1">
                                All {EVENT_GROUPS[groupKey]?.label ?? groupKey}
                            </SelectItem>
                            {types.map((t: string) => (
                                <SelectItem key={t} value={t} className="text-xs pl-4">
                                    {t.replace(/^[^_]+_/, "")}
                                </SelectItem>
                            ))}
                        </SelectGroup>
                    ))}

                    {unknownTypes.length > 0 && (
                        <SelectGroup>
                            <SelectSeparator />
                            <SelectLabel className="text-[10px] uppercase tracking-widest text-muted-foreground/50 px-2 py-1">Other</SelectLabel>
                            {unknownTypes.map((t: string) => (
                                <SelectItem key={t} value={t} className="text-xs">{t}</SelectItem>
                            ))}
                        </SelectGroup>
                    )}
                </SelectContent>
            </Select>

            {/* Clear */}
            {hasFilters && (
                <button
                    onClick={() => { onSearchChange(""); onFilterChange("all"); }}
                    className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs text-muted-foreground/70 hover:text-slate-200 bg-white/[0.03] border border-white/10 rounded-md transition"
                >
                    <X size={11} />
                    Clear
                </button>
            )}

            <span className="ml-auto text-xs text-muted-foreground/50">
                {filteredCount} / {totalCount}
            </span>
        </div>
    );
}
