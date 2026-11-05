import { useState } from "react";
import { supabase } from "@/lib/supabase";
import { friendlyError } from "@/lib/errors";
import { money } from "@/lib/format";
import { Modal, ErrorBanner } from "../../shared";

const METHODS = ["bank_transfer", "cash", "online", "cheque", "jazzcash", "easypaisa"];

export default function PaymentModal({ invoice, onClose, onDone }) {
  const balance = Number(invoice.amount) - Number(invoice.amount_paid);
  const [amount, setAmount] = useState(String(balance));
  const [method, setMethod] = useState("bank_transfer");
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const submit = async (e) => {
    e.preventDefault();
    if (!(Number(amount) > 0)) return setError("Enter an amount greater than 0.");
    setSaving(true);
    setError("");
    try {
      const { error: err } = await supabase.rpc("record_saas_payment", {
        p_invoice_id: invoice.id,
        p_amount: Number(amount),
        p_method: method,
        p_reference: reference.trim() || null,
        p_notes: notes.trim() || null,
      });
      if (err) throw err;
      onDone(`Payment of ${money(amount)} recorded for ${invoice.invoice_number}.`);
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal title={`Record payment - ${invoice.invoice_number}`} onClose={onClose}>
      <form onSubmit={submit}>
        <ErrorBanner message={error} />
        <div className="text-sm mb-4">
          {invoice.organizations?.name}: total {money(invoice.amount)}, paid {money(invoice.amount_paid)}, balance{" "}
          <b>{money(balance)}</b>. Paying in full extends the subscription to the end of the billed period.
        </div>
        <div className="mb-4">
          <label className="form-label">Amount (PKR)</label>
          <input type="number" min="0" step="0.01" className="form-control" value={amount} onChange={(e) => setAmount(e.target.value)} />
        </div>
        <div className="mb-4">
          <label className="form-label">Method</label>
          <select className="form-select" value={method} onChange={(e) => setMethod(e.target.value)}>
            {METHODS.map((m) => (
              <option key={m} value={m}>{m.replace(/_/g, " ")}</option>
            ))}
          </select>
        </div>
        <div className="mb-4">
          <label className="form-label">Reference</label>
          <input className="form-control" placeholder="Transaction / cheque no." value={reference} onChange={(e) => setReference(e.target.value)} />
        </div>
        <div className="mb-5">
          <label className="form-label">Notes</label>
          <input className="form-control" value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>
        <div className="flex justify-end gap-2">
          <button type="button" className="btn btn-outline-secondary" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? "Saving..." : "Record payment"}</button>
        </div>
      </form>
    </Modal>
  );
}
