import { DataTableRoot } from "@pes/ui/components/niko-table/core/data-table-root"
import { DataTable } from "@pes/ui/components/niko-table/core/data-table"
import {
    DataTableHeader,
    DataTableBody,
    DataTableEmptyBody,
} from "@pes/ui/components/niko-table/core/data-table-structure"
import { DataTableColumnHeader } from "@pes/ui/components/niko-table/components/data-table-column-header"
import { DataTableColumnTitle } from "@pes/ui/components/niko-table/components/data-table-column-title"
import { DataTableColumnSortMenu } from "@pes/ui/components/niko-table/components/data-table-column-sort"
import { DataTableColumnFacetedFilterMenu } from "@pes/ui/components/niko-table/components/data-table-column-faceted-filter"
import { DataTableColumnSliderFilterMenu } from "@pes/ui/components/niko-table/components/data-table-column-slider-filter-options"
import { DataTableColumnDateFilterMenu } from "@pes/ui/components/niko-table/components/data-table-column-date-filter-options"
import { DataTableToolbarSection } from "@pes/ui/components/niko-table/components/data-table-toolbar-section"
import {
    DataTableEmptyIcon,
    DataTableEmptyMessage,
    DataTableEmptyFilteredMessage,
    DataTableEmptyTitle,
    DataTableEmptyDescription,
} from "@pes/ui/components/niko-table/components/data-table-empty-state"
import { DataTableSearchFilter } from "@pes/ui/components/niko-table/components/data-table-search-filter"
import { DataTableViewMenu } from "@pes/ui/components/niko-table/components/data-table-view-menu"
import { DataTableFacetedFilter } from "@pes/ui/components/niko-table/components/data-table-faceted-filter"
import { DataTableClearFilter } from "@pes/ui/components/niko-table/components/data-table-clear-filter"
import { DataTableSliderFilter } from "@pes/ui/components/niko-table/components/data-table-slider-filter"
import { DataTableDateFilter } from "@pes/ui/components/niko-table/components/data-table-date-filter"
import { DataTablePagination } from "@pes/ui/components/niko-table/components/data-table-pagination"
import { daysAgo } from "@pes/ui/components/niko-table/lib/format"
import { FILTER_VARIANTS } from "@pes/ui/components/niko-table/lib/constants"
import type { DataTableColumnDef } from "@pes/ui/components/niko-table/types"
import { Badge } from "@pes/ui/components/badge"
import { UserSearch, SearchX } from "lucide-react"
import { useAppSelector } from "@/store/hooks"
import { triggerRulesSelectors } from "@/store/slices/triggerRulesSlice"
import type { TriggerRule } from "@/types"
import { triggerRuleLabelsSelectors } from "@/store/slices/triggerRuleLabelsSlice"

type Product = {
    id: string
    name: string
    category: string
    brand: string
    price: number
    stock: number
    rating: number
    inStock: boolean
    releaseDate: Date
}

const columns = (labelOptions: { label: string; value: string }[]): DataTableColumnDef<TriggerRule>[] => [
    {
        accessorKey: "id",
        header: () => (
            <DataTableColumnHeader>
                <DataTableColumnTitle />
                <DataTableColumnSortMenu />
            </DataTableColumnHeader>
        ),
        meta: {
            label: "Identifier",
        },
    },
    {
        accessorKey: "event_type",
        header: () => (
            <DataTableColumnHeader>
                <DataTableColumnTitle />
                <DataTableColumnSortMenu variant={FILTER_VARIANTS.TEXT} />
                <DataTableColumnFacetedFilterMenu limitToFilteredRows />
            </DataTableColumnHeader>
        ),
        meta: {
            label: "Event",
            autoOptions: true,
            dynamicCounts: true,
            showCounts: true,
        },
        enableColumnFilter: true,
    },
    {
        accessorKey: "name",
        header: () => (
            <DataTableColumnHeader>
                <DataTableColumnTitle />
                <DataTableColumnSortMenu variant={FILTER_VARIANTS.TEXT} />
            </DataTableColumnHeader>
        ),
        meta: {
            label: "Name",
            autoOptions: true,
            dynamicCounts: true,
            showCounts: true,
        },
    },
    {
        accessorKey: "labels",
        header: () => (
            <DataTableColumnHeader>
                <DataTableColumnTitle />
                <DataTableColumnSortMenu variant={FILTER_VARIANTS.TEXT} />
                {/*
                * Multi-select relies on the new `!multiple` default: `limitToFilteredRows`
                * resolves to `false` automatically, so the full option universe stays
                * visible as the user selects/deselects values. No explicit prop needed.
                */}
                <DataTableColumnFacetedFilterMenu multiple />
            </DataTableColumnHeader>
        ),
        meta: {
            label: "Labels",
            options: labelOptions,
            mergeStrategy: "augment",
            dynamicCounts: false,
            showCounts: true,
        },
        cell: ({ row }) => {
            const labels = row.getValue("labels") as {
                id: string;
                name: string;
                description: string;
            }[]

            return (
                <div style={{ display: "flex", gap: 4 }}>
                    {labels.map(label => {
                        const option = labelOptions.find(opt => opt.value === label.id)
                        return <span key={label.id}>{label.name}</span>
                    })}
                </div>
            )
        },
        enableColumnFilter: true,
    },
    {
        accessorKey: "enabled",
        header: () => (
            <DataTableColumnHeader>
                <DataTableColumnTitle />
                <DataTableColumnSortMenu variant={FILTER_VARIANTS.BOOLEAN} />
            </DataTableColumnHeader>
        ),
        meta: {
            label: "Status",
        },
        cell: ({ row }) => {
            const enabled = row.getValue("enabled") as boolean
            return (
                <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-medium border ${enabled ? "bg-green-700" : "bg-red-500"}`}>
                    {enabled ? "Enabled" : "Disabled"}
                </span>
            )
        },
    },
    // {
    //     accessorKey: "releaseDate",
    //     header: () => (
    //         <DataTableColumnHeader>
    //             <DataTableColumnTitle />
    //             <DataTableColumnSortMenu />
    //             <DataTableColumnDateFilterMenu />
    //         </DataTableColumnHeader>
    //     ),
    //     meta: {
    //         label: "Release Date",
    //         variant: "dateRange", // Auto-applies dateRangeFilter
    //     },
    //     cell: ({ row }) => {
    //         const date = row.getValue("created_at") as Date
    //         return <span>{date.toLocaleDateString()}</span>
    //     },
    //     enableColumnFilter: true,
    //     // filterFn auto-applied based on variant: "dateRange" -> dateRangeFilter
    // },
]

const data: Product[] = [
    {
        id: "1",
        name: "iPhone 15 Pro",
        category: "electronics",
        brand: "apple",
        price: 999,
        stock: 45,
        rating: 5,
        inStock: true,
        releaseDate: daysAgo(5),
    },
    {
        id: "2",
        name: "Galaxy S24 Ultra",
        category: "electronics",
        brand: "samsung",
        price: 1199,
        stock: 32,
        rating: 5,
        inStock: true,
        releaseDate: daysAgo(10),
    },
    {
        id: "3",
        name: "Air Jordan 1",
        category: "sports",
        brand: "nike",
        price: 170,
        stock: 8,
        rating: 4,
        inStock: true,
        releaseDate: daysAgo(25),
    },
]

function FilterToolbar({ labelOptions }: { labelOptions: { label: string; value: string; count: number; }[] }) {
    console.log(labelOptions)
    return (
        <DataTableToolbarSection className="w-full flex-col justify-between gap-2">
            <DataTableToolbarSection className="px-0">
                <DataTableSearchFilter placeholder="Search products..." />
                <DataTableViewMenu />
            </DataTableToolbarSection>
            <DataTableToolbarSection className="px-0">
                {/* Category: static list + live counts (augment) - show all options from entire dataset */}
                <DataTableFacetedFilter
                    accessorKey="labels"
                    options={labelOptions}
                    dynamicCounts={false}
                    multiple
                    limitToFilteredRows={false}
                />
                {/* Brand: fully generated options - show only options in filtered rows */}
                <DataTableFacetedFilter accessorKey="event_type" limitToFilteredRows />
                {/* Rating: auto-generated (numbers become categorical) - show only options in filtered rows */}
                {/* <DataTableFacetedFilter accessorKey="rating" limitToFilteredRows /> */}
                {/* In Stock: preserve static options (no counts) - show only options in filtered rows */}
                {/* <DataTableFacetedFilter accessorKey="inStock" limitToFilteredRows /> */}
                <DataTableFacetedFilter accessorKey="enabled" />
                {/* <DataTableDateFilter accessorKey="releaseDate" multiple /> */}
                <DataTableClearFilter />
            </DataTableToolbarSection>
        </DataTableToolbarSection>
    )
}

export default function TriggerRulesTable() {
    const triggerRules = useAppSelector(state => triggerRulesSelectors.selectAll(state));
    const triggerRuleLabels = useAppSelector(state => triggerRuleLabelsSelectors.selectAll(state));

    const labelOptions = triggerRuleLabels.map((label) => ({
        id: label.id,
        label: label.name,
        value: label.id,
        count: triggerRules.filter(rule =>
            rule.labels.some(l => l.id === label.id)
        ).length,
    }));

    return (
        <div className="px-5">
            <DataTableRoot data={triggerRules} columns={columns(labelOptions)}>
                <FilterToolbar labelOptions={labelOptions} />
                <DataTable>
                    <DataTableHeader />
                    <DataTableBody>
                        <DataTableEmptyBody>
                            <DataTableEmptyMessage>
                                <DataTableEmptyIcon>
                                    <UserSearch className="size-12" />
                                </DataTableEmptyIcon>
                                <DataTableEmptyTitle>No products found</DataTableEmptyTitle>
                                <DataTableEmptyDescription>
                                    Get started by adding your first product.
                                </DataTableEmptyDescription>
                            </DataTableEmptyMessage>
                            <DataTableEmptyFilteredMessage>
                                <DataTableEmptyIcon>
                                    <SearchX className="size-12" />
                                </DataTableEmptyIcon>
                                <DataTableEmptyTitle>No matches found</DataTableEmptyTitle>
                                <DataTableEmptyDescription>
                                    Try adjusting your filters or search to find what you&apos;re
                                    looking for.
                                </DataTableEmptyDescription>
                            </DataTableEmptyFilteredMessage>
                        </DataTableEmptyBody>
                    </DataTableBody>
                </DataTable>
                <DataTablePagination />
            </DataTableRoot>
        </div>
    )
}