import { Lucide } from "@/base-components";
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { friendlyError } from "@/lib/errors";
import { money, formatDate } from "@/lib/format";
import { Badge, Modal, ErrorBanner, Pagination, Spinner, Empty, periodText, methodText, esc, printHtml, orgHeaderHtml } from "./ui.jsx";

const FILTERS = [
  ["", "All"],
  ["unpaid", "Unpaid"],
  ["partial", "Partly paid"],
  ["overdue", "Overdue"],
  ["paid", "Paid"],
];

function printInvoice(inv, payments, isp) {
  const items = Array.isArray(inv.line_items) ? inv.line_items : [];
  const rows = items.length
    ? items.map((l) => `<tr><td>${esc(l.label)}</td><td style="text-align:right">${esc(money(l.amount))}</td></tr>`).join("")
    : `<tr><td>Internet service</td><td style="text-align:right">${esc(money(inv.charges))}</td></tr>`;
  const pay = payments
    .map((p) => `<tr><td>${esc(formatDate(p.paid_at))}</td><td>${esc(p.receipt_number || "")}</td><td>${esc(methodText(p.method))}</td><td style="text-align:right">${esc(money(p.amount))}</td></tr>`)
    .join("");
  const body = `${orgHeaderHtml(isp, "Invoice", inv.invoice_number)}
    <div class="grid"><div><div class="muted">Customer</div><b>${esc(inv.subscriber_name)}</b> (${esc(inv.subscriber_code)})</div>
    <div><div class="muted">Period</div><b>${esc(periodText(inv, formatDate))}</b></div>
    <div><div class="muted">Due date</div><b>${esc(formatDate(inv.effective_due_date || inv.due_date))}</b></div>
    <div><div class="muted">Status</div><b>${esc(inv.payment_status)}</b></div></div>
    <table><thead><tr><th>Description</th><th style="text-align:right">Amount</th></tr></thead><tbody>${rows}</tbody></table>
    <div class="row total"><span>Total</span><span>${esc(money(inv.amount))}</span></div>
    <div class="row"><span>Paid</span><span>${esc(money(inv.amount_paid))}</span></div>
    <div class="row total"><span>Balance</span><span>${esc(money(inv.balance_due))}</span></div>
    ${pay ? `<h3>Payments</h3><table><thead><tr><th>Date</th><th>Receipt</th><th>Method</th><th style="text-align:right">Amount</th></tr></thead><tbody>${pay}</tbody></table>` : ""}`;
  printHtml(`Invoice ${inv.invoice_number}`, body);
}

function InvoiceModal({ inv, isp, onClose }) {
  const [payments, setPayments] = useState([]);
  const [error, setError] = useState("");
  useEffect(() => {
    let alive = true;
    supabase
      .from("v_payment_ledger")
      .select("*")
      .eq("invoice_id", inv.id)
      .order("paid_at", { ascending: false })
      .then(({ data, error: e }) => {
        if (!alive) return;
        if (e) setError(friendlyError(e));
        else setPayments(data || []);
      });
    return () => {
      alive = false;
    };
  }, [inv.id]);
  const items = Array.isArray(inv.line_items) ? inv.line_items : [];
  return (
    <Modal
      title={`Invoice ${inv.invoice_number}`}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn btn-outline-secondary" onClick={onClose}>
            Close
          </button>
          <button type="button" className="btn btn-primary" onClick={() => printInvoice(inv, payments, isp)}>
            <Lucide icon="Printer" className="w-4 h-4 mr-2" /> Print
          </button>
        </>
      }
    >
      <ErrorBanner message={error} />
      <div className="flex items-center justify-between">
        <div className="text-slate-500 text-sm">{periodText(inv, formatDate)}</div>
        <Badge value={inv.payment_status} />
      </div>
      <div className="mt-4 divide-y divide-slate-200/60 dark:divide-darkmode-400">
        {(items.length ? items : [{ label: "Internet service", amount: inv.charges }]).map((l, i) => {
          const neg = Number(l.amount) < 0 || /discount/i.test(l.label || "");
          return (
            <div key={i} className={`flex justify-between py-2 ${neg ? "text-success" : ""}`}>
              <span>{l.label}</span>
              <span>{money(l.amount)}</span>
            </div>
          );
        })}
        {Number(inv.late_fee) > 0 && !items.some((l) => /late/i.test(l.label || "")) && (
          <div className="flex justify-between py-2">
            <span>Late fee</span>
            <span>{money(inv.late_fee)}</span>
          </div>
        )}
        <div className="flex justify-between py-2 font-medium">
          <span>Total</span>
          <span>{money(inv.amount)}</span>
        </div>
        <div className="flex justify-between py-2">
          <span>Paid</span>
          <span>{money(inv.amount_paid)}</span>
        </div>
        <div className="flex justify-between py-2 text-lg font-semibold">
          <span>Balance</span>
          <span>{money(inv.balance_due)}</span>
        </div>
      </div>
      <div className="text-sm text-slate-500 mt-2">Due date: {formatDate(inv.effective_due_date || inv.due_date)}</div>
      <div className="font-medium mt-5 mb-2">Payments made</div>
      {payments.length === 0 ? (
        <div className="text-sm text-slate-500">No payments yet.</div>
      ) : (
        payments.map((p) => (
          <div key={p.id} className="flex justify-between text-sm py-1.5 border-b border-slate-200/60 dark:border-darkmode-400">
            <span>
              {formatDate(p.paid_at)} - {methodText(p.method)} {p.receipt_number ? `(${p.receipt_number})` : ""}
            </span>
            <span className="font-medium">{money(p.amount)}</span>
          </div>
        ))
      )}
    </Modal>
  );
}

export default function Bills({ isp }) {
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(10);
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [sel, setSel] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    let q = supabase
      .from("v_invoice_summary")
      .select("*", { count: "exact" })
      .neq("invoice_status", "cancelled")
      .order("billing_month", { ascending: false });
    if (status) q = q.eq("payment_status", status);
    const { data, count, error: e } = await q.range(page * pageSize, page * pageSize + pageSize - 1);
    if (e) setError(friendlyError(e));
    else {
      setError("");
      setRows(data || []);
      setTotal(count || 0);
    }
    setLoading(false);
  }, [status, page, pageSize]);
  useEffect(() => {
    load();
  }, [load]);

  return (
    <div>
      <div className="flex flex-wrap gap-2 mb-3">
        {FILTERS.map(([v, l]) => (
          <button
            key={v}
            type="button"
            className={`btn ${status === v ? "btn-primary" : "btn-outline-secondary bg-white dark:bg-darkmode-600"}`}
            onClick={() => {
              setStatus(v);
              setPage(0);
            }}
          >
            {l}
          </button>
        ))}
      </div>
      <ErrorBanner message={error} onClose={() => setError("")} />
      {loading ? (
        <Spinner />
      ) : rows.length === 0 ? (
        <Empty text="No bills found." />
      ) : (
        <div className="space-y-2">
          {rows.map((r) => (
            <button key={r.id} type="button" onClick={() => setSel(r)} className="box p-4 w-full text-left hover:bg-slate-50 dark:hover:bg-darkmode-700">
              <div className="flex items-center justify-between">
                <div className="font-medium">{r.invoice_number}</div>
                <Badge value={r.payment_status} />
              </div>
              <div className="text-xs text-slate-500 mt-0.5">{periodText(r, formatDate)}</div>
              <div className="grid grid-cols-3 gap-2 mt-3 text-sm">
                <div>
                  <div className="text-xs text-slate-500">Amount</div>
                  {money(r.amount)}
                </div>
                <div>
                  <div className="text-xs text-slate-500">Paid</div>
                  {money(r.amount_paid)}
                </div>
                <div>
                  <div className="text-xs text-slate-500">Balance</div>
                  <span className="font-semibold">{money(r.balance_due)}</span>
                </div>
              </div>
              <div className="text-xs text-slate-500 mt-2">
                Due {formatDate(r.effective_due_date || r.due_date)}
                {r.promised_date ? " (promised date)" : ""}
              </div>
            </button>
          ))}
        </div>
      )}
      <Pagination page={page} pageSize={pageSize} total={total} onPage={setPage} onPageSize={(n) => { setPageSize(n); setPage(0); }} />
      {sel && <InvoiceModal inv={sel} isp={isp} onClose={() => setSel(null)} />}
    </div>
  );
}
