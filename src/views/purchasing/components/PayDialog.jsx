import { useState } from "react";
import { supabase } from "@/lib/supabase";
import { friendlyError } from "@/lib/errors";
import { money, titleCase } from "@/lib/format";
import { Modal, ErrorBanner, PAY_METHODS } from "./common";

export default function PayDialog({ po, onClose, onDone }) {
  const balance = Math.max(0, Number(po.total) - Number(po.paid_amount));
  const [amount, setAmount] = useState(String(balance));
  const [method, setMethod] = useState("bank_transfer");
  const [reference, setReference] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const submit = async () => {
    const a = Number(amount);
    if (!(a > 0)) return setError("Enter an amount greater than zero.");
    setSaving(true);
    setError("");
    const { error: e } = await supabase.rpc("pay_purchase", {
      p_po: po.id,
      p_amount: a,
      p_method: method,
      p_reference: reference.trim() || null,
    });
    setSaving(false);
    if (e) return setError(friendlyError(e));
    onDone(a);
  };

  return (
    <Modal
      title={`Pay supplier - ${po.po_number}`}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn btn-outline-secondary" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="btn btn-primary" disabled={saving} onClick={submit}>
            {saving ? "Paying…" : "Pay"}
          </button>
        </>
      }
    >
      <ErrorBanner message={error} />
      <div className="text-sm text-slate-500 mb-3">
        Total {money(po.total)} | Paid {money(po.paid_amount)} | Balance {money(balance)}
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="form-label">Amount</label>
          <input type="number" min="0" step="any" className="form-control" value={amount} onChange={(e) => setAmount(e.target.value)} />
        </div>
        <div>
          <label className="form-label">Method</label>
          <select className="form-select" value={method} onChange={(e) => setMethod(e.target.value)}>
            {PAY_METHODS.map((m) => (
              <option key={m} value={m}>
                {titleCase(m)}
              </option>
            ))}
          </select>
        </div>
        <div className="col-span-2">
          <label className="form-label">Reference</label>
          <input className="form-control" value={reference} onChange={(e) => setReference(e.target.value)} placeholder="Cheque / transfer number" />
        </div>
      </div>
    </Modal>
  );
}
