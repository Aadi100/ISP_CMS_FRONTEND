import classnames from "classnames";
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { friendlyError } from "@/lib/errors";
import { money, formatDate, titleCase } from "@/lib/format";

const SIZE = 10;
const BADGE = {
  accrued: "bg-warning/20 text-warning",
  paid: "bg-success/20 text-success",
  cancelled: "bg-slate-200 text-slate-500",
};

function CommissionTab({ resellers, canEdit, onChanged }) {
  const [totals, setTotals] = useState({}); // reseller_id -> { accrued, paid }
  const [sel, setSel] = useState("");
  const [rows, setRows] = useState([]);
  const [receipts, setReceipts] = useState({});
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");
  const [paying, setPaying] = useState(false);
  const [toWallet, setToWallet] = useState(true);
  const [busy, setBusy] = useState(false);

  const loadTotals = useCallback(async () => {
    const { data, error: err } = await supabase
      .from("reseller_commissions")
      .select("reseller_id, status, amount")
      .in("status", ["accrued", "paid"])
      .range(0, 9999);
    if (err) return setError(friendlyError(err));
    const t = {};
    (data || []).forEach((c) => {
      t[c.reseller_id] = t[c.reseller_id] || { accrued: 0, paid: 0 };
      t[c.reseller_id][c.status] += Number(c.amount || 0);
    });
    setTotals(t);
  }, []);

  const loadRows = useCallback(async () => {
    if (!sel) {
      setRows([]);
      setTotal(0);
      return;
    }
    setLoading(true);
    const from = (page - 1) * SIZE;
    const { data, count, error: err } = await supabase
      .from("reseller_commissions")
      .select("*", { count: "exact" })
      .eq("reseller_id", sel)
      .order("created_at", { ascending: false })
      .range(from, from + SIZE - 1);
    if (err) setError(friendlyError(err));
    const list = data || [];
    setRows(list);
    setTotal(count || 0);
    const ids = list.map((c) => c.payment_id);
    if (ids.length) {
      const p = await supabase.from("payments").select("id, receipt_number, paid_at").in("id", ids);
      setReceipts(Object.fromEntries((p.data || []).map((x) => [x.id, x])));
    }
    setLoading(false);
  }, [sel, page]);

  useEffect(() => {
    loadTotals();
  }, [loadTotals]);
  useEffect(() => {
    loadRows();
  }, [loadRows]);

  const pay = async () => {
    setBusy(true);
    setError("");
    const { data, error: err } = await supabase.rpc("pay_reseller_commission", { p_reseller: sel, p_to_wallet: toWallet });
    setBusy(false);
    if (err) return setError(friendlyError(err));
    setMsg(`${money(data)} commission paid ${toWallet ? "into the wallet" : "as a cash expense"}.`);
    setPaying(false);
    await Promise.all([loadTotals(), loadRows()]);
    onChanged && onChanged();
  };

  const selTotals = totals[sel] || { accrued: 0, paid: 0 };
  const pages = Math.max(1, Math.ceil(total / SIZE));

  return (
    <div className="space-y-6">
      {error && <div className="alert alert-danger show text-sm">{error}</div>}
      {msg && <div className="text-success text-sm">{msg}</div>}
      <div className="intro-y box p-5">
        <div className="text-base font-medium mb-4">Commission by reseller</div>
        {resellers.length === 0 ? (
          <div className="text-slate-500 text-sm">No resellers yet.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="table w-full text-sm">
              <thead>
                <tr><th>RESELLER</th><th className="text-right">ACCRUED (UNPAID)</th><th className="text-right">PAID</th><th></th></tr>
              </thead>
              <tbody>
                {resellers.map((r) => {
                  const t = totals[r.id] || { accrued: 0, paid: 0 };
                  return (
                    <tr key={r.id} className={classnames(sel === r.id && "bg-primary/5")}>
                      <td>{r.reseller_code} - {r.name}</td>
                      <td className="text-right">{money(t.accrued)}</td>
                      <td className="text-right">{money(t.paid)}</td>
                      <td className="text-right"><button type="button" className="text-primary text-xs" onClick={() => { setSel(r.id); setPage(1); setMsg(""); }}>View details</button></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {sel && (
        <div className="intro-y box p-5">
          <div className="flex flex-wrap items-center mb-4 gap-2">
            <div className="text-base font-medium">
              {resellers.find((r) => r.id === sel)?.name} - accrued {money(selTotals.accrued)}, paid {money(selTotals.paid)}
            </div>
            {canEdit && selTotals.accrued > 0 && (
              <button type="button" className="btn btn-primary shadow-md ml-auto" onClick={() => setPaying(true)}>Pay commission</button>
            )}
          </div>
          {loading ? (
            <div className="text-slate-500 text-sm">Loading...</div>
          ) : rows.length === 0 ? (
            <div className="text-slate-500 text-sm">No commission rows for this reseller.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="table w-full text-sm min-w-[650px]">
                <thead>
                  <tr><th>DATE</th><th>RECEIPT</th><th className="text-right">BASE</th><th className="text-right">%</th><th className="text-right">COMMISSION</th><th>STATUS</th></tr>
                </thead>
                <tbody>
                  {rows.map((c) => (
                    <tr key={c.id}>
                      <td className="whitespace-nowrap">{formatDate(receipts[c.payment_id]?.paid_at || c.created_at)}</td>
                      <td>{receipts[c.payment_id]?.receipt_number || "—"}</td>
                      <td className="text-right">{money(c.base_amount)}</td>
                      <td className="text-right">{Number(c.percent)}%</td>
                      <td className="text-right">{money(c.amount)}</td>
                      <td><span className={classnames("py-1 px-2 rounded-full text-xs font-medium", BADGE[c.status])}>{titleCase(c.status)}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <div className="flex items-center mt-3 text-sm text-slate-500">
            <span>{total} row(s) - page {page} of {pages}</span>
            <div className="ml-auto flex gap-2">
              <button type="button" className="btn btn-outline-secondary btn-sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>Prev</button>
              <button type="button" className="btn btn-outline-secondary btn-sm" disabled={page >= pages} onClick={() => setPage(page + 1)}>Next</button>
            </div>
          </div>
        </div>
      )}

      {paying && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60" onClick={() => !busy && setPaying(false)}></div>
          <div className="relative box w-full max-w-md p-6">
            <h2 className="text-lg font-medium mb-3">Pay commission</h2>
            <div className="text-sm mb-3">All accrued commission ({money(selTotals.accrued)}) will be paid out.</div>
            <label className="flex items-center text-sm mb-2">
              <input type="radio" className="form-check-input" checked={toWallet} onChange={() => setToWallet(true)} />
              <span className="ml-2">Add to the reseller's wallet (default)</span>
            </label>
            <label className="flex items-center text-sm">
              <input type="radio" className="form-check-input" checked={!toWallet} onChange={() => setToWallet(false)} />
              <span className="ml-2">Pay as a cash expense</span>
            </label>
            <div className="flex justify-end gap-2 mt-5">
              <button type="button" className="btn btn-outline-secondary" disabled={busy} onClick={() => setPaying(false)}>Cancel</button>
              <button type="button" className="btn btn-primary" disabled={busy} onClick={pay}>{busy ? "Paying..." : "Confirm"}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default CommissionTab;
