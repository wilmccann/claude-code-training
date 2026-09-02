import { merchantById } from "@/data/merchants"
import type { Payment, PaymentFilters, PaymentStatus } from "@/data/types"
import { formatMoney } from "./money"

/**
 * CSV export for the payments table.
 *
 * Ops chooses which columns ship and whether the file covers the current
 * filter or every payment (NWP-101). Everything that arrives from the client
 * is checked here against an allowlist before it reaches a query or a
 * filename; the route handler calls these helpers and rejects early.
 */

export const EXPORT_COLUMNS = [
  "id",
  "created_at",
  "merchant",
  "description",
  "status",
  "method",
  "card_brand",
  "last4",
  "amount",
  "currency",
] as const

export type ExportColumn = (typeof EXPORT_COLUMNS)[number]

/**
 * What ships when the client asks for nothing in particular. The card last
 * four is opt-in, because most of these files go to a merchant.
 */
export const DEFAULT_EXPORT_COLUMNS: readonly ExportColumn[] =
  EXPORT_COLUMNS.filter((column) => column !== "last4")

export type ColumnSelection =
  | { ok: true; columns: ExportColumn[] }
  | { ok: false; message: string }

function isExportColumn(name: string): name is ExportColumn {
  return (EXPORT_COLUMNS as readonly string[]).includes(name)
}

/**
 * Validate a client-supplied `columns` query param.
 *
 * `null` means the param was absent and yields the default set. An empty
 * string means `?columns=` was sent, which is an empty selection and is
 * rejected: the dialog disables Download in that state, and the server does
 * not trust the dialog. Unknown names are rejected rather than dropped, and
 * the message never echoes the input.
 */
export function selectExportColumns(raw: string | null): ColumnSelection {
  if (raw === null) return { ok: true, columns: [...DEFAULT_EXPORT_COLUMNS] }

  const requested = Array.from(
    new Set(
      raw
        .split(",")
        .map((name) => name.trim())
        .filter(Boolean),
    ),
  )
  if (requested.length === 0) {
    return { ok: false, message: "Select at least one column to export." }
  }
  if (requested.some((name) => !isExportColumn(name))) {
    return {
      ok: false,
      message: "One or more requested columns are not exportable.",
    }
  }
  return { ok: true, columns: requested.filter(isExportColumn) }
}

export type ExportScope = "current" | "all"

/** Anything other than an exact `all` is the current filter. */
export function parseExportScope(raw: string | null): ExportScope {
  return raw === "all" ? "all" : "current"
}

export type ExportSegment = PaymentStatus | "filtered"

/**
 * The word between `payments-` and the date in the filename, or nothing when
 * the file is every payment. A status filter names itself; any other
 * narrowing (search, merchant) is `filtered`. Inputs are parseFilters output,
 * never raw client strings, so the result is safe in a header.
 */
export function exportScopeSegment(
  scope: ExportScope,
  filters: PaymentFilters,
): ExportSegment | undefined {
  if (scope === "all") return undefined
  if (filters.status && filters.status !== "all") return filters.status
  if (filters.search?.trim() || filters.merchantId) return "filtered"
  return undefined
}

function escapeCell(value: string): string {
  if (/[",\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`
  return value
}

function cell(payment: Payment, column: ExportColumn): string {
  switch (column) {
    case "id":
      return payment.id
    case "created_at":
      return payment.createdAt
    case "merchant":
      return merchantById(payment.merchantId)?.name ?? payment.merchantId
    case "description":
      return payment.description
    case "status":
      return payment.status
    case "method":
      return payment.method
    case "card_brand":
      return payment.cardBrand ?? ""
    case "last4":
      return payment.last4 ?? ""
    case "amount":
      return formatMoney(payment.amount, payment.currency)
    case "currency":
      return payment.currency
  }
}

export function toCsv(
  payments: Payment[],
  columns: readonly ExportColumn[] = EXPORT_COLUMNS,
): string {
  const header = columns.join(",")
  const rows = payments.map((payment) =>
    columns.map((column) => escapeCell(cell(payment, column))).join(","),
  )
  return [header, ...rows].join("\n")
}

export function exportFilename(
  date = new Date(),
  segment?: ExportSegment,
): string {
  const day = date.toISOString().slice(0, 10)
  return `payments-${segment ? `${segment}-` : ""}${day}.csv`
}
