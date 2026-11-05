import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { friendlyError } from "@/lib/errors";
import { money, formatDateTime } from "@/lib/format";
import { ErrorBanner, Modal, Pagination, StatCard, likeSafe } from "@/views/payments/components/shared";
import CollectDialog from "./CollectDialog";
import CustomerCard from "./CustomerCard";
import { HandoverBadge } from "./HandoverBadge";

export default function AgentView({ initialSummary, onToast }) {
  const [summary, setSummary] = useState(initialSummary);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [owing, setOwing] = useState(false);
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(10);
  const [customers, setCustomers] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [reloadKey, setReloadKey] = useState(0);
  const [target, setTarget] = useState(null);
  const [handovers, setHandovers] = useState([]);
  const [hoDialog, setHoDialog] = useState(false);
  const [hoForm, setHoForm] = useState({ amount: "", notes: "" });
  const [hoSaving, setHoSaving] = useState(false);

  const onError = useCallback((m) => setError(m), []);

  const loadSummary = useCallback(async () => {
    const { data, error: err } = await supabase.rpc("get_my_collection_summary");
    if (err) setError(friendlyError(err));
    else if (data) setSummary(data);
  }, []);

  const loadHandovers = useCallback(async () => {
    const { data, error: err } = await supabase
      .from("collector_handovers")
      .select("*")
      .order("handed_at", { ascending: false })
      .limit(20);
    if (err) setError(friendlyError(err));
    else setHandovers(data || []);
  }, []);

  const loadCustomers = useCallback(async () => {
    setLoading(true);
    try {
      let q = supabase
        .from("v_subscriber_overview")
        .select("id,subscriber_code,full_name,phone,address,area_name,outstanding_balance", { count: "exact" });
      const s = likeSafe(search);
      if (s) q = q.or(`full_name.ilike.%${s}%,phone.ilike.%${s}%,subscriber_code.ilike.%${s}%`);
      if (owing) q = q.gt("outstanding_balance", 0);
      const { data, count, error: err } = await q
        .order("full_name")
        .order("id")
        .range(page * pageSize, page * pageSize + pageSize - 1);
      if (err) throw err;
      setCustomers(data || []);
      setTotal(count || 0);
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setLoading(false);
    }
  }, [search, owing, page, pageSize]);

  useEffect(() => {
    const t = setTimeout(loadCustomers, 250);
    return () => clearTimeout(t);
  }, [loadCustomers, reloadKey]);
  useEffect(() => setPage(0), [search, owing, pageSize]);
  useEffect(() => {
    loadHandovers();
  }, [loadHandovers]);

  const afterWrite = (msg) => {
    setTarget(null);
    onToast(msg);
    setReloadKey((k) => k + 1);
    loadSummary();
  };

  const submitHandover = async () => {
    const amount = Number(hoForm.amount);
    if (!(amount > 0)) return setError("Enter an amount greater than zero.");
    setHoSaving(true);
    try {
      const { error: err } = await supabase.rpc("submit_handover", {
        p_amount: amount,
        p_notes: hoForm.notes.trim() || null,
      });
      if (err) throw err;
      setHoDialog(false);
      setHoForm({ amount: "", notes: "" });
      setError("");
      onToast("Handover submitted for confirmation.");
      loadSummary();
      loadHandovers();
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setHoSaving(false);
    }
  };

  const s = summary || {};
  return (
    <div>
      <ErrorBanner message={error} onClose={() => setError("")} />
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-5">
        <StatCard icon="Wallet" tone="text-success" value={money(s.cash_in_hand)} label="Cash in hand" />
        <StatCard icon="TrendingUp" value={money(s.collected_month)} label="Collected this month" />
        <StatCard icon="Percent" tone="text-pending" value={money(s.commission_month)} label="Commission this month" />
        <StatCard icon="Users" value={s.customers_assigned ?? 0} label="Customers" />
        <StatCard icon="AlertCircle" tone="text-danger" value={money(s.outstanding_assigned)} label="Outstanding" />
      </div>

      <div className="flex flex-wrap items-center gap-2 mb-3">
        <h2 className="text-lg font-medium mr-auto">My customers</h2>
        <button type="button" className="btn btn-primary" onClick={() => setHoDialog(true)}>
          Hand over cash
        </button>
      </div>
      <div className="flex flex-wrap gap-2 mb-3">
        <input
          className="form-control flex-1 min-w-[12rem]"
          placeholder="Search name, phone, code"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" className="form-check-input" checked={owing} onChange={(e) => setOwing(e.target.checked)} />
          Outstanding only
        </label>
      </div>
      <div className="grid gap-3">
        {loading && <div className="box p-5 text-center text-slate-500">Loading...</div>}
        {!loading && customers.length === 0 && (
          <div className="box p-5 text-center text-slate-500">No customers found.</div>
        )}
        {customers.map((c) => (
          <CustomerCard
            key={c.id}
            customer={c}
            reloadKey={reloadKey}
            onError={onError}
            onCollect={(invoice) => setTarget({ invoice })}
            onAdvance={(subscriber) => setTarget({ subscriber })}
          />
        ))}
      </div>
      <Pagination page={page} pageSize={pageSize} total={total} onPage={setPage} onPageSize={setPageSize} />

      <h2 className="text-lg font-medium mt-8 mb-3">My handovers</h2>
      <div className="box p-4 overflow-x-auto">
        <table className="table">
          <thead>
            <tr>
              <th>Number</th>
              <th>Date</th>
              <th className="text-right">Amount</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {handovers.length === 0 && (
              <tr>
                <td colSpan={4} className="text-center text-slate-500 py-6">
                  No handovers yet.
                </td>
              </tr>
            )}
            {handovers.map((h) => (
              <tr key={h.id}>
                <td>{h.handover_number}</td>
                <td className="whitespace-nowrap">{formatDateTime(h.handed_at)}</td>
                <td className="text-right">{money(h.amount)}</td>
                <td>
                  <HandoverBadge status={h.status} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {target && <CollectDialog target={target} onClose={() => setTarget(null)} onDone={afterWrite} />}

      {hoDialog && (
        <Modal
          title="Hand over cash"
          onClose={() => setHoDialog(false)}
          footer={
            <>
              <button type="button" className="btn btn-outline-secondary" onClick={() => setHoDialog(false)}>
                Cancel
              </button>
              <button type="button" className="btn btn-primary" disabled={hoSaving} onClick={submitHandover}>
                {hoSaving ? "Saving..." : "Submit"}
              </button>
            </>
          }
        >
          <ErrorBanner message={error} onClose={() => setError("")} />
          <div className="text-sm text-slate-500 mb-3">Cash in hand: {money(s.cash_in_hand)}</div>
          <label className="form-label">Amount (PKR)</label>
          <input
            type="number"
            min="0"
            className="form-control"
            value={hoForm.amount}
            onChange={(e) => setHoForm({ ...hoForm, amount: e.target.value })}
          />
          <label className="form-label mt-3">Notes</label>
          <textarea
            className="form-control"
            rows={2}
            value={hoForm.notes}
            onChange={(e) => setHoForm({ ...hoForm, notes: e.target.value })}
          />
        </Modal>
      )}
    </div>
  );
}
