"use client"

import { Button } from "@/components/Button"
import {
  Dialog,
  DialogBody,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/Dialog"
// Type-only: a value import would pull the seed data behind csv.ts into the
// client bundle.
import type { ExportColumn } from "@/lib/csv"
import { cx, focusRing } from "@/lib/utils"
import { Download } from "lucide-react"
import { useId, useState } from "react"

const COLUMN_LABELS: Record<ExportColumn, string> = {
  id: "Payment ID",
  created_at: "Created (UTC)",
  merchant: "Merchant",
  description: "Description",
  status: "Status",
  method: "Method",
  card_brand: "Card brand",
  last4: "Card last four",
  amount: "Amount",
  currency: "Currency",
}

type Scope = "current" | "all"

const controlClass = cx(
  "size-4 border-gray-300 accent-blue-500 dark:border-gray-700",
  focusRing,
)
const labelClass = "text-sm text-gray-700 dark:text-gray-300"
const legendClass = "text-sm font-medium text-gray-900 dark:text-gray-50"

/**
 * Export options for the payments table.
 *
 * The server owns the truth: both row counts and both column lists arrive as
 * props from the page, and the download is a plain link to the export route,
 * which validates everything again. This component only decides what to ask
 * for.
 */
export function ExportDialog({
  query,
  currentCount,
  allCount,
  columns,
  defaultColumns,
}: {
  /** The page's filter query string, without `page`. */
  query: string
  currentCount: number
  allCount: number
  columns: ExportColumn[]
  defaultColumns: ExportColumn[]
}) {
  const id = useId()
  const [selected, setSelected] = useState<ExportColumn[]>(defaultColumns)
  const [scope, setScope] = useState<Scope>("current")

  // Recompute from the canonical list so the CSV column order never depends
  // on the order boxes were ticked.
  const toggle = (column: ExportColumn, checked: boolean) =>
    setSelected((previous) =>
      columns.filter((c) => (c === column ? checked : previous.includes(c))),
    )

  const count = scope === "all" ? allCount : currentCount
  const nothingSelected = selected.length === 0

  const params = new URLSearchParams(scope === "all" ? "" : query)
  params.set("scope", scope)
  params.set("columns", selected.join(","))
  const href = `/api/payments/export?${params.toString()}`

  const scopes: { value: Scope; label: string; rows: number }[] = [
    { value: "current", label: "Current filter", rows: currentCount },
    { value: "all", label: "All payments", rows: allCount },
  ]

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="secondary" className="w-full gap-2 py-1.5 sm:w-fit">
          <Download
            className="-ml-0.5 size-4 shrink-0 text-gray-400 dark:text-gray-600"
            aria-hidden="true"
          />
          Export
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Export payments</DialogTitle>
          <DialogDescription>
            Choose the columns and rows to include. Amounts are written with
            their currency in a separate column.
          </DialogDescription>
        </DialogHeader>

        <DialogBody className="flex flex-col gap-6">
          <fieldset>
            <legend className={legendClass}>Columns</legend>
            <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
              {columns.map((column) => {
                const inputId = `${id}-column-${column}`
                return (
                  <div key={column} className="flex items-center gap-2">
                    <input
                      id={inputId}
                      type="checkbox"
                      checked={selected.includes(column)}
                      onChange={(event) => toggle(column, event.target.checked)}
                      className={cx("rounded", controlClass)}
                    />
                    <label htmlFor={inputId} className={labelClass}>
                      {COLUMN_LABELS[column]}
                    </label>
                  </div>
                )
              })}
            </div>
          </fieldset>

          <fieldset>
            <legend className={legendClass}>Rows</legend>
            <div className="mt-2 flex flex-col gap-2">
              {scopes.map((option) => {
                const inputId = `${id}-scope-${option.value}`
                return (
                  <div key={option.value} className="flex items-center gap-2">
                    <input
                      id={inputId}
                      type="radio"
                      name={`${id}-scope`}
                      value={option.value}
                      checked={scope === option.value}
                      onChange={() => setScope(option.value)}
                      className={controlClass}
                    />
                    <label htmlFor={inputId} className={labelClass}>
                      {option.label}{" "}
                      <span className="text-gray-500">
                        ({option.rows.toLocaleString()}{" "}
                        {option.rows === 1 ? "row" : "rows"})
                      </span>
                    </label>
                  </div>
                )
              })}
            </div>
          </fieldset>

          <p role="status" className="text-sm text-gray-500">
            {nothingSelected
              ? "Select at least one column to download."
              : `Download will contain ${count.toLocaleString()} ${
                  count === 1 ? "row" : "rows"
                } and ${selected.length} ${
                  selected.length === 1 ? "column" : "columns"
                }.`}
          </p>
        </DialogBody>

        <DialogFooter>
          <DialogClose asChild>
            <Button variant="secondary" className="py-1.5">
              Cancel
            </Button>
          </DialogClose>
          {nothingSelected ? (
            <Button className="py-1.5" disabled>
              Download
            </Button>
          ) : (
            <Button className="py-1.5" asChild>
              <a href={href}>Download</a>
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
