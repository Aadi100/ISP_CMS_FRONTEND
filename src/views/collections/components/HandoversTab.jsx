import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { friendlyError } from "@/lib/errors";
import { money, formatDateTime } from "@/lib/format";
import { ErrorBanner, Modal, Pagination } from "@/views/payments/components/shared";
import { HandoverBadge } from "./HandoverBadge";

export default function HandoversTab({ collectors, canEdit, onToast, onChanged, refreshKey }) {
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(10);
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(null);
  const [dlg, setDlg] = useState(false);
  const [form, setForm] = useState({ collector: "", amount: "", notes: "" });
  const [saving, setSaving] = useState(false);

  const names = {};
  collectors.forEach((c) => (names[c.collector_id] = c.full_name));

  const load = useCallback(async () => {
    setLoading(true);
    try {
      let q = supabase.from("collector_handovers").select("*", { count: "exact" });
      if (status) q = q.eq("status", status);
      const { data, count, error: err } = await q
        .order("handed_at", { ascending: false })
        .range(page * pageSize, page * pageSize + pageSize - 1);
      if (err) throw err;
      setRows(data || []);
      setTotal(count || 0);
      setError("");
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setLoading(false);
    }
  }, [status, page, pageSize]);

  useEffect(() => {
    load();
  }, [load, refreshKey]);
  useEffect(() => setPage(0), [status, pageSize]);

  const decide = async (id, confirm) => {
    setBusy(id);
    try {
      const { error: err } = await supabase.rpc("confirm_handover", { p_id: id, p_confirm: confirm });
      if (err) throw err;
      onToast(confirm ? "Handover confirmed." : "Handover rejected.");
      await load();
      onChanged();
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setBusy(null);
    }
  };

  const record = async () => {
    const amount = Number(form.amount);
    if (!form.collector) return setError("Choose a collector.");
    if (!(amount > 0)) return setError("Enter an amount greater than zero.");
    setSaving(true);
    try {
      const { error: err } = await supabase.rpc("record_handover_for", {
        p_collector: form.collector,
        p_amount: amount,
        p_notes: form.notes.trim() || null,
      });
      if (err) throw err;
      onToast("Handover recorded.");
      setDlg(false);
      setForm({ collector: "", amount: "", notes: "" });
      setError("");
      await load();
      onChanged();
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="box p-5">
      <ErrorBanner message={error} onClose={() => setError("")} />
      <div className="flex flex-wrap gap-2 mb-3">
        <select className="form-select w-44" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">All statuses</option>
          <option value="pending">Pending</option>
          <option value="confirmed">Confirmed</option>
          <option value="rejected">Rejected</option>
        </select>
        {canEdit && (
          <button type="button" className="btn btn-primary ml-auto" onClick={() => setDlg(true)}>
            Record handover
          </button>
        )}
      </div>
      <div className="overflow-x-auto">
        <table className="table table-report">
          <thead>
            <tr>
              <th>Number</th>
              <th>Collector</th>
              <th className="text-right">Amount</th>
              <th>Date</th>
              <th>Status</th>
              <th>Notes</th>
              {canEdit && <th className="text-right">Actions</th>}
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={7} className="text-center text-slate-500 py-8">
                  Loading...
                </td>
              </tr>
            )}
            {!loading && rows.length === 0 && (
              <tr>
                <td colSpan={7} className="text-center text-slate-500 py-8">
                  No handovers found.
                </td>
              </tr>
            )}
            {rows.map((r) => (
              <tr key={r.id}>
                <td className="whitespace-nowrap">{r.handover_number}</td>
                <td>{names[r.collector_id] || "Unknown"}</td>
                <td className="text-right">{money(r.amount)}</td>
                <td className="whitespace-nowrap">{formatDateTime(r.handed_at)}</td>
                <td>
                  <HandoverBadge status={r.status} />
                </td>
                <td className="max-w-xs truncate">{r.notes || "-"}</td>
                {canEdit && (
                  <td className="text-right whitespace-nowrap">
                    {r.status === "pending" && (
                      <>
                        <button
                          type="button"
                          className="btn btn-success btn-sm mr-2"
                          disabled={busy === r.id}
                          onClick={() => decide(r.id, true)}
                        >
                          Confirm
                        </button>
                        <button
                          type="button"
                          className="btn btn-outline-danger btn-sm"
                          disabled={busy === r.id}
                          onClick={() => decide(r.id, false)}
                        >
                          Reject
                        </button>
                      </>
                    )}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Pagination page={page} pageSize={pageSize} total={total} onPage={setPage} onPageSize={setPageSize} />

      {dlg && (
        <Modal
          title="Record handover"
          onClose={() => setDlg(false)}
          footer={
            <>
              <button type="button" className="btn btn-outline-secondary" onClick={() => setDlg(false)}>
                Cancel
              </button>
              <button type="button" className="btn btn-primary" disabled={saving} onClick={record}>
                {saving ? "Saving..." : "Record"}
              </button>
            </>
          }
        >
          <ErrorBanner message={error} onClose={() => setError("")} />
          <label className="form-label">Collector</label>
          <select
            className="form-select"
            value={form.collector}
            onChange={(e) => setForm({ ...form, collector: e.target.value })}
          >
            <option value="">Choose...</option>
            {collectors.map((c) => (
              <option key={c.collector_id} value={c.collector_id}>
                {c.full_name} (in hand {money(c.cash_in_hand)})
              </option>
            ))}
          </select>
          <label className="form-label mt-3">Amount (PKR)</label>
          <input
            type="number"
            min="0"
            className="form-control"
            value={form.amount}
            onChange={(e) => setForm({ ...form, amount: e.target.value })}
          />
          <label className="form-label mt-3">Notes</label>
          <textarea
            className="form-control"
            rows={2}
            value={form.notes}
            onChange={(e) => setForm({ ...form, notes: e.target.value })}
          />
        </Modal>
      )}
    </div>
  );
}
