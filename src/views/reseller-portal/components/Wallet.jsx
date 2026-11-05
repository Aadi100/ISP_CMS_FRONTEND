import { useEffect, useState } from "react";
import classnames from "classnames";
import { supabase } from "@/lib/supabase";
import { friendlyError } from "@/lib/errors";
import { formatDate, formatDateTime, money, titleCase } from "@/lib/format";
import { ErrorBanner, Modal, Pagination } from "@/views/payments/components/shared";

const METHODS = ["bank_transfer", "cash", "online", "cheque", "jazzcash", "easypaisa"];
const REQ_TONE = {
  pending: "bg-pending/20 text-pending",
  approved: "bg-success/20 text-success",
  rejected: "bg-danger/20 text-danger",
};

function TopupDialog({ onClose, onDone }) {
  const [f, setF] = useState({ amount: "", method: "bank_transfer", reference: "", notes: "" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  const submit = async () => {
    if (!(Number(f.amount) > 0)) return setError("Enter an amount greater than zero.");
    setSaving(true);
    setError("");
    const { error: err } = await supabase.rpc("request_wallet_topup", {
      p_amount: Number(f.amount),
      p_method: f.method,
      p_reference: f.reference.trim() || null,
      p_notes: f.notes.trim() || null,
    });
    setSaving(false);
    if (err) return setError(friendlyError(err));
    onDone();
  };

  return (
    <Modal
      title="Request wallet top-up"
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn btn-outline-secondary" onClick={onClose}>Cancel</button>
          <button type="button" className="btn btn-primary" disabled={saving} onClick={submit}>
            {saving ? "Sending..." : "Send request"}
          </button>
        </>
      }
    >
      <ErrorBanner message={error} />
      <div className="grid grid-cols-1 gap-3">
        <div>
          <label className="form-label">Amount (PKR)</label>
          <input type="number" min="0" className="form-control" value={f.amount} onChange={set("amount")} />
        </div>
        <div>
          <label className="form-label">Payment method</label>
          <select className="form-select" value={f.method} onChange={set("method")}>
            {METHODS.map((m) => (
              <option key={m} value={m}>{titleCase(m)}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="form-label">Reference (transaction id / slip number)</label>
          <input className="form-control" value={f.reference} onChange={set("reference")} />
        </div>
        <div>
          <label className="form-label">Notes</label>
          <textarea className="form-control" rows={2} value={f.notes} onChange={set("notes")} />
        </div>
      </div>
    </Modal>
  );
}

function Ledger({ refreshKey }) {
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(10);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;
    setLoading(true);
    supabase
      .from("reseller_wallet_transactions")
      .select("id, txn_type, amount, balance_after, reference, notes, created_at", { count: "exact" })
      .order("created_at", { ascending: false })
      .range(page * pageSize, page * pageSize + pageSize - 1)
      .then(({ data, count, error: err }) => {
        if (!alive) return;
        if (err) setError(friendlyError(err));
        else {
          setError("");
          setRows(data || []);
          setTotal(count || 0);
        }
        setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [page, pageSize, refreshKey]);

  return (
    <div>
      <h2 className="text-lg font-medium mb-3">Wallet ledger</h2>
      <ErrorBanner message={error} onClose={() => setError("")} />
      <div className="box overflow-x-auto">
        <table className="table table-report">
          <thead>
            <tr>
              <th>Date</th>
              <th>Type</th>
              <th className="text-right">Amount</th>
              <th className="text-right">Balance after</th>
              <th>Reference</th>
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={5} className="text-center text-slate-500 py-6">Loading...</td></tr>}
            {!loading && rows.length === 0 && (
              <tr><td colSpan={5} className="text-center text-slate-500 py-6">No wallet transactions yet.</td></tr>
            )}
            {!loading &&
              rows.map((r) => (
                <tr key={r.id}>
                  <td className="whitespace-nowrap">{formatDateTime(r.created_at)}</td>
                  <td className="whitespace-nowrap">{titleCase(r.txn_type)}</td>
                  <td className={classnames("text-right whitespace-nowrap font-medium", Number(r.amount) < 0 ? "text-danger" : "text-success")}>
                    {Number(r.amount) > 0 ? "+" : ""}{money(r.amount)}
                  </td>
                  <td className="text-right whitespace-nowrap">{money(r.balance_after)}</td>
                  <td>{r.reference || r.notes || "-"}</td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
      <Pagination
        page={page}
        pageSize={pageSize}
        total={total}
        onPage={setPage}
        onPageSize={(n) => {
          setPageSize(n);
          setPage(0);
        }}
      />
    </div>
  );
}

function Requests({ refreshKey }) {
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const pageSize = 10;

  useEffect(() => {
    let alive = true;
    setLoading(true);
    supabase
      .from("wallet_topup_requests")
      .select("*", { count: "exact" })
      .order("created_at", { ascending: false })
      .range(page * pageSize, page * pageSize + pageSize - 1)
      .then(({ data, count, error: err }) => {
        if (!alive) return;
        if (err) setError(friendlyError(err));
        else {
          setError("");
          setRows(data || []);
          setTotal(count || 0);
        }
        setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [page, refreshKey]);

  return (
    <div className="mt-8">
      <h2 className="text-lg font-medium mb-3">My top-up requests</h2>
      <ErrorBanner message={error} onClose={() => setError("")} />
      <div className="box overflow-x-auto">
        <table className="table table-report">
          <thead>
            <tr>
              <th>Requested</th>
              <th className="text-right">Amount</th>
              <th>Method</th>
              <th>Reference</th>
              <th>Status</th>
              <th>ISP note</th>
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={6} className="text-center text-slate-500 py-6">Loading...</td></tr>}
            {!loading && rows.length === 0 && (
              <tr><td colSpan={6} className="text-center text-slate-500 py-6">No top-up requests yet.</td></tr>
            )}
            {!loading &&
              rows.map((r) => (
                <tr key={r.id}>
                  <td className="whitespace-nowrap">{formatDate(r.created_at)}</td>
                  <td className="text-right whitespace-nowrap">{money(r.amount)}</td>
                  <td className="whitespace-nowrap">{titleCase(r.method)}</td>
                  <td>{r.reference || "-"}</td>
                  <td>
                    <span className={classnames("py-1 px-2 rounded-full text-xs font-medium", REQ_TONE[r.status])}>
                      {titleCase(r.status)}
                    </span>
                  </td>
                  <td>{r.decision_note || "-"}</td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
      <Pagination page={page} pageSize={pageSize} total={total} onPage={setPage} onPageSize={() => {}} />
    </div>
  );
}

export default function Wallet({ summary, onChanged }) {
  const [open, setOpen] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  return (
    <div>
      <div className="flex items-center mb-4">
        <div>
          <div className="text-slate-500 text-xs">Current balance</div>
          <div className="text-2xl font-medium">{money(summary.wallet_balance)}</div>
        </div>
        <button type="button" className="btn btn-primary ml-auto" onClick={() => setOpen(true)}>
          Request top-up
        </button>
      </div>
      <Ledger refreshKey={refreshKey} />
      <Requests refreshKey={refreshKey} />
      {open && (
        <TopupDialog
          onClose={() => setOpen(false)}
          onDone={() => {
            setOpen(false);
            setRefreshKey((k) => k + 1);
            onChanged();
          }}
        />
      )}
    </div>
  );
}
