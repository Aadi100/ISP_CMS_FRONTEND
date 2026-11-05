import classnames from "classnames";
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { friendlyError } from "@/lib/errors";
import { money, formatDateTime, titleCase } from "@/lib/format";

const BADGE = {
  pending: "bg-warning/20 text-warning",
  approved: "bg-success/20 text-success",
  rejected: "bg-danger/20 text-danger",
};
const SIZE = 10;

function TopupTab({ resellers, canEdit, onChanged }) {
  const [status, setStatus] = useState("pending");
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");
  const [deciding, setDeciding] = useState(null); // { row, approve }
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    let q = supabase.from("wallet_topup_requests").select("*", { count: "exact" });
    if (status) q = q.eq("status", status);
    const from = (page - 1) * SIZE;
    const { data, count, error: err } = await q.order("created_at", { ascending: false }).range(from, from + SIZE - 1);
    setError(err ? friendlyError(err) : "");
    setRows(data || []);
    setTotal(count || 0);
    setLoading(false);
  }, [status, page]);

  useEffect(() => {
    load();
  }, [load]);

  const nameOf = (id) => {
    const r = resellers.find((x) => x.id === id);
    return r ? `${r.reseller_code} - ${r.name}` : "—";
  };

  const decide = async () => {
    setBusy(true);
    setError("");
    const { error: err } = await supabase.rpc("decide_wallet_topup", {
      p_id: deciding.row.id,
      p_approve: deciding.approve,
      p_note: note.trim() || null,
    });
    setBusy(false);
    if (err) return setError(friendlyError(err));
    setMsg(deciding.approve ? "Request approved and the wallet was recharged." : "Request rejected.");
    setDeciding(null);
    setNote("");
    await load();
    onChanged && onChanged();
  };

  const pages = Math.max(1, Math.ceil(total / SIZE));

  return (
    <div className="intro-y box p-5">
      <div className="flex items-center mb-4">
        <div className="text-base font-medium">Wallet top-up requests</div>
        <select className="form-select box w-44 ml-auto" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}>
          <option value="">All statuses</option>
          <option value="pending">Pending</option>
          <option value="approved">Approved</option>
          <option value="rejected">Rejected</option>
        </select>
      </div>
      {error && <div className="alert alert-danger show mb-3 text-sm">{error}</div>}
      {msg && <div className="text-success text-sm mb-3">{msg}</div>}
      {loading ? (
        <div className="text-slate-500 text-sm">Loading requests...</div>
      ) : rows.length === 0 ? (
        <div className="text-slate-500 text-sm">No top-up requests.</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="table w-full text-sm min-w-[900px]">
            <thead>
              <tr><th>DATE</th><th>RESELLER</th><th className="text-right">AMOUNT</th><th>METHOD</th><th>REFERENCE / NOTES</th><th>STATUS</th><th></th></tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td className="whitespace-nowrap">{formatDateTime(r.created_at)}</td>
                  <td>{nameOf(r.reseller_id)}</td>
                  <td className="text-right whitespace-nowrap">{money(r.amount)}</td>
                  <td>{titleCase(r.method)}</td>
                  <td>{[r.reference, r.notes].filter(Boolean).join(" - ") || "—"}{r.decision_note ? <div className="text-xs text-slate-500">Decision: {r.decision_note}</div> : null}</td>
                  <td><span className={classnames("py-1 px-2 rounded-full text-xs font-medium", BADGE[r.status])}>{titleCase(r.status)}</span></td>
                  <td className="whitespace-nowrap">
                    {canEdit && r.status === "pending" && (
                      <>
                        <button type="button" className="btn btn-primary btn-sm mr-2" onClick={() => { setDeciding({ row: r, approve: true }); setNote(""); }}>Approve</button>
                        <button type="button" className="btn btn-outline-danger btn-sm" onClick={() => { setDeciding({ row: r, approve: false }); setNote(""); }}>Reject</button>
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="flex items-center mt-3 text-sm text-slate-500">
        <span>{total} request(s) - page {page} of {pages}</span>
        <div className="ml-auto flex gap-2">
          <button type="button" className="btn btn-outline-secondary btn-sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>Prev</button>
          <button type="button" className="btn btn-outline-secondary btn-sm" disabled={page >= pages} onClick={() => setPage(page + 1)}>Next</button>
        </div>
      </div>

      {deciding && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60" onClick={() => !busy && setDeciding(null)}></div>
          <div className="relative box w-full max-w-md p-6">
            <h2 className="text-lg font-medium mb-3">{deciding.approve ? "Approve top-up" : "Reject top-up"}</h2>
            <div className="text-sm mb-3">
              {nameOf(deciding.row.reseller_id)} - {money(deciding.row.amount)}
              {deciding.approve && <div className="text-slate-500 mt-1">Approving will recharge the reseller's wallet with this amount.</div>}
            </div>
            <label className="text-xs text-slate-500">Note (optional)</label>
            <textarea className="form-control box mt-1 w-full" rows={2} value={note} onChange={(e) => setNote(e.target.value)}></textarea>
            <div className="flex justify-end gap-2 mt-5">
              <button type="button" className="btn btn-outline-secondary" disabled={busy} onClick={() => setDeciding(null)}>Cancel</button>
              <button type="button" className="btn btn-primary" disabled={busy} onClick={decide}>{busy ? "Saving..." : "Confirm"}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default TopupTab;
