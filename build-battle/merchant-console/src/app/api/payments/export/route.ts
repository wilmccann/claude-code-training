import { filterPayments, parseFilters, sortPayments } from "@/data/queries"
import {
  exportFilename,
  exportScopeSegment,
  parseExportScope,
  selectExportColumns,
  toCsv,
} from "@/lib/csv"
import { NextRequest, NextResponse } from "next/server"

/**
 * Exports the payments table as CSV.
 *
 * Ops chooses the columns (`columns=a,b,c`, card last four off by default)
 * and the scope (`scope=current|all`). Both are validated before they touch
 * a query or the filename. Filtering goes through the shared builder and the
 * result is never paginated: the file covers every matching row, not the
 * page the table happens to be showing.
 */
export function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams

  const selection = selectExportColumns(params.get("columns"))
  if (!selection.ok) {
    return NextResponse.json({ message: selection.message }, { status: 400 })
  }

  const scope = parseExportScope(params.get("scope"))
  const requested = parseFilters(params)
  const scoped = scope === "all" ? {} : requested
  const rows = sortPayments(
    filterPayments(scoped),
    requested.sort,
    requested.direction,
  )

  const filename = exportFilename(
    new Date(),
    exportScopeSegment(scope, requested),
  )

  return new Response(toCsv(rows, selection.columns), {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${filename}"`,
    },
  })
}
