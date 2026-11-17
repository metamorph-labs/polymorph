/**
 * The incidents a team's services raised, narrowed by search and filters, with a delete that asks first.
 *
 * Emitted from a screen spec (`polymorph-screen/1`). Composition and bindings only:
 * this file holds no state, computes nothing, and expresses no style — the
 * container that renders it owns all three.
 */

import {
  Button,
  ConfirmDialog,
  DataTable,
  FilterBar,
  ListPage,
  SearchInput,
  Select,
  type DataTableColumn,
  type DataTableSort,
} from '@polymorph/react-ui'
import type { Incident } from './incidents'

export interface IncidentsViewProps {
  /** Already filtered and sorted. */
  incidents: Incident[]
  /** Cell renderers are code, so they arrive as an input; the last column holds each row's delete action. */
  columns: DataTableColumn<Incident>[]
  getRowId: (incident: Incident) => string
  sort: DataTableSort
  onSortChange: (sort: DataTableSort) => void
  /** No incidents at all, before any filter. */
  isEmpty: boolean
  isFiltered: boolean
  onClearFilters: () => void
  resultCount: { shown: number; total: number }
  query: string
  onQueryChange: (query: string) => void
  severity: string | null
  severityOptions: { value: string; label: string }[]
  onSeverityChange: (value: string | null) => void
  state: string | null
  stateOptions: { value: string; label: string }[]
  onStateChange: (value: string | null) => void
  /** Whether the delete confirmation is open. */
  deleting: boolean
  /** Names the incident being deleted and says that it cannot be undone. */
  deletingDescription: string
  onDeletingChange: (open: boolean) => void
  onConfirmDelete: () => void
}

export function IncidentsView({
  incidents,
  columns,
  getRowId,
  sort,
  onSortChange,
  isEmpty,
  isFiltered,
  onClearFilters,
  resultCount,
  query,
  onQueryChange,
  severity,
  severityOptions,
  onSeverityChange,
  state,
  stateOptions,
  onStateChange,
  deleting,
  deletingDescription,
  onDeletingChange,
  onConfirmDelete,
}: IncidentsViewProps) {
  return (
    <ListPage
      title="Incidents"
      description="Everything your services raised, newest first."
      empty={isEmpty}
      emptyState={{
        icon: 'inbox',
        title: 'No incidents',
        description: 'When one of your services raises an incident, it appears here.',
      }}
      filters={
        <FilterBar
          isFiltered={isFiltered}
          onClear={onClearFilters}
          resultCount={resultCount}
          search={
            <SearchInput
              placeholder="Search incidents…"
              aria-label="Search incidents"
              value={query}
              onChange={onQueryChange}
            />
          }
        >
          <Select
            options={severityOptions}
            emptyOption="Any severity"
            aria-label="Filter by severity"
            value={severity}
            onChange={onSeverityChange}
          />
          <Select
            options={stateOptions}
            emptyOption="Open or resolved"
            aria-label="Filter by open or resolved"
            value={state}
            onChange={onStateChange}
          />
        </FilterBar>
      }
    >
      <DataTable
        label="Incidents"
        columns={columns}
        data={incidents}
        getRowId={getRowId}
        sort={sort}
        onSortChange={onSortChange}
        emptyState={{
          icon: 'search',
          title: 'No incidents match these filters',
          description: 'Every incident is still here; the filters are hiding them.',
          secondaryAction: (
            <Button variant="ghost" tone="neutral" label="Clear filters" onClick={onClearFilters} />
          ),
        }}
      />
      <ConfirmDialog
        open={deleting}
        onOpenChange={onDeletingChange}
        tone="danger"
        title="Delete this incident?"
        description={deletingDescription}
        confirmLabel="Delete incident"
        onConfirm={onConfirmDelete}
      />
    </ListPage>
  )
}
