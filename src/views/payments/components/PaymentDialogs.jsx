import { Lucide } from "@/base-components";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { friendlyError } from "@/lib/errors";
import { formatDate, formatDateTime, money } from "@/lib/format";
import {
  ErrorBanner,
  InvoicePaymentBadge,
  KV,
  Modal,
  OrgLetterhead,
  PaymentRecordBadge,
  esc,
  likeSafe,
  methodLabel,
  orgHeaderHtml,
  printHtml,
  todayISO,
  useOrganization,
} from "./shared";

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

// ---------------------------------------------------------------------
// Subscriber search box
// ---------------------------------------------------------------------
export function SubscriberPicker({ value, onChange, disabled }) {
  const [term, setTerm] = useState("");
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    if (value) return undefined;
    let alive = true;
    const t = setTimeout(async () => {
      setSearching(true);
      let q = supabase
        .from("v_subscriber_overview")
        .select("id, subscriber_code, full_name, phone, outstanding_balance, credit_balance")
        .order("full_name")
        .limit(8);
      const s = likeSafe(term);
      if (s) q = q.or(`full_name.ilike.%${s}%,phone.ilike.%${s}%,subscriber_code.ilike.%${s}%`);
      const { data } = await q;
      if (alive) {
        setResults(data || []);
        setSearching(false);
      }
    }, 250);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [term, value]);

  if (value) {
    return (
      <div className="flex items-center box p-3 mt-1">
        <div className="min-w-0">
          <div className="font-medium truncate">
            {value.full_name} <span className="text-slate-500 font-normal">{value.subscriber_code}</span>
          </div>
          <div className="text-xs text-slate-500">{value.phone}</div>
        </div>
        {!disabled && (
          <button type="button" className="ml-auto text-xs text-primary" onClick={() => onChange(null)}>
            Change
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="mt-1">
      <input
        type="text"
        className="form-control box w-full"
        placeholder="Search by name, phone or subscriber ID"
        value={term}
        onChange={(e) => setTerm(e.target.value)}
        autoFocus
      />
      <div className="box mt-1 max-h-48 overflow-y-auto divide-y divide-slate-200/60 dark:divide-darkmode-400">
        {searching && <div className="p-3 text-xs text-slate-500">Searching...</div>}
        {!searching && results.length === 0 && <div className="p-3 text-xs text-slate-500">No subscribers found.</div>}
        {results.map((s) => (
          <button
            type="button"
            key={s.id}
            className="w-full text-left p-3 hover:bg-slate-100 dark:hover:bg-darkmode-400"
            onClick={() => onChange(s)}
          >
            <div className="text-sm font-medium">
              {s.full_name} <span className="text-slate-500 font-normal">{s.subscriber_code}</span>
            </div>
            <div className="text-xs text-slate-500">
              {s.phone} | Due {money(s.outstanding_balance)}
              {Number(s.credit_balance) > 0 && ` | Credit ${money(s.credit_balance)}`}
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

function useCredit(subscriberId, bump) {
  const [credit, setCredit] = useState(null);
  useEffect(() => {
    if (!subscriberId) {
      setCredit(null);
      return;
    }
    let alive = true;
    supabase
      .from("v_subscriber_credit")
      .select("credit_balance")
      .eq("subscriber_id", subscriberId)
      .maybeSingle()
      .then(({ data }) => alive && setCredit(Number(data?.credit_balance ?? 0)));
    return () => {
      alive = false;
    };
  }, [subscriberId, bump]);
  return credit;
}

function MethodSelect({ value, onChange, methods }) {
  return (
    <select className="form-select box mt-1 w-full" value={value} onChange={(e) => onChange(e.target.value)}>
      {methods.map((m) => (
        <option key={m} value={m}>
          {methodLabel(m)}
        </option>
      ))}
    </select>
  );
}

// ---------------------------------------------------------------------
// 1 + 2. Receive payment (single or split)
// ---------------------------------------------------------------------
export function ReceivePaymentDialog({ methods, confirmationRequired, invoice, onClose, onDone, initialSplit = false }) {
  const [sub, setSub] = useState(
    invoice
      ? {
          id: invoice.subscriber_id,
          full_name: invoice.subscriber_name,
          subscriber_code: invoice.subscriber_code,
          phone: invoice.subscriber_phone,
        }
      : null
  );
  const [invoices, setInvoices] = useState([]);
  const [loadingInv, setLoadingInv] = useState(false);
  const [invoiceId, setInvoiceId] = useState(invoice?.id || "");
  const [split, setSplit] = useState(initialSplit);
  const [amount, setAmount] = useState(invoice ? String(invoice.balance_due) : "");
  const [method, setMethod] = useState(methods[0] || "cash");
  const [reference, setReference] = useState("");
  const [parts, setParts] = useState([
    { method: methods[0] || "cash", amount: "", reference: "" },
    { method: methods[1] || methods[0] || "cash", amount: "", reference: "" },
  ]);
  const [notes, setNotes] = useState("");
  const [promised, setPromised] = useState(invoice?.promised_date || "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const credit = useCredit(sub?.id);

  useEffect(() => {
    if (!sub) {
      setInvoices([]);
      return undefined;
    }
    let alive = true;
    setLoadingInv(true);
    supabase
      .from("v_invoice_summary")
      .select(
        "id, invoice_number, subscriber_id, subscriber_name, subscriber_code, subscriber_phone, billing_month, period_end, due_date, promised_date, amount, amount_paid, balance_due, payment_status, invoice_type"
      )
      .eq("subscriber_id", sub.id)
      .neq("invoice_status", "cancelled")
      .gt("balance_due", 0)
      .order("due_date")
      .then(({ data, error: e }) => {
        if (!alive) return;
        setLoadingInv(false);
        if (e) return setError(friendlyError(e));
        setInvoices(data || []);
        if (!invoiceId && data?.length === 1) pickInvoice(data[0], data);
      });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sub?.id]);

  const selected = useMemo(
    () => invoices.find((i) => i.id === invoiceId) || (invoice && invoice.id === invoiceId ? invoice : null),
    [invoices, invoiceId, invoice]
  );
  const balance = selected ? round2(selected.balance_due) : 0;

  function pickInvoice(inv) {
    setInvoiceId(inv?.id || "");
    setAmount(inv ? String(inv.balance_due) : "");
    setPromised(inv?.promised_date || "");
  }

  const paying = split ? round2(parts.reduce((s, p) => s + (Number(p.amount) || 0), 0)) : round2(amount);
  const remaining = round2(balance - paying);

  const updatePart = (i, patch) => setParts((ps) => ps.map((p, idx) => (idx === i ? { ...p, ...patch } : p)));

  async function submit() {
    setError("");
    if (!selected) return setError("Choose the invoice this payment is for.");
    if (paying <= 0) return setError("Enter an amount greater than zero.");
    if (paying > balance + 0.001) return setError(`The amount is more than the invoice balance (${money(balance)}).`);
    if (promised && promised < todayISO()) return setError("The 'pay the rest on' date must be today or later.");
    setSaving(true);
    try {
      const promisedDate = remaining > 0.001 && promised ? promised : null;
      if (split) {
        const list = parts
          .filter((p) => Number(p.amount) > 0)
          .map((p) => ({ method: p.method, amount: round2(p.amount), reference: p.reference.trim() || null }));
        if (list.length === 0) throw new Error("Enter an amount for at least one row.");
        const { error: e } = await supabase.rpc("record_split_payment", {
          p_invoice_id: selected.id,
          p_parts: list,
          p_promised_date: promisedDate,
          p_notes: notes.trim() || null,
        });
        if (e) throw e;
        onDone(`Split payment of ${money(paying)} recorded on ${selected.invoice_number}.`);
      } else {
        const { data, error: e } = await supabase.rpc("record_payment", {
          p_invoice_id: selected.id,
          p_amount: round2(amount),
          p_method: method,
          p_reference: reference.trim() || null,
          p_notes: notes.trim() || null,
          p_promised_date: promisedDate,
        });
        if (e) throw e;
        const r = Array.isArray(data) ? data[0] : data;
        onDone(
          `Receipt ${r?.receipt_number || ""} for ${money(paying)} recorded${
            r?.status === "pending" ? " (pending confirmation)" : ""
          }.`
        );
      }
    } catch (e) {
      setError(friendlyError(e));
      setSaving(false);
    }
  }

  return (
    <Modal
      title={split ? "Split Payment" : "Receive Payment"}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn btn-outline-secondary" onClick={onClose} disabled={saving}>
            Cancel
          </button>
          <button type="button" className="btn btn-primary shadow-md" onClick={submit} disabled={saving || !selected}>
            {saving ? "Saving..." : split ? "Save Split Payment" : "Save Payment"}
          </button>
        </>
      }
    >
      <ErrorBanner message={error} onClose={() => setError("")} />
      <div className="grid grid-cols-12 gap-4">
        <div className="col-span-12">
          <label className="text-xs text-slate-500">Subscriber</label>
          <SubscriberPicker
            value={sub}
            disabled={Boolean(invoice)}
            onChange={(s) => {
              setSub(s);
              pickInvoice(null);
            }}
          />
          {sub && credit !== null && credit > 0 && (
            <div className="text-xs text-success mt-1">
              This subscriber holds {money(credit)} advance credit. It is applied to open invoices automatically.
            </div>
          )}
        </div>

        {sub && (
          <div className="col-span-12">
            <label className="text-xs text-slate-500">Invoice (unpaid / partial / overdue)</label>
            {loadingInv ? (
              <div className="text-sm text-slate-500 mt-1">Loading invoices...</div>
            ) : invoices.length === 0 && !invoice ? (
              <div className="text-sm text-slate-500 mt-1">
                No open invoices for this subscriber. Use Advance Payment to take money in advance.
              </div>
            ) : (
              <select
                className="form-select box mt-1 w-full"
                value={invoiceId}
                disabled={Boolean(invoice)}
                onChange={(e) => pickInvoice(invoices.find((i) => i.id === e.target.value))}
              >
                <option value="">Select an invoice</option>
                {(invoice && !invoices.find((i) => i.id === invoice.id) ? [invoice, ...invoices] : invoices).map((i) => (
                  <option key={i.id} value={i.id}>
                    {i.invoice_number} | {formatDate(i.billing_month)} | balance {money(i.balance_due)} | {i.payment_status}
                  </option>
                ))}
              </select>
            )}
          </div>
        )}

        {selected && (
          <div className="col-span-12 box p-3 bg-slate-50 dark:bg-darkmode-700 text-sm grid grid-cols-3 gap-2">
            <KV label="Invoice total">{money(selected.amount)}</KV>
            <KV label="Already paid">{money(selected.amount_paid)}</KV>
            <KV label="Balance due">
              <span className="text-danger">{money(balance)}</span>
            </KV>
          </div>
        )}

        {selected && (
          <div className="col-span-12 flex items-center">
            <input
              id="split-toggle"
              type="checkbox"
              className="form-check-input"
              checked={split}
              onChange={(e) => setSplit(e.target.checked)}
            />
            <label htmlFor="split-toggle" className="ml-2 text-sm cursor-pointer">
              Split between several methods (e.g. half cash, half online)
            </label>
          </div>
        )}

        {selected && !split && (
          <>
            <div className="col-span-6">
              <label className="text-xs text-slate-500">Amount received (PKR)</label>
              <input
                type="number"
                min="0"
                step="0.01"
                className="form-control box mt-1 w-full"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
            </div>
            <div className="col-span-6">
              <label className="text-xs text-slate-500">Payment method</label>
              <MethodSelect value={method} onChange={setMethod} methods={methods} />
            </div>
            <div className="col-span-12">
              <label className="text-xs text-slate-500">Transaction reference</label>
              <input
                type="text"
                className="form-control box mt-1 w-full"
                placeholder="Optional"
                value={reference}
                onChange={(e) => setReference(e.target.value)}
              />
            </div>
          </>
        )}

        {selected && split && (
          <div className="col-span-12 space-y-2">
            {parts.map((p, i) => (
              <div key={i} className="grid grid-cols-12 gap-2 items-end">
                <div className="col-span-4">
                  <label className="text-xs text-slate-500">Method</label>
                  <MethodSelect value={p.method} onChange={(v) => updatePart(i, { method: v })} methods={methods} />
                </div>
                <div className="col-span-3">
                  <label className="text-xs text-slate-500">Amount</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    className="form-control box mt-1 w-full"
                    value={p.amount}
                    onChange={(e) => updatePart(i, { amount: e.target.value })}
                  />
                </div>
                <div className="col-span-4">
                  <label className="text-xs text-slate-500">Reference</label>
                  <input
                    type="text"
                    className="form-control box mt-1 w-full"
                    value={p.reference}
                    onChange={(e) => updatePart(i, { reference: e.target.value })}
                  />
                </div>
                <div className="col-span-1">
                  <button
                    type="button"
                    className="text-slate-400 hover:text-danger pb-2"
                    disabled={parts.length <= 2}
                    onClick={() => setParts((ps) => ps.filter((_, idx) => idx !== i))}
                    aria-label="Remove row"
                  >
                    <Lucide icon="Trash2" className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
            <button
              type="button"
              className="text-primary text-sm"
              onClick={() => setParts((ps) => [...ps, { method: methods[0] || "cash", amount: "", reference: "" }])}
            >
              + Add another method
            </button>
            <div className="text-sm">
              Total of rows: <b>{money(paying)}</b>
              {paying > balance + 0.001 && <span className="text-danger ml-2">more than the balance</span>}
            </div>
          </div>
        )}

        {selected && (
          <>
            {remaining > 0.001 && paying > 0 && (
              <div className="col-span-12">
                <label className="text-xs text-slate-500">
                  Pay the rest on (remaining {money(remaining)}) - optional promise date
                </label>
                <input
                  type="date"
                  min={todayISO()}
                  className="form-control box mt-1 w-full"
                  value={promised}
                  onChange={(e) => setPromised(e.target.value)}
                />
                <div className="text-xs text-slate-500 mt-1">
                  The invoice becomes "partial". Until that date it is not overdue and no late fee is charged.
                </div>
              </div>
            )}
            <div className="col-span-12">
              <label className="text-xs text-slate-500">Notes</label>
              <textarea
                className="form-control box mt-1 w-full"
                rows={2}
                placeholder="Optional"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              ></textarea>
            </div>
            {confirmationRequired && (
              <div className="col-span-12 text-xs text-slate-500">
                This ISP requires confirmation: the payment will stay "pending" until someone confirms it.
              </div>
            )}
          </>
        )}
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------------
// 3. Advance payment
// ---------------------------------------------------------------------
export function AdvancePaymentDialog({ methods, onClose, onChanged }) {
  const [sub, setSub] = useState(null);
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState(methods[0] || "cash");
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");
  const [applyNow, setApplyNow] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);
  const [bump, setBump] = useState(0);
  const credit = useCredit(sub?.id, bump);

  async function submit() {
    setError("");
    if (!sub) return setError("Choose a subscriber.");
    if (!(Number(amount) > 0)) return setError("Enter an amount greater than zero.");
    setSaving(true);
    const { data, error: e } = await supabase.rpc("record_advance_payment", {
      p_subscriber_id: sub.id,
      p_amount: round2(amount),
      p_method: method,
      p_reference: reference.trim() || null,
      p_notes: notes.trim() || null,
      p_apply_to_open: applyNow,
    });
    setSaving(false);
    if (e) return setError(friendlyError(e));
    const r = Array.isArray(data) ? data[0] : data;
    setResult(r || {});
    setBump((b) => b + 1);
    onChanged(`Advance payment ${r?.receipt_number || ""} of ${money(amount)} recorded for ${sub.full_name}.`);
  }

  return (
    <Modal
      title="Advance Payment"
      onClose={onClose}
      footer={
        result ? (
          <button type="button" className="btn btn-primary" onClick={onClose}>
            Done
          </button>
        ) : (
          <>
            <button type="button" className="btn btn-outline-secondary" onClick={onClose} disabled={saving}>
              Cancel
            </button>
            <button type="button" className="btn btn-primary shadow-md" onClick={submit} disabled={saving}>
              {saving ? "Saving..." : "Save Advance Payment"}
            </button>
          </>
        )
      }
    >
      <ErrorBanner message={error} onClose={() => setError("")} />
      {result ? (
        <div className="text-center py-4">
          <Lucide icon="CheckCircle" className="w-12 h-12 text-success mx-auto" />
          <div className="mt-3 font-medium">Receipt {result.receipt_number}</div>
          <div className="text-slate-500 text-sm mt-1">
            {sub.full_name} now holds{" "}
            <b className="text-slate-700 dark:text-slate-200">{credit === null ? "..." : money(credit)}</b> of advance
            credit. {applyNow && "Open invoices were paid from it, oldest first. "}It is used automatically on every future
            invoice.
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-12 gap-4">
          <div className="col-span-12">
            <label className="text-xs text-slate-500">Subscriber</label>
            <SubscriberPicker value={sub} onChange={setSub} />
            {sub && credit !== null && (
              <div className="text-xs text-slate-500 mt-1">Current advance credit: {money(credit)}</div>
            )}
          </div>
          <div className="col-span-6">
            <label className="text-xs text-slate-500">Amount (PKR)</label>
            <input
              type="number"
              min="0"
              step="0.01"
              className="form-control box mt-1 w-full"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </div>
          <div className="col-span-6">
            <label className="text-xs text-slate-500">Payment method</label>
            <MethodSelect value={method} onChange={setMethod} methods={methods} />
          </div>
          <div className="col-span-12">
            <label className="text-xs text-slate-500">Transaction reference</label>
            <input
              type="text"
              className="form-control box mt-1 w-full"
              placeholder="Optional"
              value={reference}
              onChange={(e) => setReference(e.target.value)}
            />
          </div>
          <div className="col-span-12">
            <label className="text-xs text-slate-500">Notes</label>
            <input type="text" className="form-control box mt-1 w-full" value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
          <div className="col-span-12 flex items-center">
            <input
              id="apply-now"
              type="checkbox"
              className="form-check-input"
              checked={applyNow}
              onChange={(e) => setApplyNow(e.target.checked)}
            />
            <label htmlFor="apply-now" className="ml-2 text-sm cursor-pointer">
              Apply to the subscriber's open invoices now
            </label>
          </div>
        </div>
      )}
    </Modal>
  );
}

// ---------------------------------------------------------------------
// 4. Refund
// ---------------------------------------------------------------------
export function RefundDialog({ payment, methods, onClose, onDone }) {
  const left = round2(Number(payment.amount) - Number(payment.refunded_amount || 0));
  const [amount, setAmount] = useState(String(left));
  const [method, setMethod] = useState(methods.includes(payment.method) ? payment.method : methods[0] || "cash");
  const [reason, setReason] = useState("");
  const [history, setHistory] = useState([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    supabase
      .from("v_refund_ledger")
      .select("id, refund_number, amount, method, reason, refunded_at, refunded_by_name")
      .eq("payment_id", payment.id)
      .order("refunded_at", { ascending: false })
      .then(({ data }) => setHistory(data || []));
  }, [payment.id]);

  async function submit() {
    setError("");
    if (!(Number(amount) > 0)) return setError("Enter an amount greater than zero.");
    if (round2(amount) > left + 0.001) return setError(`You can refund at most ${money(left)} on this receipt.`);
    setSaving(true);
    const { error: e } = await supabase.rpc("refund_payment", {
      p_payment_id: payment.id,
      p_amount: round2(amount),
      p_method: method,
      p_reason: reason.trim() || null,
    });
    setSaving(false);
    if (e) return setError(friendlyError(e));
    onDone(`Refunded ${money(amount)} on receipt ${payment.receipt_number}.`);
  }

  return (
    <Modal
      title={`Refund ${payment.receipt_number}`}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn btn-outline-secondary" onClick={onClose} disabled={saving}>
            Cancel
          </button>
          <button type="button" className="btn btn-danger shadow-md" onClick={submit} disabled={saving || left <= 0}>
            {saving ? "Refunding..." : "Refund"}
          </button>
        </>
      }
    >
      <ErrorBanner message={error} onClose={() => setError("")} />
      <div className="box p-3 bg-slate-50 dark:bg-darkmode-700 text-sm grid grid-cols-3 gap-2 mb-4">
        <KV label="Paid">{money(payment.amount)}</KV>
        <KV label="Already refunded">{money(payment.refunded_amount)}</KV>
        <KV label="Left to refund">{money(left)}</KV>
      </div>
      {!payment.invoice_id && (
        <div className="text-xs text-slate-500 mb-3">
          This is an advance payment: it can only be refunded while the credit is still unused.
        </div>
      )}
      <div className="grid grid-cols-12 gap-4">
        <div className="col-span-6">
          <label className="text-xs text-slate-500">Refund amount (PKR)</label>
          <input
            type="number"
            min="0"
            step="0.01"
            className="form-control box mt-1 w-full"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
        </div>
        <div className="col-span-6">
          <label className="text-xs text-slate-500">Paid back by</label>
          <MethodSelect value={method} onChange={setMethod} methods={methods} />
        </div>
        <div className="col-span-12">
          <label className="text-xs text-slate-500">Reason</label>
          <textarea
            className="form-control box mt-1 w-full"
            rows={2}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          ></textarea>
        </div>
      </div>
      {history.length > 0 && (
        <div className="mt-5">
          <div className="font-medium text-sm mb-1">Refund history</div>
          <RefundTable rows={history} />
        </div>
      )}
    </Modal>
  );
}

export function RefundTable({ rows }) {
  return (
    <div className="overflow-x-auto">
      <table className="table table-sm w-full text-xs">
        <thead>
          <tr>
            <th className="whitespace-nowrap">Refund</th>
            <th className="whitespace-nowrap">Date</th>
            <th className="text-right">Amount</th>
            <th>Method</th>
            <th>Reason</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id}>
              <td className="whitespace-nowrap">{r.refund_number}</td>
              <td className="whitespace-nowrap">{formatDateTime(r.refunded_at)}</td>
              <td className="text-right whitespace-nowrap">{money(r.amount)}</td>
              <td>{methodLabel(r.method)}</td>
              <td>{r.reason || "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ---------------------------------------------------------------------
// 5. Receipt view / print
// ---------------------------------------------------------------------
export function ReceiptModal({ payment, onClose }) {
  const org = useOrganization();
  const net = round2(Number(payment.amount) - Number(payment.refunded_amount || 0));

  function print() {
    const rows = [
      ["Subscriber", `${payment.subscriber_name} (${payment.subscriber_code})`],
      ["Phone", payment.subscriber_phone || "—"],
      ["Invoice", payment.invoice_number || "Advance payment"],
      ["Method", methodLabel(payment.method)],
      ["Reference", payment.reference_no || "—"],
      ["Date", formatDateTime(payment.paid_at)],
      ["Status", payment.status],
      ["Received by", payment.received_by_name || "—"],
    ]
      .map(([k, v]) => `<div><div class="muted">${esc(k)}</div><div><b>${esc(v)}</b></div></div>`)
      .join("");
    printHtml(
      `Receipt ${payment.receipt_number}`,
      `${orgHeaderHtml(org, "Receipt No", payment.receipt_number)}<div class="grid">${rows}</div>
       <div class="row"><span>Amount received</span><span>${esc(money(payment.amount))}</span></div>
       ${Number(payment.refunded_amount) > 0 ? `<div class="row"><span>Refunded</span><span>- ${esc(money(payment.refunded_amount))}</span></div>` : ""}
       ${payment.invoice_id ? `<div class="row"><span>Invoice balance after payment</span><span>${esc(money(payment.invoice_balance_due))}</span></div>` : ""}
       <div class="row total"><span>Net received</span><span>${esc(money(net))}</span></div>
       ${payment.notes ? `<p class="muted">Notes: ${esc(payment.notes)}</p>` : ""}`
    );
  }

  return (
    <Modal
      title="Payment Receipt"
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn btn-outline-secondary" onClick={onClose}>
            Close
          </button>
          <button type="button" className="btn btn-primary shadow-md" onClick={print}>
            <Lucide icon="Printer" className="w-4 h-4 mr-2" /> Print
          </button>
        </>
      }
    >
      <OrgLetterhead org={org} title="Receipt No" value={payment.receipt_number} />
      <div className="grid grid-cols-2 gap-y-3 mt-5 text-sm">
        <KV label="Subscriber">
          {payment.subscriber_name} <span className="text-slate-500 font-normal">{payment.subscriber_code}</span>
        </KV>
        <KV label="Phone">{payment.subscriber_phone || "—"}</KV>
        <KV label="Invoice">{payment.invoice_number || "Advance payment"}</KV>
        <KV label="Payment method">{methodLabel(payment.method)}</KV>
        <KV label="Reference">{payment.reference_no || "—"}</KV>
        <KV label="Date">{formatDateTime(payment.paid_at)}</KV>
        <KV label="Status">
          <PaymentRecordBadge status={payment.status} />
        </KV>
        <KV label="Received by">{payment.received_by_name || "—"}</KV>
      </div>
      <div className="mt-6 border-t border-slate-200/60 dark:border-darkmode-400 pt-4">
        <div className="flex justify-between py-1.5 text-sm">
          <div className="text-slate-500">Amount received</div>
          <div>{money(payment.amount)}</div>
        </div>
        {Number(payment.refunded_amount) > 0 && (
          <div className="flex justify-between py-1.5 text-sm">
            <div className="text-slate-500">Refunded</div>
            <div>- {money(payment.refunded_amount)}</div>
          </div>
        )}
        {payment.invoice_id && (
          <div className="flex justify-between py-1.5 text-sm">
            <div className="text-slate-500">Invoice balance now</div>
            <div>{money(payment.invoice_balance_due)}</div>
          </div>
        )}
        <div className="flex justify-between py-3 mt-2 border-t border-slate-200/60 dark:border-darkmode-400 text-base font-medium">
          <div>Net received</div>
          <div>{money(net)}</div>
        </div>
      </div>
      {payment.notes && <div className="text-xs text-slate-500">Notes: {payment.notes}</div>}
    </Modal>
  );
}

export { InvoicePaymentBadge };
