import { useState } from "react";
import { supabase } from "@/lib/supabase";
import { friendlyError } from "@/lib/errors";
import { money, formatDate } from "@/lib/format";
import { Modal, ErrorBanner } from "./common";

export default function CloseDayModal({ day, branch, onClose, onDone }) {
  const [counted, setCounted] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const expected = Number(day.closing);
  const diff = counted === "" ? null : Number(counted) - expected;

  const submit = async () => {
    if (counted === "" || Number(counted) < 0) return setError("Enter the counted cash.");
    setSaving(true);
    setError("");
    try {
      const { error: err } = await supabase.rpc("close_day", {
        p_date: day.date,
        p_counted: Number(counted),
        p_notes: notes.trim() || null,
        p_branch: branch || null,
      });
      if (err) throw err;
      onDone(`Day ${formatDate(day.date)} closed.`);
    } catch (e) {
      setError(friendlyError(e));
      setSaving(false);
    }
  };

  return (
    <Modal
      title={`Close day ${formatDate(day.date)}`}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn btn-outline-secondary" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="btn btn-primary" disabled={saving} onClick={submit}>
            {saving ? "Closing..." : "Close day"}
          </button>
        </>
      }
    >
      <ErrorBanner message={error} />
      <div className="mb-4">
        <div className="text-slate-500 text-xs">Expected cash (book closing)</div>
        <div className="text-xl font-medium">{money(expected)}</div>
      </div>
      <div className="mb-4">
        <label className="form-label">Counted cash (PKR)</label>
        <input type="number" min="0" step="0.01" className="form-control" value={counted} onChange={(e) => setCounted(e.target.value)} />
      </div>
      {diff !== null && (
        <div className={`mb-4 font-medium ${diff === 0 ? "text-success" : diff < 0 ? "text-danger" : "text-success"}`}>
          Difference: {money(diff)} {diff === 0 ? "(balanced)" : diff < 0 ? "(short)" : "(over)"}
        </div>
      )}
      <div>
        <label className="form-label">Notes</label>
        <textarea className="form-control" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
      </div>
    </Modal>
  );
}
