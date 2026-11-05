import { Lucide, Tippy } from "@/base-components";
import classnames from "classnames";
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { can } from "@/lib/session";
import { friendlyError } from "@/lib/errors";
import { formatDate, formatDateTime, money } from "@/lib/format";
import {
  ErrorBanner,
  Modal,
  Pagination,
  PaymentRecordBadge,
  StatCard,
  likeSafe,
  methodLabel,
  useSession,
  usePaymentMethods,
  useToast,
  DB_METHODS,
} from "./components/shared";
import {
  AdvancePaymentDialog,
  ReceiptModal,
  ReceivePaymentDialog,
  RefundDialog,
} from "./components/PaymentDialogs";

const STATUSES = ["pending", "confirmed", "rejected", "refunded"];
const EMPTY_FILTERS = { search: "", status: "", method: "", area: "", from: "", to: "" };

function Main() {
  const session = useSession();
  const { methods, confirmationRequired } = usePaymentMethods();
  const toast = useToast();

  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(10);
  const [draft, setDraft] = useState(EMPTY_FILTERS);
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [areas, setAreas] = useState([]);
  const [stats, setStats] = useState({ today: 0, month: 0, pending: 0, partial: 0 });
  const [credits, setCredits] = useState([]);
  const [reload, setReload] = useState(0);

  const [dialog, setDialog] = useState(null); // {type:'receive'|'split'|'advance'|'refund'|'receipt'|'confirm'|'reject', payment?}
  const [acting, setActing] = useState(false);

  const canCreate = can(session, "payments", "create");
  const canEdit = can(session, "payments", "edit");

  const refresh = useCallback(() => setReload((n) => n + 1), []);

  // Static lookups
  useEffect(() => {
    supabase
      .from("areas")
      .select("id, name")
      .order("name")
      .then(({ data }) => setAreas(data || []));
  }, []);

  // Stats + advance balances
  useEffect(() => {
    let alive = true;
    (async () => {
      const [dash, pend, part, cred] = await Promise.all([
        supabase.rpc("get_isp_dashboard"),
        supabase.from("payments").select("id", { count: "exact", head: true }).eq("status", "pending"),
        supabase.from("v_invoice_summary").select("id", { count: "exact", head: true }).eq("payment_status", "partial").neq("invoice_status", "cancelled"),
        supabase
          .from("v_subscriber_overview")
          .select("id, subscriber_code, full_name, phone, credit_balance")
          .gt("credit_balance", 0)
          .order("credit_balance", { ascending: false })
          .limit(20),
      ]);
      if (!alive) return;
      const c = dash.data?.collections || {};
      setStats({ today: c.today || 0, month: c.this_month || 0, pending: pend.count || 0, partial: part.count || 0 });
      setCredits(cred.data || []);
    })();
    return () => {
      alive = false;
    };
  }, [reload]);

  // Ledger
  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      setError("");
      let q = supabase.from("v_payment_ledger").select("*", { count: "exact" });
      const s = likeSafe(filters.search);
      if (s) {
        q = q.or(
          [
            "receipt_number",
            "subscriber_name",
            "subscriber_phone",
            "subscriber_code",
            "invoice_number",
            "reference_no",
          ]
            .map((c) => `${c}.ilike.%${s}%`)
            .join(",")
        );
      }
      if (filters.status) q = q.eq("status", filters.status);
      if (filters.method) q = q.eq("method", filters.method);
      if (filters.area) q = q.eq("area_name", filters.area);
      if (filters.from) q = q.gte("paid_at", new Date(`${filters.from}T00:00:00`).toISOString());
      if (filters.to) q = q.lte("paid_at", new Date(`${filters.to}T23:59:59.999`).toISOString());
      const { data, count, error: e } = await q
        .order("paid_at", { ascending: false })
        .range(page * pageSize, page * pageSize + pageSize - 1);
      if (!alive) return;
      if (e) setError(friendlyError(e));
      setRows(data || []);
      setTotal(count || 0);
      setLoading(false);
    })();
    return () => {
      alive = false;
    };
  }, [filters, page, pageSize, reload]);

  const applyFilters = () => {
    setPage(0);
    setFilters({ ...draft, search: draft.search.trim() });
  };
  const resetFilters = () => {
    setDraft(EMPTY_FILTERS);
    setFilters(EMPTY_FILTERS);
    setPage(0);
  };

  const done = (message) => {
    setDialog(null);
    toast.show(message);
    refresh();
  };

  const setStatus = async (payment, status) => {
    setActing(true);
    const { error: e } = await supabase.from("payments").update({ status }).eq("id", payment.id);
    setActing(false);
    setDialog(null);
    if (e) toast.show(friendlyError(e), "error");
    else {
      toast.show(`Receipt ${payment.receipt_number} ${status}.`);
      refresh();
    }
  };

  const canRefund = (p) =>
    canEdit &&
    p.status === "confirmed" &&
    p.method !== "advance_credit" &&
    Number(p.amount) - Number(p.refunded_amount || 0) > 0;

  const mcols = Array.from(new Set([...DB_METHODS, ...rows.map((r) => r.method)])).filter((m) => m !== "advance_credit");

  return (
    <>
      <div className="grid grid-cols-12 gap-6">
        <div className="col-span-12 intro-y flex flex-col lg:flex-row lg:items-center">
          <div>
            <h2 className="text-lg font-medium">Payments</h2>
            <div className="text-slate-500 mt-1">Receive, split, refund and review subscriber payments.</div>
          </div>
          {canCreate && (
            <div className="flex flex-wrap gap-2 lg:ml-auto mt-4 lg:mt-0">
              <button type="button" onClick={() => setDialog({ type: "receive" })} className="btn btn-primary shadow-md">
                <Lucide icon="Plus" className="w-4 h-4 mr-2" /> Receive Payment
              </button>
              <button type="button" onClick={() => setDialog({ type: "split" })} className="btn btn-outline-secondary">
                <Lucide icon="Shuffle" className="w-4 h-4 mr-2" /> Split Payment
              </button>
              <button type="button" onClick={() => setDialog({ type: "advance" })} className="btn btn-outline-secondary">
                <Lucide icon="PiggyBank" className="w-4 h-4 mr-2" /> Advance Payment
              </button>
            </div>
          )}
        </div>

        <div className="col-span-12 intro-y">
          <div className="box p-5">
            <div className="relative text-slate-500">
              <Lucide icon="Search" className="w-5 h-5 z-10 absolute my-auto inset-y-0 ml-4 left-0" />
              <input
                type="text"
                value={draft.search}
                onChange={(e) => setDraft({ ...draft, search: e.target.value })}
                onKeyDown={(e) => e.key === "Enter" && applyFilters()}
                className="form-control w-full box pl-12 py-3 text-base"
                placeholder="Search by receipt no, subscriber name / ID / phone, invoice no or reference"
              />
            </div>
            <div className="grid grid-cols-12 gap-3 mt-4">
              <div className="col-span-12 sm:col-span-6 lg:col-span-4">
                <label className="text-xs text-slate-500">Payment Status</label>
                <select className="form-select box mt-1 w-full" value={draft.status} onChange={(e) => setDraft({ ...draft, status: e.target.value })}>
                  <option value="">All Statuses</option>
                  {STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {s[0].toUpperCase() + s.slice(1)}
                    </option>
                  ))}
                </select>
              </div>
              <div className="col-span-12 sm:col-span-6 lg:col-span-4">
                <label className="text-xs text-slate-500">Payment Method</label>
                <select className="form-select box mt-1 w-full" value={draft.method} onChange={(e) => setDraft({ ...draft, method: e.target.value })}>
                  <option value="">All Methods</option>
                  {mcols.map((m) => (
                    <option key={m} value={m}>
                      {methodLabel(m)}
                    </option>
                  ))}
                  <option value="advance_credit">Advance Credit (auto)</option>
                </select>
              </div>
              <div className="col-span-12 sm:col-span-6 lg:col-span-4">
                <label className="text-xs text-slate-500">Area</label>
                <select className="form-select box mt-1 w-full" value={draft.area} onChange={(e) => setDraft({ ...draft, area: e.target.value })}>
                  <option value="">All Areas</option>
                  {areas.map((a) => (
                    <option key={a.id} value={a.name}>
                      {a.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="col-span-12 sm:col-span-6 lg:col-span-4">
                <label className="text-xs text-slate-500">Date From</label>
                <input type="date" className="form-control box mt-1 w-full" value={draft.from} onChange={(e) => setDraft({ ...draft, from: e.target.value })} />
              </div>
              <div className="col-span-12 sm:col-span-6 lg:col-span-4">
                <label className="text-xs text-slate-500">Date To</label>
                <input type="date" className="form-control box mt-1 w-full" value={draft.to} onChange={(e) => setDraft({ ...draft, to: e.target.value })} />
              </div>
              <div className="col-span-12 lg:col-span-4 flex items-end gap-2">
                <button type="button" onClick={applyFilters} className="btn btn-primary w-full">
                  Search
                </button>
                <button type="button" onClick={resetFilters} className="btn btn-outline-secondary w-full">
                  Reset
                </button>
              </div>
            </div>
          </div>
        </div>

        <div className="col-span-12 sm:col-span-6 xl:col-span-3 intro-y">
          <StatCard icon="CreditCard" tone="text-success" value={money(stats.today)} label="Today's Collection" />
        </div>
        <div className="col-span-12 sm:col-span-6 xl:col-span-3 intro-y">
          <StatCard icon="Calendar" value={money(stats.month)} label="This Month Collection" />
        </div>
        <div className="col-span-12 sm:col-span-6 xl:col-span-3 intro-y">
          <StatCard icon="Clock" tone="text-pending" value={stats.pending} label="Payments Awaiting Confirmation" />
        </div>
        <div className="col-span-12 sm:col-span-6 xl:col-span-3 intro-y">
          <StatCard icon="AlertCircle" tone="text-warning" value={stats.partial} label="Partially Paid Invoices" />
        </div>

        <div className="col-span-12 mt-2">
          <div className="intro-y flex items-center h-10">
            <h2 className="text-lg font-medium truncate mr-5">Payment Records</h2>
            <div className="ml-auto text-slate-500 text-sm">
              {total} result{total === 1 ? "" : "s"}
            </div>
          </div>
          <ErrorBanner message={error} onClose={() => setError("")} />

          {loading ? (
            <div className="intro-y box p-10 mt-5 text-center text-slate-500">Loading payments...</div>
          ) : rows.length === 0 ? (
            <div className="intro-y box p-10 mt-5 flex flex-col items-center justify-center text-center">
              <Lucide icon="CreditCard" className="w-12 h-12 text-slate-300 mb-3" />
              <div className="text-slate-500 mb-5">No payment records found.</div>
              {canCreate && (
                <button type="button" onClick={() => setDialog({ type: "receive" })} className="btn btn-primary shadow-md">
                  <Lucide icon="Plus" className="w-4 h-4 mr-2" /> Receive Payment
                </button>
              )}
            </div>
          ) : (
            <div className="intro-y w-full overflow-x-auto mt-5">
              <table className="table table-report w-full min-w-[1240px]">
                <thead>
                  <tr>
                    <th className="whitespace-nowrap">RECEIPT NO</th>
                    <th className="whitespace-nowrap">SUBSCRIBER</th>
                    <th className="whitespace-nowrap">INVOICE NO</th>
                    <th className="text-right whitespace-nowrap">AMOUNT</th>
                    <th className="text-right whitespace-nowrap">REFUNDED</th>
                    <th className="text-right whitespace-nowrap">NET</th>
                    <th className="whitespace-nowrap">METHOD</th>
                    <th className="whitespace-nowrap">DATE</th>
                    <th className="text-center whitespace-nowrap">STATUS</th>
                    <th className="text-center whitespace-nowrap min-w-[180px]">ACTIONS</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((p) => {
                    const refunded = Number(p.refunded_amount || 0);
                    const net = Number(p.amount) - refunded;
                    return (
                      <tr key={p.id} className="intro-x">
                        <td className="whitespace-nowrap font-medium">{p.receipt_number}</td>
                        <td className="whitespace-nowrap">
                          {p.subscriber_name}
                          <div className="text-slate-500 text-xs">
                            {p.subscriber_code} | {p.subscriber_phone}
                          </div>
                        </td>
                        <td className="whitespace-nowrap">
                          {p.invoice_number || <span className="text-slate-500">Advance</span>}
                        </td>
                        <td className="text-right whitespace-nowrap">{money(p.amount)}</td>
                        <td className={classnames("text-right whitespace-nowrap", refunded > 0 && "text-danger")}>
                          {refunded > 0 ? money(refunded) : "—"}
                        </td>
                        <td className="text-right whitespace-nowrap font-medium">{money(net)}</td>
                        <td className="whitespace-nowrap">
                          {methodLabel(p.method)}
                          {p.reference_no && <div className="text-slate-500 text-xs">{p.reference_no}</div>}
                        </td>
                        <td className="whitespace-nowrap">{formatDateTime(p.paid_at)}</td>
                        <td className="w-40">
                          <div className="flex justify-center">
                            <PaymentRecordBadge status={p.status} />
                          </div>
                        </td>
                        <td className="table-report__action w-auto min-w-[180px] whitespace-nowrap">
                          <div className="flex justify-center items-center gap-3">
                            <Tippy tag="a" href="" content="View / Print Receipt" onClick={(e) => { e.preventDefault(); setDialog({ type: "receipt", payment: p }); }}>
                              <Lucide icon="Eye" className="w-4 h-4 text-slate-500 hover:text-primary" />
                            </Tippy>
                            {canEdit && p.status === "pending" && (
                              <>
                                <Tippy tag="a" href="" content="Confirm" onClick={(e) => { e.preventDefault(); setDialog({ type: "confirm", payment: p }); }}>
                                  <Lucide icon="CheckCircle" className="w-4 h-4 text-slate-500 hover:text-success" />
                                </Tippy>
                                <Tippy tag="a" href="" content="Reject" onClick={(e) => { e.preventDefault(); setDialog({ type: "reject", payment: p }); }}>
                                  <Lucide icon="XCircle" className="w-4 h-4 text-slate-500 hover:text-danger" />
                                </Tippy>
                              </>
                            )}
                            {canRefund(p) && (
                              <Tippy tag="a" href="" content="Refund" onClick={(e) => { e.preventDefault(); setDialog({ type: "refund", payment: p }); }}>
                                <Lucide icon="RotateCcw" className="w-4 h-4 text-slate-500 hover:text-danger" />
                              </Tippy>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          <Pagination page={page} pageSize={pageSize} total={total} onPage={setPage} onPageSize={(n) => { setPageSize(n); setPage(0); }} />
        </div>

        <div className="col-span-12 mt-2">
          <div className="intro-y flex items-center h-10">
            <h2 className="text-lg font-medium truncate mr-5">Advance Balances</h2>
            <div className="ml-auto text-slate-500 text-sm">Subscribers holding credit</div>
          </div>
          {credits.length === 0 ? (
            <div className="intro-y box p-6 mt-3 text-center text-slate-500 text-sm">No subscriber currently holds advance credit.</div>
          ) : (
            <div className="intro-y w-full overflow-x-auto mt-3">
              <table className="table table-report w-full">
                <thead>
                  <tr>
                    <th>SUBSCRIBER</th>
                    <th>PHONE</th>
                    <th className="text-right">CREDIT BALANCE</th>
                  </tr>
                </thead>
                <tbody>
                  {credits.map((c) => (
                    <tr key={c.id} className="intro-x">
                      <td className="whitespace-nowrap">
                        {c.full_name} <span className="text-slate-500 text-xs">{c.subscriber_code}</span>
                      </td>
                      <td className="whitespace-nowrap">{c.phone}</td>
                      <td className="text-right whitespace-nowrap text-success font-medium">{money(c.credit_balance)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {(dialog?.type === "receive" || dialog?.type === "split") && (
        <ReceivePaymentDialog
          methods={methods}
          confirmationRequired={confirmationRequired}
          initialSplit={dialog.type === "split"}
          onClose={() => setDialog(null)}
          onDone={done}
        />
      )}
      {dialog?.type === "advance" && (
        <AdvancePaymentDialog
          methods={methods}
          onClose={() => setDialog(null)}
          onChanged={(m) => {
            toast.show(m);
            refresh();
          }}
        />
      )}
      {dialog?.type === "refund" && (
        <RefundDialog payment={dialog.payment} methods={methods} onClose={() => setDialog(null)} onDone={done} />
      )}
      {dialog?.type === "receipt" && <ReceiptModal payment={dialog.payment} onClose={() => setDialog(null)} />}
      {(dialog?.type === "confirm" || dialog?.type === "reject") && (
        <Modal
          title={dialog.type === "confirm" ? "Confirm Payment" : "Reject Payment"}
          onClose={() => setDialog(null)}
          footer={
            <>
              <button type="button" className="btn btn-outline-secondary" onClick={() => setDialog(null)} disabled={acting}>
                Cancel
              </button>
              <button
                type="button"
                className={classnames("btn shadow-md", dialog.type === "confirm" ? "btn-success text-white" : "btn-danger")}
                disabled={acting}
                onClick={() => setStatus(dialog.payment, dialog.type === "confirm" ? "confirmed" : "rejected")}
              >
                {acting ? "Saving..." : dialog.type === "confirm" ? "Confirm" : "Reject"}
              </button>
            </>
          }
        >
          <div className="text-sm">
            {dialog.type === "confirm"
              ? "Confirming counts this money against the invoice."
              : "Rejecting marks the receipt as not received. Use Refund instead to give money back."}
            <div className="mt-3 font-medium">
              {dialog.payment.receipt_number} | {dialog.payment.subscriber_name} | {money(dialog.payment.amount)} |{" "}
              {formatDate(dialog.payment.paid_at)}
            </div>
          </div>
        </Modal>
      )}
      {toast.node}
    </>
  );
}

export default Main;
