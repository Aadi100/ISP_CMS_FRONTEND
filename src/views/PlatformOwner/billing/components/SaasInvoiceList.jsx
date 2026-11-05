import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { friendlyError } from "@/lib/errors";
import { money, formatDate, titleCase } from "@/lib/format";
import { StatusBadge, ErrorBanner, InfoBanner, Pagination } from "../../shared";
import PaymentModal from "./PaymentModal";
import InvoiceDetailModal from "./InvoiceDetailModal";

const PAGE_SIZE = 10;
const STATUSES = ["unpaid", "partial", "paid", "overdue", "cancelled"];

export default function SaasInvoiceList({ refreshKey, onChanged }) {
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [generating, setGenerating] = useState(false);
  const [payFor, setPayFor] = useState(null);
  const [detail, setDetail] = useState(null);
  const [cancelling, setCancelling] = useState("");

  useEffect(() => {
    const t = setTimeout(() => {
      setQuery(search.trim());
      setPage(0);
    }, 300);
    return () => clearTimeout(t);
  }, [search]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      let q = supabase
        .from("saas_invoices")
        .select("*, organizations!inner(name, slug), saas_plans(name)", { count: "exact" })
        .order("created_at", { ascending: false })
        .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1);
      if (status !== "all") q = q.eq("status", status);
      if (query) q = q.ilike("organizations.name", `%${query.replace(/[%*]/g, " ")}%`);
      const { data, error: err, count } = await q;
      if (err) throw err;
      setRows(data || []);
      setTotal(count || 0);
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setLoading(false);
    }
  }, [page, query, status, refreshKey]);

  useEffect(() => {
    load();
  }, [load]);

  const generate = async () => {
    setGenerating(true);
    setError("");
    setNotice("");
    try {
      const { data, error: err } = await supabase.rpc("generate_saas_invoices");
      if (err) throw err;
      setNotice(`${data ?? 0} invoice(s) created. Subscriptions already billed for the current cycle are skipped.`);
      onChanged();
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setGenerating(false);
    }
  };

  const cancel = async (inv) => {
    const reason = window.prompt(`Cancel invoice ${inv.invoice_number}? Enter a reason:`);
    if (reason === null) return;
    setCancelling(inv.id);
    setError("");
    setNotice("");
    try {
      const { error: err } = await supabase.rpc("cancel_saas_invoice", {
        p_invoice_id: inv.id,
        p_reason: reason.trim() || null,
      });
      if (err) throw err;
      setNotice(`Invoice ${inv.invoice_number} cancelled.`);
      onChanged();
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setCancelling("");
    }
  };

  const open = (inv) => !["paid", "cancelled"].includes(inv.status);

  return (
    <div className="intro-y box p-5">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-5">
        <div>
          <h3 className="text-base font-medium">SaaS invoices</h3>
          <div className="text-slate-500 text-sm mt-1">What each ISP owes the platform for its plan.</div>
        </div>
        <button className="btn btn-primary" onClick={generate} disabled={generating}>
          {generating ? "Generating..." : "Generate invoices now"}
        </button>
      </div>
      <ErrorBanner message={error} onClose={() => setError("")} />
      <InfoBanner message={notice} onClose={() => setNotice("")} />

      <div className="flex flex-col sm:flex-row gap-3 mb-5">
        <input className="form-control" placeholder="Search by ISP name..." value={search} onChange={(e) => setSearch(e.target.value)} />
        <select className="form-select sm:w-48" value={status} onChange={(e) => { setStatus(e.target.value); setPage(0); }}>
          <option value="all">All statuses</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>{titleCase(s)}</option>
          ))}
        </select>
      </div>

      <div className="overflow-x-auto">
        <table className="table table-report">
          <thead>
            <tr>
              <th>INVOICE</th><th>ISP</th><th>PERIOD</th><th>AMOUNT</th><th>BALANCE</th><th>DUE</th><th>STATUS</th><th>ACTION</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan="8" className="text-center">Loading invoices...</td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan="8" className="text-center">No SaaS invoices found. Use "Generate invoices now" to bill active subscriptions.</td></tr>
            ) : (
              rows.map((inv) => {
                const balance = inv.status === "cancelled" ? 0 : Number(inv.amount) - Number(inv.amount_paid);
                return (
                  <tr key={inv.id}>
                    <td className="font-medium">{inv.invoice_number}</td>
                    <td>
                      {inv.organizations?.name}
                      <div className="text-slate-500 text-xs">{inv.saas_plans?.name || "-"}</div>
                    </td>
                    <td className="text-xs">{formatDate(inv.period_start)} - {formatDate(inv.period_end)}</td>
                    <td>{money(inv.amount)}</td>
                    <td className={balance > 0 ? "text-danger" : ""}>{money(balance)}</td>
                    <td>{formatDate(inv.due_date)}</td>
                    <td><StatusBadge status={inv.status} /></td>
                    <td>
                      <div className="flex flex-wrap gap-2">
                        <button className="btn btn-sm btn-outline-secondary" onClick={() => setDetail(inv)}>Details</button>
                        {open(inv) && (
                          <button className="btn btn-sm btn-outline-primary" onClick={() => setPayFor(inv)}>Record payment</button>
                        )}
                        {inv.status !== "cancelled" && Number(inv.amount_paid) === 0 && (
                          <button className="btn btn-sm btn-outline-danger" disabled={cancelling === inv.id} onClick={() => cancel(inv)}>
                            Cancel
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
      <Pagination page={page} pageSize={PAGE_SIZE} total={total} onPage={setPage} />

      {payFor && (
        <PaymentModal
          invoice={payFor}
          onClose={() => setPayFor(null)}
          onDone={(msg) => {
            setPayFor(null);
            setNotice(msg);
            onChanged();
          }}
        />
      )}
      {detail && <InvoiceDetailModal invoice={detail} onClose={() => setDetail(null)} />}
    </div>
  );
}
