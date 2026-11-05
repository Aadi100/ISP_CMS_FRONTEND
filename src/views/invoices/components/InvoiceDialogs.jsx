import { Lucide } from "@/base-components";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { friendlyError } from "@/lib/errors";
import { formatDate, formatDateTime, money } from "@/lib/format";
import {
  ErrorBanner,
  InvoicePaymentBadge,
  InvoiceStatusBadge,
  KV,
  Modal,
  OrgLetterhead,
  PaymentRecordBadge,
  addDaysISO,
  esc,
  methodLabel,
  orgHeaderHtml,
  printHtml,
  todayISO,
  useOrganization,
} from "@/views/payments/components/shared";
import { RefundTable, SubscriberPicker } from "@/views/payments/components/PaymentDialogs";

export const printInvoice = (org, inv) => {
  const line = (k, v) => `<div class="row"><span>${esc(k)}</span><span>${esc(v)}</span></div>`;
  const cell = (k, v) => `<div><div class="muted">${esc(k)}</div><div><b>${esc(v)}</b></div></div>`;
  return printHtml(
    `Invoice ${inv.invoice_number}`,
    `${orgHeaderHtml(org, "Invoice Number", inv.invoice_number)}
     <div class="grid">
       ${cell("Subscriber", `${inv.subscriber_name} (${inv.subscriber_code})`)}
       ${cell("Phone", inv.subscriber_phone || "—")}
       ${cell("Package", inv.package_name || "—")}
       ${cell("Billing period", `${formatDate(inv.billing_month)} - ${formatDate(inv.period_end)}`)}
       ${cell("Due date", formatDate(inv.due_date))}
       ${cell("Payment status", inv.payment_status)}
     </div>
     ${line("Charges", money(inv.charges))}
     ${line("Discount", `- ${money(inv.discount)}`)}
     ${line("Late fee", money(inv.late_fee))}
     <div class="row total"><span>Total amount</span><span>${esc(money(inv.amount))}</span></div>
     ${line("Paid", money(inv.amount_paid))}
     <div class="row total"><span>Balance due</span><span>${esc(money(inv.balance_due))}</span></div>
     ${inv.promised_date ? `<p class="muted">Remaining balance promised for ${esc(formatDate(inv.promised_date))}${inv.promise_note ? ` - ${esc(inv.promise_note)}` : ""}</p>` : ""}`
  );
};

// ---------------------------------------------------------------------
// Invoice detail
// ---------------------------------------------------------------------
export function InvoiceDetailModal({ invoiceId, canPay, canEdit, onClose, onRecordPayment, onChanged }) {
  const org = useOrganization();
  const [inv, setInv] = useState(null);
  const [payments, setPayments] = useState([]);
  const [refunds, setRefunds] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [promise, setPromise] = useState({ date: "", note: "" });
  const [saving, setSaving] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);

  async function load() {
    setLoading(true);
    const [i, p, r] = await Promise.all([
      supabase.from("v_invoice_summary").select("*").eq("id", invoiceId).maybeSingle(),
      supabase.from("v_payment_ledger").select("*").eq("invoice_id", invoiceId).order("paid_at", { ascending: false }),
      supabase.from("v_refund_ledger").select("*").eq("invoice_id", invoiceId).order("refunded_at", { ascending: false }),
    ]);
    const e = i.error || p.error || r.error;
    if (e) setError(friendlyError(e));
    setInv(i.data || null);
    setPayments(p.data || []);
    setRefunds(r.data || []);
    setPromise({ date: i.data?.promised_date || "", note: i.data?.promise_note || "" });
    setLoading(false);
  }
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [invoiceId]);

  async function savePromise(clear = false) {
    setSaving(true);
    setError("");
    const { error: e } = await supabase.rpc("set_payment_promise", {
      p_invoice_id: invoiceId,
      p_promised_date: clear ? null : promise.date || null,
      p_note: clear ? null : promise.note.trim() || null,
    });
    setSaving(false);
    if (e) return setError(friendlyError(e));
    onChanged(clear ? "Promise date cleared." : "Promise date saved.");
    load();
  }

  async function cancelInvoice() {
    setSaving(true);
    setError("");
    const { error: e } = await supabase.from("invoices").update({ invoice_status: "cancelled" }).eq("id", invoiceId);
    setSaving(false);
    if (e) return setError(friendlyError(e));
    setConfirmCancel(false);
    onChanged(`Invoice ${inv.invoice_number} cancelled.`);
    load();
  }

  const cancelled = inv?.invoice_status === "cancelled";
  const open = inv && !cancelled && Number(inv.balance_due) > 0;

  return (
    <Modal
      title="Invoice Details"
      wide
      onClose={onClose}
      footer={
        inv && (
          <>
            {canEdit && !cancelled && (
              <button type="button" className="btn btn-outline-danger mr-auto" onClick={() => setConfirmCancel(true)} disabled={saving}>
                Cancel Invoice
              </button>
            )}
            <button type="button" className="btn btn-outline-secondary" onClick={onClose}>
              Close
            </button>
            <button type="button" className="btn btn-outline-secondary" onClick={() => printInvoice(org, inv)}>
              <Lucide icon="Printer" className="w-4 h-4 mr-2" /> Print
            </button>
            {canPay && open && (
              <button type="button" className="btn btn-primary shadow-md" onClick={() => onRecordPayment(inv)}>
                <Lucide icon="DollarSign" className="w-4 h-4 mr-2" /> Record Payment
              </button>
            )}
          </>
        )
      }
    >
      <ErrorBanner message={error} onClose={() => setError("")} />
      {loading ? (
        <div className="text-center text-slate-500 py-10">Loading invoice...</div>
      ) : !inv ? (
        <div className="text-center text-slate-500 py-10">Invoice not found.</div>
      ) : (
        <>
          <OrgLetterhead org={org} title="Invoice Number" value={inv.invoice_number} />
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-y-3 mt-5 text-sm">
            <KV label="Subscriber">
              {inv.subscriber_name} <span className="text-slate-500 font-normal">{inv.subscriber_code}</span>
            </KV>
            <KV label="Phone">{inv.subscriber_phone || "—"}</KV>
            <KV label="Package">{inv.package_name || "—"}</KV>
            <KV label="Billing period">
              {formatDate(inv.billing_month)} - {formatDate(inv.period_end)}
            </KV>
            <KV label="Due date">{formatDate(inv.due_date)}</KV>
            <KV label="Type">{inv.invoice_type}</KV>
            <KV label="Payment status">
              <InvoicePaymentBadge status={inv.payment_status} />
            </KV>
            <KV label="Invoice status">
              <InvoiceStatusBadge status={inv.invoice_status} />
            </KV>
          </div>

          <div className="mt-6 border-t border-slate-200/60 dark:border-darkmode-400 pt-4 text-sm">
            {[
              ["Charges", money(inv.charges)],
              ["Discount", `- ${money(inv.discount)}`],
              ["Late fee", money(inv.late_fee)],
            ].map(([k, v]) => (
              <div key={k} className="flex justify-between py-1.5">
                <div className="text-slate-500">{k}</div>
                <div>{v}</div>
              </div>
            ))}
            <div className="flex justify-between py-2 mt-1 border-t border-slate-200/60 dark:border-darkmode-400 font-medium">
              <div>Total amount</div>
              <div>{money(inv.amount)}</div>
            </div>
            <div className="flex justify-between py-1.5">
              <div className="text-slate-500">Paid</div>
              <div className="text-success">{money(inv.amount_paid)}</div>
            </div>
            <div className="flex justify-between py-1.5 font-medium">
              <div>Balance due</div>
              <div className={Number(inv.balance_due) > 0 ? "text-danger" : "text-success"}>{money(inv.balance_due)}</div>
            </div>
          </div>

          {open && (
            <div className="mt-5 box p-4 bg-slate-50 dark:bg-darkmode-700">
              <div className="font-medium text-sm">Promise to pay the rest</div>
              <div className="text-xs text-slate-500 mb-3">
                While the date is in the future the invoice is not overdue and no late fee is added.
              </div>
              <div className="grid grid-cols-12 gap-3">
                <div className="col-span-12 sm:col-span-4">
                  <input
                    type="date"
                    className="form-control box w-full"
                    min={todayISO()}
                    value={promise.date}
                    disabled={!canEdit && !canPay}
                    onChange={(e) => setPromise({ ...promise, date: e.target.value })}
                  />
                </div>
                <div className="col-span-12 sm:col-span-5">
                  <input
                    type="text"
                    className="form-control box w-full"
                    placeholder="Note (optional)"
                    value={promise.note}
                    disabled={!canEdit && !canPay}
                    onChange={(e) => setPromise({ ...promise, note: e.target.value })}
                  />
                </div>
                <div className="col-span-12 sm:col-span-3 flex gap-2">
                  <button type="button" className="btn btn-primary" disabled={saving || !promise.date} onClick={() => savePromise(false)}>
                    Save
                  </button>
                  {inv.promised_date && (
                    <button type="button" className="btn btn-outline-secondary" disabled={saving} onClick={() => savePromise(true)}>
                      Clear
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}
          {!open && inv.promised_date && (
            <div className="text-xs text-slate-500 mt-3">Promised date was {formatDate(inv.promised_date)}.</div>
          )}

          <div className="mt-6">
            <div className="font-medium text-sm mb-1">Payments</div>
            {payments.length === 0 ? (
              <div className="text-sm text-slate-500">No payments recorded on this invoice.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="table table-sm w-full text-xs">
                  <thead>
                    <tr>
                      <th>Receipt</th>
                      <th>Date</th>
                      <th>Method</th>
                      <th className="text-right">Amount</th>
                      <th className="text-right">Refunded</th>
                      <th className="text-center">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {payments.map((p) => (
                      <tr key={p.id}>
                        <td className="whitespace-nowrap">{p.receipt_number}</td>
                        <td className="whitespace-nowrap">{formatDateTime(p.paid_at)}</td>
                        <td>
                          {methodLabel(p.method)}
                          {p.reference_no && <span className="text-slate-500"> ({p.reference_no})</span>}
                        </td>
                        <td className="text-right whitespace-nowrap">{money(p.amount)}</td>
                        <td className="text-right whitespace-nowrap">{Number(p.refunded_amount) > 0 ? money(p.refunded_amount) : "—"}</td>
                        <td className="text-center">
                          <PaymentRecordBadge status={p.status} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {refunds.length > 0 && (
            <div className="mt-5">
              <div className="font-medium text-sm mb-1">Refunds</div>
              <RefundTable rows={refunds} />
            </div>
          )}

          {confirmCancel && (
            <div className="mt-5 alert alert-warning flex items-center">
              <span className="flex-1 text-sm">
                Cancel invoice {inv.invoice_number}? It stays in the records but no longer counts as billed.
              </span>
              <button type="button" className="btn btn-danger ml-3" disabled={saving} onClick={cancelInvoice}>
                {saving ? "Cancelling..." : "Yes, cancel"}
              </button>
              <button type="button" className="btn btn-outline-secondary ml-2" onClick={() => setConfirmCancel(false)}>
                No
              </button>
            </div>
          )}
        </>
      )}
    </Modal>
  );
}

// ---------------------------------------------------------------------
// Create one-off invoice
// ---------------------------------------------------------------------
const ONE_OFF_TYPES = ["installation", "reconnection", "adjustment", "other"];

export function CreateInvoiceDialog({ onClose, onCreated }) {
  const [sub, setSub] = useState(null);
  const [dueDays, setDueDays] = useState(10);
  const [form, setForm] = useState({
    invoice_type: "installation",
    billing_month: todayISO(),
    charges: "",
    discount: "0",
    due_date: addDaysISO(todayISO(), 10),
    notes: "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    supabase
      .from("organization_settings")
      .select("payment_due_days, installation_charges, reconnect_charges")
      .maybeSingle()
      .then(({ data }) => {
        if (!data) return;
        setDueDays(data.payment_due_days);
        setForm((f) => ({
          ...f,
          due_date: addDaysISO(todayISO(), data.payment_due_days),
          charges: f.charges || (Number(data.installation_charges) > 0 ? String(data.installation_charges) : ""),
        }));
      });
  }, []);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const total = (Number(form.charges) || 0) - (Number(form.discount) || 0);

  async function submit() {
    setError("");
    if (!sub) return setError("Choose a subscriber.");
    if (!(Number(form.charges) > 0)) return setError("Enter the charges.");
    if (total < 0) return setError("The discount cannot be larger than the charges.");
    setSaving(true);
    const { data, error: e } = await supabase
      .from("invoices")
      .insert({
        subscriber_id: sub.id,
        invoice_type: form.invoice_type,
        billing_month: form.billing_month,
        period_end: form.billing_month,
        charges: Number(form.charges),
        discount: Number(form.discount) || 0,
        due_date: form.due_date,
        notes: form.notes.trim() || null,
      })
      .select("id, invoice_number")
      .single();
    setSaving(false);
    if (e) return setError(friendlyError(e));
    onCreated(`Invoice ${data.invoice_number} created for ${sub.full_name}.`);
  }

  return (
    <Modal
      title="Create Invoice"
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn btn-outline-secondary" onClick={onClose} disabled={saving}>
            Cancel
          </button>
          <button type="button" className="btn btn-primary shadow-md" onClick={submit} disabled={saving}>
            {saving ? "Saving..." : "Create Invoice"}
          </button>
        </>
      }
    >
      <ErrorBanner message={error} onClose={() => setError("")} />
      <div className="text-xs text-slate-500 mb-3">
        For one-off charges. Monthly invoices are created with "Generate Invoices" on the Billing page.
      </div>
      <div className="grid grid-cols-12 gap-4">
        <div className="col-span-12">
          <label className="text-xs text-slate-500">Subscriber</label>
          <SubscriberPicker value={sub} onChange={setSub} />
        </div>
        <div className="col-span-6">
          <label className="text-xs text-slate-500">Invoice type</label>
          <select className="form-select box mt-1 w-full" value={form.invoice_type} onChange={(e) => set("invoice_type", e.target.value)}>
            {ONE_OFF_TYPES.map((t) => (
              <option key={t} value={t}>
                {t[0].toUpperCase() + t.slice(1)}
              </option>
            ))}
          </select>
        </div>
        <div className="col-span-6">
          <label className="text-xs text-slate-500">Invoice date</label>
          <input type="date" className="form-control box mt-1 w-full" value={form.billing_month} onChange={(e) => set("billing_month", e.target.value)} />
        </div>
        <div className="col-span-6">
          <label className="text-xs text-slate-500">Charges (PKR)</label>
          <input type="number" min="0" step="0.01" className="form-control box mt-1 w-full" value={form.charges} onChange={(e) => set("charges", e.target.value)} />
        </div>
        <div className="col-span-6">
          <label className="text-xs text-slate-500">Discount (PKR)</label>
          <input type="number" min="0" step="0.01" className="form-control box mt-1 w-full" value={form.discount} onChange={(e) => set("discount", e.target.value)} />
        </div>
        <div className="col-span-6">
          <label className="text-xs text-slate-500">Due date</label>
          <input type="date" className="form-control box mt-1 w-full" value={form.due_date} onChange={(e) => set("due_date", e.target.value)} />
          <div className="text-xs text-slate-400 mt-1">Default: {dueDays} days from today</div>
        </div>
        <div className="col-span-6">
          <label className="text-xs text-slate-500">Total</label>
          <div className="form-control box mt-1 w-full bg-slate-100 dark:bg-darkmode-800">{money(total)}</div>
        </div>
        <div className="col-span-12">
          <label className="text-xs text-slate-500">Notes</label>
          <textarea className="form-control box mt-1 w-full" rows={2} value={form.notes} onChange={(e) => set("notes", e.target.value)}></textarea>
        </div>
      </div>
    </Modal>
  );
}
