import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { friendlyError } from "@/lib/errors";
import { formatDate, formatDateTime, money } from "@/lib/format";
import {
  ErrorBanner,
  InvoicePaymentBadge,
  Modal,
  PaymentRecordBadge,
  Pagination,
  likeSafe,
  methodLabel,
} from "@/views/payments/components/shared";

function PayDialog({ invoice, walletBalance, onClose, onPaid }) {
  const [amount, setAmount] = useState(String(invoice.balance_due));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const submit = async () => {
    const n = Number(amount);
    if (!(n > 0)) return setError("Enter an amount greater than zero.");
    setSaving(true);
    setError("");
    const { error: err } = await supabase.rpc("pay_invoice_from_wallet", {
      p_invoice_id: invoice.id,
      p_amount: n,
    });
    setSaving(false);
    if (err) return setError(friendlyError(err));
    onPaid();
  };

  return (
    <Modal
      title={`Pay ${invoice.invoice_number} from wallet`}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn btn-outline-secondary" onClick={onClose}>Cancel</button>
          <button type="button" className="btn btn-primary" disabled={saving} onClick={submit}>
            {saving ? "Paying..." : "Pay from wallet"}
          </button>
        </>
      }
    >
      <ErrorBanner message={error} />
      <div className="text-sm mb-3">
        <div>Customer: <b>{invoice.subscriber_name}</b></div>
        <div>Balance due: <b>{money(invoice.balance_due)}</b></div>
        <div>Your wallet: <b>{money(walletBalance)}</b></div>
      </div>
      <label className="form-label">Amount (partial payment allowed)</label>
      <input
        type="number"
        min="0"
        step="0.01"
        max={invoice.balance_due}
        className="form-control"
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
      />
    </Modal>
  );
}

function InvoiceList({ initialSearch, walletBalance, onChanged }) {
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(10);
  const [search, setSearch] = useState(initialSearch || "");
  const [q, setQ] = useState(initialSearch || "");
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [paying, setPaying] = useState(null);
  const [tick, setTick] = useState(0);
  const [done, setDone] = useState("");

  useEffect(() => {
    const t = setTimeout(() => {
      setQ(search);
      setPage(0);
    }, 300);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    let query = supabase
      .from("v_invoice_summary")
      .select(
        "id, invoice_number, subscriber_name, subscriber_code, amount, amount_paid, balance_due, due_date, payment_status, invoice_status",
        { count: "exact" }
      )
      .neq("invoice_status", "cancelled")
      .order("due_date", { ascending: false })
      .range(page * pageSize, page * pageSize + pageSize - 1);
    if (status) query = query.eq("payment_status", status);
    const s = likeSafe(q);
    if (s) query = query.or(`subscriber_name.ilike.%${s}%,subscriber_code.ilike.%${s}%,invoice_number.ilike.%${s}%`);
    query.then(({ data, count, error: err }) => {
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
  }, [q, status, page, pageSize, tick]);

  return (
    <div>
      <div className="flex flex-col sm:flex-row gap-2 mb-4 sm:items-center">
        <input
          className="form-control sm:w-72"
          placeholder="Search customer or invoice number"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select
          className="form-select sm:w-48"
          value={status}
          onChange={(e) => {
            setStatus(e.target.value);
            setPage(0);
          }}
        >
          <option value="">All</option>
          <option value="unpaid">Unpaid</option>
          <option value="partial">Partial</option>
          <option value="overdue">Overdue</option>
          <option value="paid">Paid</option>
        </select>
        <div className="sm:ml-auto text-sm text-slate-500">
          Wallet balance: <b className="text-slate-700 dark:text-slate-300">{money(walletBalance)}</b>
        </div>
      </div>
      {done && <div className="alert alert-success mb-2 text-sm">{done}</div>}
      <ErrorBanner message={error} onClose={() => setError("")} />
      <div className="box overflow-x-auto">
        <table className="table table-report">
          <thead>
            <tr>
              <th>Invoice</th>
              <th>Customer</th>
              <th>Due</th>
              <th className="text-right">Amount</th>
              <th className="text-right">Balance</th>
              <th>Status</th>
              <th className="text-center">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td colSpan={7} className="text-center text-slate-500 py-6">Loading...</td></tr>
            )}
            {!loading && rows.length === 0 && (
              <tr><td colSpan={7} className="text-center text-slate-500 py-6">No invoices found.</td></tr>
            )}
            {!loading &&
              rows.map((r) => (
                <tr key={r.id}>
                  <td className="whitespace-nowrap font-medium">{r.invoice_number}</td>
                  <td className="whitespace-nowrap">
                    {r.subscriber_name}
                    <div className="text-slate-500 text-xs">{r.subscriber_code}</div>
                  </td>
                  <td className="whitespace-nowrap">{formatDate(r.due_date)}</td>
                  <td className="text-right whitespace-nowrap">{money(r.amount)}</td>
                  <td className="text-right whitespace-nowrap">{money(r.balance_due)}</td>
                  <td><InvoicePaymentBadge status={r.payment_status} /></td>
                  <td className="text-center">
                    {Number(r.balance_due) > 0 && (
                      <button
                        type="button"
                        className="btn btn-primary btn-sm whitespace-nowrap"
                        onClick={() => {
                          setDone("");
                          setPaying(r);
                        }}
                      >
                        Pay from wallet
                      </button>
                    )}
                  </td>
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
      {paying && (
        <PayDialog
          invoice={paying}
          walletBalance={walletBalance}
          onClose={() => setPaying(null)}
          onPaid={() => {
            setPaying(null);
            setDone("Payment recorded from your wallet.");
            setTick((t) => t + 1);
            onChanged();
          }}
        />
      )}
    </div>
  );
}

function Receipts({ refreshKey }) {
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
      .from("v_payment_ledger")
      .select("id, receipt_number, subscriber_name, invoice_number, amount, method, status, paid_at", { count: "exact" })
      .order("paid_at", { ascending: false })
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
      <h2 className="text-lg font-medium mb-3">Paid receipts</h2>
      <ErrorBanner message={error} onClose={() => setError("")} />
      <div className="box overflow-x-auto">
        <table className="table table-report">
          <thead>
            <tr>
              <th>Receipt</th>
              <th>Customer</th>
              <th>Invoice</th>
              <th>Method</th>
              <th className="text-right">Amount</th>
              <th>Date</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td colSpan={7} className="text-center text-slate-500 py-6">Loading...</td></tr>
            )}
            {!loading && rows.length === 0 && (
              <tr><td colSpan={7} className="text-center text-slate-500 py-6">No receipts yet.</td></tr>
            )}
            {!loading &&
              rows.map((r) => (
                <tr key={r.id}>
                  <td className="whitespace-nowrap font-medium">{r.receipt_number}</td>
                  <td className="whitespace-nowrap">{r.subscriber_name}</td>
                  <td className="whitespace-nowrap">{r.invoice_number || "-"}</td>
                  <td className="whitespace-nowrap">{methodLabel(r.method)}</td>
                  <td className="text-right whitespace-nowrap">{money(r.amount)}</td>
                  <td className="whitespace-nowrap">{formatDateTime(r.paid_at)}</td>
                  <td><PaymentRecordBadge status={r.status} /></td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
      <Pagination page={page} pageSize={pageSize} total={total} onPage={setPage} onPageSize={() => {}} />
    </div>
  );
}

export default function Invoices({ initialSearch, walletBalance, onChanged }) {
  const [refreshKey, setRefreshKey] = useState(0);
  return (
    <div>
      <InvoiceList
        initialSearch={initialSearch}
        walletBalance={walletBalance}
        onChanged={() => {
          setRefreshKey((k) => k + 1);
          onChanged();
        }}
      />
      <Receipts refreshKey={refreshKey} />
    </div>
  );
}
