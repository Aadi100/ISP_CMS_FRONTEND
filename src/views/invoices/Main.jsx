import { Lucide, Tippy } from "@/base-components";
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { can } from "@/lib/session";
import { friendlyError } from "@/lib/errors";
import { formatDate, money, titleCase } from "@/lib/format";
import {
  ErrorBanner,
  InvoicePaymentBadge,
  InvoiceStatusBadge,
  Pagination,
  likeSafe,
  useOrganization,
  usePaymentMethods,
  useSession,
  useToast,
} from "@/views/payments/components/shared";
import { ReceivePaymentDialog } from "@/views/payments/components/PaymentDialogs";
import { CreateInvoiceDialog, InvoiceDetailModal, printInvoice } from "./components/InvoiceDialogs";

const PAYMENT_STATUSES = ["unpaid", "partial", "paid", "overdue"];
const INVOICE_STATUSES = ["generated", "sent", "cancelled"];
const TYPES = ["monthly", "installation", "reconnection", "adjustment", "other"];
const EMPTY = { search: "", payment: "", status: "", type: "", from: "", to: "", area: "" };

function Main() {
  const session = useSession();
  const org = useOrganization();
  const { methods, confirmationRequired } = usePaymentMethods();
  const toast = useToast();

  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(10);
  const [draft, setDraft] = useState(EMPTY);
  const [filters, setFilters] = useState(EMPTY);
  const [areas, setAreas] = useState([]);
  const [reload, setReload] = useState(0);

  const [detailId, setDetailId] = useState(null);
  const [payFor, setPayFor] = useState(null);
  const [creating, setCreating] = useState(false);

  const refresh = useCallback(() => setReload((n) => n + 1), []);
  const canCreate = can(session, "invoices", "create");
  const canEdit = can(session, "invoices", "edit");
  const canPay = can(session, "payments", "create");

  useEffect(() => {
    supabase
      .from("areas")
      .select("id, name")
      .order("name")
      .then(({ data }) => setAreas(data || []));
  }, []);

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      setError("");
      let q = supabase.from("v_invoice_summary").select("*", { count: "exact" });
      const s = likeSafe(filters.search);
      if (s) {
        q = q.or(
          ["invoice_number", "subscriber_name", "subscriber_phone", "subscriber_code"].map((c) => `${c}.ilike.%${s}%`).join(",")
        );
      }
      if (filters.payment) q = q.eq("payment_status", filters.payment);
      if (filters.status) q = q.eq("invoice_status", filters.status);
      if (filters.type) q = q.eq("invoice_type", filters.type);
      if (filters.area) q = q.eq("area_name", filters.area);
      if (filters.from) q = q.gte("billing_month", filters.from);
      if (filters.to) q = q.lte("billing_month", filters.to);
      const { data, count, error: e } = await q
        .order("billing_month", { ascending: false })
        .order("created_at", { ascending: false })
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

  const apply = () => {
    setPage(0);
    setFilters({ ...draft, search: draft.search.trim() });
  };
  const reset = () => {
    setDraft(EMPTY);
    setFilters(EMPTY);
    setPage(0);
  };

  return (
    <>
      <div className="grid grid-cols-12 gap-6">
        <div className="col-span-12 intro-y flex flex-col lg:flex-row lg:items-center">
          <div>
            <h2 className="text-lg font-medium">Invoices</h2>
            <div className="text-slate-500 mt-1">View, print and manage subscriber invoices.</div>
          </div>
          {canCreate && (
            <div className="flex flex-wrap gap-2 lg:ml-auto mt-4 lg:mt-0">
              <button type="button" className="btn btn-primary shadow-md" onClick={() => setCreating(true)}>
                <Lucide icon="Plus" className="w-4 h-4 mr-2" /> Create Invoice
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
                onKeyDown={(e) => e.key === "Enter" && apply()}
                className="form-control w-full box pl-12 py-3 text-base"
                placeholder="Search by invoice number, subscriber name, subscriber ID or phone"
              />
            </div>
            <div className="grid grid-cols-12 gap-3 mt-4">
              <div className="col-span-12 sm:col-span-6 lg:col-span-3">
                <label className="text-xs text-slate-500">Payment Status</label>
                <select className="form-select box mt-1 w-full" value={draft.payment} onChange={(e) => setDraft({ ...draft, payment: e.target.value })}>
                  <option value="">All Payment Statuses</option>
                  {PAYMENT_STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {titleCase(s)}
                    </option>
                  ))}
                </select>
              </div>
              <div className="col-span-12 sm:col-span-6 lg:col-span-3">
                <label className="text-xs text-slate-500">Invoice Status</label>
                <select className="form-select box mt-1 w-full" value={draft.status} onChange={(e) => setDraft({ ...draft, status: e.target.value })}>
                  <option value="">All Invoice Statuses</option>
                  {INVOICE_STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {titleCase(s)}
                    </option>
                  ))}
                </select>
              </div>
              <div className="col-span-12 sm:col-span-6 lg:col-span-3">
                <label className="text-xs text-slate-500">Type</label>
                <select className="form-select box mt-1 w-full" value={draft.type} onChange={(e) => setDraft({ ...draft, type: e.target.value })}>
                  <option value="">All Types</option>
                  {TYPES.map((s) => (
                    <option key={s} value={s}>
                      {titleCase(s)}
                    </option>
                  ))}
                </select>
              </div>
              <div className="col-span-12 sm:col-span-6 lg:col-span-3">
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
              <div className="col-span-12 sm:col-span-6 lg:col-span-3">
                <label className="text-xs text-slate-500">Billing period from</label>
                <input type="date" className="form-control box mt-1 w-full" value={draft.from} onChange={(e) => setDraft({ ...draft, from: e.target.value })} />
              </div>
              <div className="col-span-12 sm:col-span-6 lg:col-span-3">
                <label className="text-xs text-slate-500">Billing period to</label>
                <input type="date" className="form-control box mt-1 w-full" value={draft.to} onChange={(e) => setDraft({ ...draft, to: e.target.value })} />
              </div>
              <div className="col-span-12 lg:col-span-6 flex items-end justify-end gap-2">
                <button type="button" onClick={apply} className="btn btn-primary px-8">
                  Search
                </button>
                <button type="button" onClick={reset} className="btn btn-outline-secondary px-8">
                  Reset
                </button>
              </div>
            </div>
          </div>
        </div>

        <div className="col-span-12 mt-2">
          <div className="intro-y flex items-center h-10">
            <h2 className="text-lg font-medium truncate mr-5">Invoice Records</h2>
            <div className="ml-auto text-slate-500 text-sm">
              {total} result{total === 1 ? "" : "s"}
            </div>
          </div>
          <ErrorBanner message={error} onClose={() => setError("")} />

          {loading ? (
            <div className="intro-y box p-10 mt-5 text-center text-slate-500">Loading invoices...</div>
          ) : rows.length === 0 ? (
            <div className="intro-y box p-10 mt-5 flex flex-col items-center justify-center text-center">
              <Lucide icon="FileText" className="w-12 h-12 text-slate-300 mb-3" />
              <div className="text-slate-500">No invoices found.</div>
            </div>
          ) : (
            <div className="intro-y w-full overflow-x-auto mt-5">
              <table className="table table-report w-full min-w-[1240px]">
                <thead>
                  <tr>
                    <th className="whitespace-nowrap">INVOICE NO</th>
                    <th className="whitespace-nowrap">SUBSCRIBER</th>
                    <th className="whitespace-nowrap">TYPE</th>
                    <th className="whitespace-nowrap">BILLING PERIOD</th>
                    <th className="text-right whitespace-nowrap">AMOUNT</th>
                    <th className="text-right whitespace-nowrap">BALANCE</th>
                    <th className="whitespace-nowrap">DUE DATE</th>
                    <th className="text-center whitespace-nowrap">PAYMENT STATUS</th>
                    <th className="text-center whitespace-nowrap">INVOICE STATUS</th>
                    <th className="text-center whitespace-nowrap min-w-[140px]">ACTIONS</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((inv) => (
                    <tr key={inv.id} className="intro-x">
                      <td className="whitespace-nowrap font-medium">{inv.invoice_number}</td>
                      <td className="whitespace-nowrap">
                        {inv.subscriber_name}
                        <div className="text-slate-500 text-xs">
                          {inv.subscriber_code} | {inv.subscriber_phone}
                        </div>
                      </td>
                      <td className="whitespace-nowrap">{titleCase(inv.invoice_type)}</td>
                      <td className="whitespace-nowrap">
                        {formatDate(inv.billing_month)}
                        {inv.period_end && <div className="text-slate-500 text-xs">to {formatDate(inv.period_end)}</div>}
                      </td>
                      <td className="text-right whitespace-nowrap">{money(inv.amount)}</td>
                      <td className={`text-right whitespace-nowrap ${Number(inv.balance_due) > 0 ? "text-danger" : "text-success"}`}>
                        {money(inv.balance_due)}
                      </td>
                      <td className="whitespace-nowrap">
                        {formatDate(inv.due_date)}
                        {inv.promised_date && <div className="text-warning text-xs">Promised {formatDate(inv.promised_date)}</div>}
                      </td>
                      <td className="w-40">
                        <div className="flex justify-center">
                          <InvoicePaymentBadge status={inv.payment_status} />
                        </div>
                      </td>
                      <td className="w-32">
                        <div className="flex justify-center">
                          <InvoiceStatusBadge status={inv.invoice_status} />
                        </div>
                      </td>
                      <td className="table-report__action w-auto whitespace-nowrap">
                        <div className="flex justify-center items-center gap-3">
                          <Tippy tag="a" href="" content="View details" onClick={(e) => { e.preventDefault(); setDetailId(inv.id); }}>
                            <Lucide icon="Eye" className="w-4 h-4 text-slate-500 hover:text-primary" />
                          </Tippy>
                          <Tippy tag="a" href="" content="Print" onClick={(e) => { e.preventDefault(); printInvoice(org, inv); }}>
                            <Lucide icon="Printer" className="w-4 h-4 text-slate-500 hover:text-primary" />
                          </Tippy>
                          {canPay && inv.invoice_status !== "cancelled" && Number(inv.balance_due) > 0 && (
                            <Tippy tag="a" href="" content="Record payment" onClick={(e) => { e.preventDefault(); setPayFor(inv); }}>
                              <Lucide icon="DollarSign" className="w-4 h-4 text-slate-500 hover:text-success" />
                            </Tippy>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <Pagination page={page} pageSize={pageSize} total={total} onPage={setPage} onPageSize={(n) => { setPageSize(n); setPage(0); }} />
        </div>
      </div>

      {detailId && (
        <InvoiceDetailModal
          invoiceId={detailId}
          canPay={canPay}
          canEdit={canEdit}
          onClose={() => setDetailId(null)}
          onRecordPayment={(inv) => setPayFor(inv)}
          onChanged={(m) => {
            toast.show(m);
            refresh();
          }}
        />
      )}
      {payFor && (
        <ReceivePaymentDialog
          methods={methods}
          confirmationRequired={confirmationRequired}
          invoice={payFor}
          onClose={() => setPayFor(null)}
          onDone={(m) => {
            setPayFor(null);
            toast.show(m);
            refresh();
            if (detailId) {
              const id = detailId;
              setDetailId(null);
              setTimeout(() => setDetailId(id), 0);
            }
          }}
        />
      )}
      {creating && (
        <CreateInvoiceDialog
          onClose={() => setCreating(false)}
          onCreated={(m) => {
            setCreating(false);
            toast.show(m);
            refresh();
          }}
        />
      )}
      {toast.node}
    </>
  );
}

export default Main;
