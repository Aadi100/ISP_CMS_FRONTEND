import { useState } from "react";
import { supabase } from "@/lib/supabase";
import { friendlyError } from "@/lib/errors";
import { titleCase } from "@/lib/format";
import { Modal, ErrorBanner, EXPENSE_METHODS, todayISO } from "./common";

export default function ExpenseForm({ expense, categories, branches, onClose, onSaved }) {
  const [f, setF] = useState({
    category_id: expense?.category_id || "",
    amount: expense?.amount ?? "",
    expense_date: expense?.expense_date || todayISO(),
    payee: expense?.payee || "",
    method: expense?.method || "cash",
    reference_no: expense?.reference_no || "",
    description: expense?.description || "",
    branch_id: expense?.branch_id || "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  const save = async () => {
    setError("");
    if (!f.category_id) return setError("Choose a category.");
    if (!(Number(f.amount) > 0)) return setError("Enter an amount greater than zero.");
    if (!f.expense_date) return setError("Choose a date.");
    setSaving(true);
    try {
      const row = {
        category_id: f.category_id,
        amount: Number(f.amount),
        expense_date: f.expense_date,
        payee: f.payee.trim() || null,
        method: f.method,
        reference_no: f.reference_no.trim() || null,
        description: f.description.trim() || null,
      };
      if (branches.length) row.branch_id = f.branch_id || null;
      const q = expense
        ? supabase.from("expenses").update(row).eq("id", expense.id)
        : supabase.from("expenses").insert(row);
      const { error: err } = await q;
      if (err) throw err;
      onSaved(expense ? "Expense updated." : "Expense added.");
    } catch (e) {
      setError(friendlyError(e));
      setSaving(false);
    }
  };

  return (
    <Modal
      title={expense ? `Edit expense ${expense.expense_number || ""}` : "Add expense"}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn btn-outline-secondary" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="btn btn-primary" disabled={saving} onClick={save}>
            {saving ? "Saving..." : "Save"}
          </button>
        </>
      }
    >
      <ErrorBanner message={error} />
      <div className="grid grid-cols-2 gap-4">
        <div className="col-span-2 sm:col-span-1">
          <label className="form-label">Category</label>
          <select className="form-select" value={f.category_id} onChange={set("category_id")}>
            <option value="">Select...</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        <div className="col-span-2 sm:col-span-1">
          <label className="form-label">Amount (PKR)</label>
          <input type="number" min="0" step="0.01" className="form-control" value={f.amount} onChange={set("amount")} />
        </div>
        <div className="col-span-2 sm:col-span-1">
          <label className="form-label">Date</label>
          <input type="date" className="form-control" value={f.expense_date} onChange={set("expense_date")} />
        </div>
        <div className="col-span-2 sm:col-span-1">
          <label className="form-label">Method</label>
          <select className="form-select" value={f.method} onChange={set("method")}>
            {EXPENSE_METHODS.map((m) => (
              <option key={m} value={m}>
                {titleCase(m)}
              </option>
            ))}
          </select>
        </div>
        <div className="col-span-2 sm:col-span-1">
          <label className="form-label">Payee</label>
          <input className="form-control" value={f.payee} onChange={set("payee")} />
        </div>
        <div className="col-span-2 sm:col-span-1">
          <label className="form-label">Reference no.</label>
          <input className="form-control" value={f.reference_no} onChange={set("reference_no")} />
        </div>
        {branches.length > 0 && (
          <div className="col-span-2">
            <label className="form-label">Branch</label>
            <select className="form-select" value={f.branch_id} onChange={set("branch_id")}>
              <option value="">No branch</option>
              {branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </div>
        )}
        <div className="col-span-2">
          <label className="form-label">Description</label>
          <textarea className="form-control" rows={3} value={f.description} onChange={set("description")} />
        </div>
      </div>
    </Modal>
  );
}
