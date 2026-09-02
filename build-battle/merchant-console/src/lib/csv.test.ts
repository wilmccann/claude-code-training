import { describe, expect, it } from "vitest"
import { Payment } from "@/data/types"
import {
  DEFAULT_EXPORT_COLUMNS,
  EXPORT_COLUMNS,
  exportFilename,
  exportScopeSegment,
  parseExportScope,
  selectExportColumns,
  toCsv,
} from "./csv"

/**
 * The export is the file ops hands to a merchant, so a broken cell is a
 * support ticket rather than a stack trace. These tests pin the escaping and
 * the column contract; NWP-101 changes which columns ship, not how a cell is
 * written, and these should still pass afterwards.
 */

const payment: Payment = {
  id: "pay_0001",
  merchantId: "mch_01",
  amount: 25000,
  currency: "USD",
  status: "captured",
  method: "card",
  cardBrand: "visa",
  last4: "4242",
  createdAt: "2026-03-14T10:15:00.000Z",
  description: "Order 1180",
}

describe("toCsv", () => {
  it("writes a header row followed by one row per payment", () => {
    const lines = toCsv([payment]).split("\n")
    expect(lines).toHaveLength(2)
    expect(lines[0]).toBe(EXPORT_COLUMNS.join(","))
  })

  it("writes only the requested columns, in the order given", () => {
    expect(toCsv([payment], ["id", "amount"])).toBe(
      ["id,amount", "pay_0001,$250.00"].join("\n"),
    )
  })

  it("quotes cells containing a comma, so amounts do not split", () => {
    const large = { ...payment, amount: 123456789 }
    expect(toCsv([large], ["amount"])).toBe(['amount', '"$1,234,567.89"'].join("\n"))
  })

  it("doubles embedded quotes rather than dropping them", () => {
    const quoted = { ...payment, description: 'Order "rush"' }
    expect(toCsv([quoted], ["description"])).toBe(
      ["description", '"Order ""rush"""'].join("\n"),
    )
  })

  it("keeps a newline inside a description in one quoted cell", () => {
    const multiline = { ...payment, description: "Order 1180\nsecond line" }
    const body = toCsv([multiline], ["description"]).split("\n").slice(1).join("\n")
    expect(body).toBe('"Order 1180\nsecond line"')
  })

  it("resolves the merchant name, and falls back to the id when unknown", () => {
    expect(toCsv([payment], ["merchant"])).toContain("Lumen Coffee Roasters")
    const orphan = { ...payment, merchantId: "mch_missing" }
    expect(toCsv([orphan], ["merchant"])).toContain("mch_missing")
  })

  it("writes an empty cell for a payment with no card", () => {
    const bank: Payment = {
      ...payment,
      method: "bank_transfer",
      cardBrand: null,
      last4: null,
    }
    expect(toCsv([bank], ["card_brand", "last4"])).toBe(
      ["card_brand,last4", ","].join("\n"),
    )
  })

  it("emits a header even with no rows", () => {
    expect(toCsv([], ["id"])).toBe("id")
  })
})

describe("selectExportColumns", () => {
  it("keeps the requested subset, in the requested order", () => {
    const selection = selectExportColumns("amount,id")
    expect(selection).toEqual({ ok: true, columns: ["amount", "id"] })
    if (!selection.ok) return
    expect(toCsv([payment], selection.columns)).toBe(
      ["amount,id", "$250.00,pay_0001"].join("\n"),
    )
  })

  it("leaves the card last four out by default", () => {
    const selection = selectExportColumns(null)
    expect(selection.ok).toBe(true)
    if (!selection.ok) return
    expect(selection.columns).toEqual([...DEFAULT_EXPORT_COLUMNS])
    expect(selection.columns).not.toContain("last4")
    expect(toCsv([payment], selection.columns).split("\n")[0]).not.toContain(
      "last4",
    )
  })

  it("rejects an empty selection rather than writing an empty file", () => {
    // `?columns=` reaches the handler as "", not null.
    expect(selectExportColumns("")).toEqual({
      ok: false,
      message: "Select at least one column to export.",
    })
    expect(selectExportColumns(" , ")).toEqual({
      ok: false,
      message: "Select at least one column to export.",
    })
  })

  it("rejects a column that is not on the allowlist, without echoing it", () => {
    const selection = selectExportColumns("id,bogus")
    expect(selection.ok).toBe(false)
    if (selection.ok) return
    expect(selection.message).toBe(
      "One or more requested columns are not exportable.",
    )
    expect(selection.message).not.toContain("bogus")
  })

  it("trims whitespace and dedupes, keeping the first occurrence", () => {
    expect(selectExportColumns(" id , amount,id ")).toEqual({
      ok: true,
      columns: ["id", "amount"],
    })
  })
})

describe("export scope", () => {
  it("treats anything but an exact 'all' as the current filter", () => {
    expect(parseExportScope("all")).toBe("all")
    expect(parseExportScope("current")).toBe("current")
    expect(parseExportScope("bogus")).toBe("current")
    expect(parseExportScope(null)).toBe("current")
  })

  it("names the status filter, and lets scope win over it", () => {
    expect(
      exportScopeSegment("all", { status: "disputed", search: "coffee" }),
    ).toBeUndefined()
    expect(
      exportScopeSegment("current", { status: "disputed", search: "coffee" }),
    ).toBe("disputed")
  })

  it("falls back to 'filtered' for a search or merchant narrowing", () => {
    expect(exportScopeSegment("current", { status: "all", search: "coffee" })).toBe(
      "filtered",
    )
    expect(exportScopeSegment("current", { merchantId: "mch_01" })).toBe(
      "filtered",
    )
    // A blank search narrows nothing, and filterPayments ignores it too.
    expect(
      exportScopeSegment("current", { status: "all", search: "   " }),
    ).toBeUndefined()
    expect(exportScopeSegment("current", {})).toBeUndefined()
  })
})

describe("exportFilename", () => {
  it("stamps the UTC date, so two exports on the same day collide by design", () => {
    expect(exportFilename(new Date("2026-03-14T23:00:00.000Z"))).toBe(
      "payments-2026-03-14.csv",
    )
  })

  it("puts the scope segment between the prefix and the date", () => {
    expect(
      exportFilename(new Date("2026-08-13T00:00:00.000Z"), "disputed"),
    ).toBe("payments-disputed-2026-08-13.csv")
    expect(
      exportFilename(new Date("2026-08-13T00:00:00.000Z"), "filtered"),
    ).toBe("payments-filtered-2026-08-13.csv")
  })
})
