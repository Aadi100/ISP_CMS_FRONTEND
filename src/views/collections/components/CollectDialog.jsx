import { useState } from "react";
import { supabase } from "@/lib/supabase";
import { friendlyError } from "@/lib/errors";
import { money } from "@/lib/format";
import { ErrorBanner, Modal, todayISO } from "@/views/payments/components/shared";

const METHODS = [
  ["cash", "Cash"],
  ["jazzcash", "JazzCash"],
  ["easypaisa", "EasyPaisa"],
  ["bank_transfer", "Bank transfer"],
];

/** target = { invoice } to pay an invoice, or { subscriber } for an advance payment. */
export default function CollectDialog({ target, onClose, onDone }) {
  const invoice = target.invoice || null;
  const subscriber = target.subscriber || null;
  const balance = invoice ? Number(invoice.balance_due) : 0;
  const [amount, setAmount] = useState(invoice ? String(balance) : "");
  const [method, setMethod] = useState("cash");
  const [reference, setReference] = useState("");
  const [promised, setPromised] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const amt = Number(amount);
  const partial = invoice && amt > 0 && amt < balance;

  const submit = async () => {
    if (!(amt > 0)) return setError("Enter an amount greater than zero.");
    if (invoice && amt > balance) return setError(`Amount cannot exceed the balance of ${money(balance)}.`);
    setSaving(true);
    try {
      let res;
      if (invoice) {
        res = await supabase.rpc("record_payment", {
          p_invoice_id: invoice.id,
          p_amount: amt,
          p_method: method,
          p_reference: reference.trim() || null,
          p_promised_date: partial && promised ? promised : null,
        });
      } else {
        res = await supabase.rpc("record_advance_payment", {
          p_subscriber_id: subscriber.id,
          p_amount: amt,
          p_method: method,
          p_reference: reference.trim() || null,
        });
      }
      if (res.error) throw res.error;
      onDone(invoice ? "Payment recorded." : "Advance payment recorded.");
    } catch (e) {
      setError(friendlyError(e));
      setSaving(false);
    }
  };

  return (
    <Modal
      title={invoice ? `Collect payment - ${invoice.invoice_number}` : `Advance payment - ${subscriber.full_name}`}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn btn-outline-secondary" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="btn btn-primary" disabled={saving} onClick={submit}>
            {saving ? "Saving..." : "Save payment"}
          </button>
        </>
      }
    >
      <ErrorBanner message={error} onClose={() => setError("")} />
      {invoice && (
        <div className="text-sm mb-3 text-slate-500">
          {invoice.subscriber_name} - balance due <b>{money(balance)}</b>
        </div>
      )}
      <label className="form-label">Amount (PKR)</label>
      <input type="number" min="0" className="form-control" value={amount} onChange={(e) => setAmount(e.target.value)} />
      <label className="form-label mt-3">Method</label>
      <select className="form-select" value={method} onChange={(e) => setMethod(e.target.value)}>
        {METHODS.map(([v, l]) => (
          <option key={v} value={v}>
            {l}
          </option>
        ))}
      </select>
      <label className="form-label mt-3">Reference (optional)</label>
      <input className="form-control" value={reference} onChange={(e) => setReference(e.target.value)} />
      {partial && (
        <>
          <label className="form-label mt-3">Customer will pay the rest on (optional)</label>
          <input
            type="date"
            className="form-control"
            min={todayISO()}
            value={promised}
            onChange={(e) => setPromised(e.target.value)}
          />
          <div className="text-xs text-slate-500 mt-1">Remaining {money(balance - amt)} stays on the invoice.</div>
        </>
      )}
    </Modal>
  );
}
