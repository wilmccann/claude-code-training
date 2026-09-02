# NWP-101: Payments export options

All paths relative to `build-battle/merchant-console/` unless noted. Branch: `NWP-101-export-options`. Commit prefix: `NWP-101:`.

## Context

Ops exports the payments table several times a day, but the export is fixed: every column, current filter only. The card last-four is in every file, so anything going to a merchant is hand-cleaned first (3–4 hours a month, and one near-miss where an unedited file almost went to the wrong merchant). The ticket adds an options dialog to the Export button on `/payments`: choose columns (last-four off by default), choose scope (current filter vs all payments, with a visible row count), and get a filename that says what is in it.

## What the export code does today

- `src/app/payments/page.tsx:68-76` renders `<Button asChild><a href="/api/payments/export?{query}">Export</a>` where `query` is the page's truthy search params (including `page`).
- `src/app/api/payments/export/route.ts` calls `parseFilters(searchParams)` then `sortPayments(filterPayments(filters), sort, direction)`. It deliberately skips `paginate`/`queryPayments` so the CSV covers every matching row, not one page. Column set and scope are fixed; the doc comment names this as NWP-101.
- `src/lib/csv.ts`: `EXPORT_COLUMNS` (10 names, `last4` included), `toCsv(payments, columns = EXPORT_COLUMNS)` already honours a column subset in the order given, `cell()` formats amount via `formatMoney` and writes currency as its own column (AC4 already holds), `exportFilename(date)` → `payments-YYYY-MM-DD.csv`.
- `src/lib/csv.test.ts`: 9 tests pinning escaping, column selection, and the filename. Its comment says NWP-101 "changes which columns ship, not how a cell is written" — so `toCsv`'s default and `cell` must not change.
- No `Dialog.tsx`, `Checkbox.tsx`, or `Label.tsx` exists. `Drawer.tsx` wraps `@radix-ui/react-dialog` as a right-side drawer with hardcoded positioning. No checkbox anywhere in `src/`. No Radix checkbox/radio/label packages installed; no new deps needed.

## Decisions

- **Validation lives in `csv.ts`** as pure functions (testable in node, no DOM). The route calls them and rejects early.
- **Scope is a server-validated `scope` param.** `all` → `filterPayments({})`; anything else → current filter via `parseFilters`. Still the one builder, never paginated.
- **Filename segment** (user confirmed, three rounds): evaluated in this order.
  1. scope=all → no segment: `payments-2026-08-13.csv` (today's output, unchanged).
  2. status is one of the five real values in `STATUSES` from `src/data/queries.ts` (`authorized`, `captured`, `refunded`, `failed`, `disputed`) → that status: `payments-disputed-2026-08-13.csv`. Status wins even if a search is also set.
  3. no status, but the export is narrowed by a non-blank search term **or a merchant selection** → `filtered`: `payments-filtered-2026-08-13.csv`. The user named the search box; the merchant dropdown is included because it causes the identical collision and the original recommendation covered both. Drop `merchantId` from this rule if that is not wanted.
  4. otherwise → no segment.
  Every input is a `parseFilters` output (allowlisted status, or a boolean "is a filter present"), and the emitted string is one of six literals, so it is safe in `Content-Disposition`.
- **Error shape**: `400` + `{ message: "<user-safe>" }` per `.claude/rules/api-routes.md`. First 4xx in this app; sets the convention.
- **Download is a plain anchor**, so native download + `Content-Disposition` do the work. Zero columns → a real `<button disabled>`, not a disabled anchor (same pattern as pagination Previous/Next).
- **New `src/components/Dialog.tsx`** as a centred modal built on the already-installed Radix Dialog, mirroring `Drawer.tsx` conventions. Native `<input type="checkbox">` and `<input type="radio">` with `<label htmlFor>` and `<fieldset>/<legend>`.
- **Out of scope, do not touch**: seed data, `sortPayments` (lexical amount sort is pre-existing), `page.tsx`'s hand-built filter parsing.

## Build order (user-specified: route + validation, then dialog, then tests)

### Step 1 — `src/lib/csv.ts` (selection, scope, filename)

Keep `EXPORT_COLUMNS`, `ExportColumn`, `escapeCell`, `cell`, `toCsv` unchanged. Add:

- `DEFAULT_EXPORT_COLUMNS: readonly ExportColumn[]` = `EXPORT_COLUMNS` minus `"last4"`.
- `type ColumnSelection = { ok: true; columns: ExportColumn[] } | { ok: false; message: string }`
- `selectExportColumns(raw: string | null): ColumnSelection`
  - `null` (param absent) → ok with `[...DEFAULT_EXPORT_COLUMNS]`
  - else split on `,`, trim, drop empties, dedupe preserving first occurrence
  - empty → `{ ok: false, message: "Select at least one column to export." }`
  - any name not in `EXPORT_COLUMNS` → `{ ok: false, message: "One or more requested columns are not exportable." }` (do not echo input)
  - else ok, in requested order
  - Note: `URLSearchParams.get` returns `""` for `?columns=` and `null` when absent. These must diverge (400 vs default).
- `type ExportScope = "current" | "all"`; `parseExportScope(raw: string | null): ExportScope` → `"all"` only on exact match, else `"current"`.
- `type ExportSegment = PaymentStatus | "filtered"`
- `exportScopeSegment(scope: ExportScope, filters: PaymentFilters): ExportSegment | undefined`, in order: `scope === "all"` → `undefined`; `filters.status && filters.status !== "all"` → `filters.status`; `filters.search?.trim() || filters.merchantId` → `"filtered"`; else `undefined`. The `.trim()` matches `filterPayments`, which ignores a whitespace-only search. `import type { PaymentFilters, PaymentStatus } from "@/data/types"`.
- Extend `exportFilename(date = new Date())` → `exportFilename(date = new Date(), segment?: ExportSegment)` → `payments-${segment ? `${segment}-` : ""}${YYYY-MM-DD}.csv`. Date stays first so the existing call `exportFilename(new Date(...))` and its test are untouched; the no-segment output is byte-identical to today's.
- Update the file's doc comment (it says the column set is fixed).

### Step 2 — `src/app/api/payments/export/route.ts`

Add `NextResponse` import. Body of `GET`, in this order:

1. `params = request.nextUrl.searchParams`
2. `selection = selectExportColumns(params.get("columns"))`; if `!ok` → `NextResponse.json({ message }, { status: 400 })`. Only rejection path.
3. `scope = parseExportScope(params.get("scope"))`
4. `requested = parseFilters(params)` (always; supplies sort/direction/status)
5. `scoped = scope === "all" ? {} : requested`
6. `rows = sortPayments(filterPayments(scoped), requested.sort, requested.direction)` — never `paginate`
7. `filename = exportFilename(new Date(), exportScopeSegment(scope, requested))`
8. `new Response(toCsv(rows, selection.columns), { headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": \`attachment; filename="${filename}"\` } })`

Update the doc comment.

### Step 3 — `src/components/Dialog.tsx` (new)

Model on `src/components/Drawer.tsx`: forwardRef wrappers over `@radix-ui/react-dialog`, `cx`, `focusRing`, same border/bg/dark tokens, `RiCloseLine` close button in the header. Differences:

- Overlay: `fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/30 data-[state=closed]:animate-hide`. Do **not** copy Drawer's inline `style` (rule: Tailwind only) or its `animate-dialogOverlayShow` (keyframe not defined in `tailwind.config.ts`).
- Content: `relative z-50 flex w-[95vw] max-w-lg flex-col rounded-md border p-4 shadow-lg focus:outline-none sm:p-6` + `data-[state=open]:animate-slideDownAndFade data-[state=closed]:animate-hide` (both keyframes exist). Rendered inside Portal > Overlay as Drawer does.
- Export: `Dialog, DialogTrigger, DialogClose, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogBody, DialogFooter`.
- Radix supplies focus trap, focus return, Escape, and `aria-labelledby` from `DialogTitle`.

### Step 4 — `src/app/payments/export-dialog.tsx` (new, `"use client"`) and `page.tsx` wiring

Props: `{ query: string; currentCount: number; allCount: number; columns: ExportColumn[]; defaultColumns: ExportColumn[] }`. Use `import type { ExportColumn } from "@/lib/csv"` only — a value import would pull `@/data/merchants` (seed data) into the client bundle.

State: `selected: ExportColumn[]` (init `defaultColumns`), `scope: "current" | "all"` (init `"current"`). Toggle recomputes `columns.filter(...)` so CSV order follows canonical order regardless of click order.

Href: `p = new URLSearchParams(scope === "all" ? "" : query); p.set("scope", scope); p.set("columns", selected.join(","))` → `/api/payments/export?${p}`. Commas encode as `%2C`; the server decodes.

Tree:
- `Dialog > DialogTrigger asChild > Button variant="secondary"` with `Download` icon + "Export" (moved from page.tsx unchanged).
- `DialogContent > DialogHeader > DialogTitle` "Export payments" (visible; the accessible name) + `DialogDescription`.
- `DialogBody`: `<fieldset><legend>Columns</legend>` one checkbox + `<label htmlFor>` per column (`useId()` prefix; labels from a local `Record<ExportColumn, string>` so it is exhaustive). `<fieldset><legend>Rows</legend>` two radios: "Current filter (N rows)" / "All payments (N rows)" so both counts are visible (AC2). Summary line: "Download will contain N rows and M columns." When `selected.length === 0`: `<p role="status">` "Select at least one column to download."
- `DialogFooter`: `DialogClose asChild > Button variant="secondary"` "Cancel"; then `selected.length === 0 ? <Button disabled>Download</Button> : <Button asChild><a href={href}>Download</a></Button>` (AC5).

`page.tsx`: import `ExportDialog`, `filterPayments`, `DEFAULT_EXPORT_COLUMNS`, `EXPORT_COLUMNS`; drop the `Download` import. After `query`: `exportQuery = new URLSearchParams(query); exportQuery.delete("page")`. Replace the Export anchor block with `<ExportDialog query={exportQuery.toString()} currentCount={total} allCount={filterPayments({}).length} columns={[...EXPORT_COLUMNS]} defaultColumns={[...DEFAULT_EXPORT_COLUMNS]} />`. `filterPayments({})` is used (not `store.payments.length`) so the count is computed by the same call the route makes for scope=all. Nothing else in `page.tsx` changes.

### Step 5 — Tests in `src/lib/csv.test.ts` (extend, do not create a new file)

Run `npm test` first (expect 28 passing; nothing in Steps 1–4 changes an existing contract). Then:

- Leave the existing `exportFilename` test exactly as it is; it now doubles as the "no status → no segment" case.
- `describe("selectExportColumns")`:
  - **(a) subset in requested order** — `"amount,id"` → ok, `["amount","id"]`; and `toCsv([payment], columns)` → `"amount,id\n$250.00,pay_0001"`.
  - **(b) last four excluded by default** — `null` → ok, equals `DEFAULT_EXPORT_COLUMNS`, does not contain `"last4"`; header row from `toCsv` does not contain `last4`.
  - **(c) empty selection rejected** — `""` and `" , "` → `ok: false`.
  - unknown column rejected — `"id,bogus"` → `ok: false`.
  - trims and dedupes — `" id , amount,id "` → `["id","amount"]`.
- `describe("exportFilename")`: add `exportFilename(new Date("2026-08-13T00:00:00.000Z"), "disputed")` → `"payments-disputed-2026-08-13.csv"` (the ticket's own example) and `(…, "filtered")` → `"payments-filtered-2026-08-13.csv"`.
- `describe("export scope")`, three tests:
  - `parseExportScope`: `"all"` → `"all"`; `null`/`"bogus"`/`"current"` → `"current"`.
  - segment precedence: `exportScopeSegment("all", { status: "disputed", search: "coffee" })` → `undefined` (scope wins); `("current", { status: "disputed", search: "coffee" })` → `"disputed"` (status beats search).
  - segment for non-status filters: `("current", { status: "all", search: "coffee" })` → `"filtered"`; `("current", { merchantId: "mch_01" })` → `"filtered"`; `("current", { status: "all", search: "   " })` → `undefined` (blank search is not a filter); `("current", {})` → `undefined`.

Run `npm test` again and show the summary. Expected: 28 → 37 passing, 3 files (5 selection + 1 filename + 3 scope).

## Verification

Automated: `npm test` from `build-battle/merchant-console/`, 37 passing.

Route, with `npm run dev` on :3000:

```
curl -i "localhost:3000/api/payments/export?columns=bogus"          → 400 {"message":"One or more requested columns are not exportable."}
curl -i "localhost:3000/api/payments/export?columns="               → 400 {"message":"Select at least one column to export."}
curl -i "localhost:3000/api/payments/export?columns=id,amount&scope=all"  → 200, filename="payments-<today>.csv", header id,amount
curl -i "localhost:3000/api/payments/export?status=disputed"        → 200, filename="payments-disputed-<today>.csv", 9 columns, no last4
curl -i "localhost:3000/api/payments/export?search=coffee"          → 200, filename="payments-filtered-<today>.csv"
curl -i "localhost:3000/api/payments/export?merchantId=mch_01"      → 200, filename="payments-filtered-<today>.csv"
curl -i "localhost:3000/api/payments/export?status=disputed&search=coffee" → 200, filename="payments-disputed-<today>.csv" (status wins)
curl -i "localhost:3000/api/payments/export?status=disputed&scope=all" → 200, filename="payments-<today>.csv" (scope wins), full row count
curl -si "localhost:3000/api/payments/export" | tail -n +N | wc -l  → row count equals full total, not 20
```

Browser (`/payments`, then `/payments?status=disputed`): Export opens a centred dialog titled "Export payments"; last four unchecked; "Current filter" selected with a count matching the footer's "N payments"; switching to "All payments" changes the count; unchecking every column disables Download and shows the status line; Escape closes and focus returns to Export; Download produces `payments-disputed-<today>.csv` on the status-filtered page, `payments-filtered-<today>.csv` after typing a search term, and `payments-<today>.csv` with nothing set or with "All payments" chosen.

## Gotchas

- `?columns=` vs absent: `""` must 400, `null` must default.
- `from`/`to` date params are accepted by `parseFilters` but not set by any UI, so they are deliberately not part of the `filtered` rule. If a hand-typed URL carries them, the file is named as if unfiltered. Note in the PR.
- Client component must `import type` from `@/lib/csv` only.
- Don't put `disabled` on an `<a>`.
- Pre-existing and out of scope: `page.tsx` ignores `from`/`to` but forwards them in `query`; `sortPayments` compares amounts as strings; Drawer's undefined overlay keyframe.

## After the build

Per the repo's documented flow: `/ship-ready`, then `/pr`, then commit with `NWP-101:` prefix and push to `origin` (the wilmccann fork). Note: `CLAUDE.md` at the repo root has uncommitted doc edits from earlier in this session that should be kept off this branch's commits.
