import { Lucide } from "@/base-components";
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { friendlyError } from "@/lib/errors";
import { money, formatDate, formatDateTime } from "@/lib/format";
import { Badge, ErrorBanner, Pagination, Spinner, Empty, methodText, esc, printHtml, orgHeaderHtml } from "./ui.jsx";

function printReceipt(p, isp) {
  const row = (k, v) => `<div class="row"><span>${esc(k)}</span><span>${esc(v)}</span></div>`;
  const body = `${orgHeaderHtml(isp, "Payment receipt", p.receipt_number || "")}
    ${row("Customer", `${p.subscriber_name} (${p.subscriber_code})`)}
    ${row("Date", formatDateTime(p.paid_at))}
    ${row("Method", methodText(p.method))}
    ${p.invoice_number ? row("Invoice", p.invoice_number) : row("Type", "Advance payment")}
    ${p.reference_no ? row("Reference", p.reference_no) : ""}
    ${Number(p.refunded_amount) > 0 ? row("Refunded", money(p.refunded_amount)) : ""}
    <div class="row total"><span>Amount received</span><span>${esc(money(p.amount))}</span></div>
    <p class="muted" style="margin-top:24px">Thank you for your payment.</p>`;
  printHtml(`Receipt ${p.receipt_number || ""}`, body);
}

export default function Payments({ isp }) {
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(10);
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    const { data, count, error: e } = await supabase
      .from("v_payment_ledger")
      .select("*", { count: "exact" })
      .order("paid_at", { ascending: false })
      .range(page * pageSize, page * pageSize + pageSize - 1);
    if (e) setError(friendlyError(e));
    else {
      setError("");
      setRows(data || []);
      setTotal(count || 0);
    }
    setLoading(false);
  }, [page, pageSize]);
  useEffect(() => {
    load();
  }, [load]);

  return (
    <div>
      <ErrorBanner message={error} onClose={() => setError("")} />
      {loading ? (
        <Spinner />
      ) : rows.length === 0 ? (
        <Empty text="No payments yet." />
      ) : (
        <div className="space-y-2">
          {rows.map((p) => (
            <div key={p.id} className="box p-4">
              <div className="flex items-center justify-between">
                <div className="text-2xl font-semibold">{money(p.amount)}</div>
                <Badge value={p.status} />
              </div>
              <div className="text-sm text-slate-500 mt-1">
                {formatDate(p.paid_at)} - {methodText(p.method)}
              </div>
              <div className="text-xs text-slate-500 mt-1">
                Receipt {p.receipt_number || "-"} | {p.invoice_number ? `Invoice ${p.invoice_number}` : "Advance payment"}
              </div>
              {Number(p.refunded_amount) > 0 && <div className="text-xs text-warning mt-1">Refunded: {money(p.refunded_amount)}</div>}
              <button type="button" className="btn btn-outline-secondary btn-sm mt-3" onClick={() => printReceipt(p, isp)}>
                <Lucide icon="Printer" className="w-4 h-4 mr-2" /> Print receipt
              </button>
            </div>
          ))}
        </div>
      )}
      <Pagination page={page} pageSize={pageSize} total={total} onPage={setPage} onPageSize={(n) => { setPageSize(n); setPage(0); }} />
    </div>
  );
}
