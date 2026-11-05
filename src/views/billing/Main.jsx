import { Lucide, Tippy } from "@/base-components";
import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { can } from "@/lib/session";
import { friendlyError } from "@/lib/errors";
import { formatDate, money, titleCase } from "@/lib/format";
import {
  ErrorBanner,
  InvoicePaymentBadge,
  Pagination,
  StatCard,
  addDaysISO,
  fetchAll,
  todayISO,
  usePaymentMethods,
  useSession,
  useToast,
} from "@/views/payments/components/shared";
import { ReceivePaymentDialog } from "@/views/payments/components/PaymentDialogs";

const monthStart = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;

function cycleOptions() {
  const out = [];
  const now = new Date();
  for (let i = 0; i < 12; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    out.push({ value: monthStart(d), label: d.toLocaleDateString("en-GB", { month: "long", year: "numeric" }) });
  }
  return out;
}

const sum = (rows, f) => rows.reduce((s, r) => s + (Number(r[f]) || 0), 0);

function Main() {
  const session = useSession();
  const { methods, confirmationRequired } = usePaymentMethods();
  const toast = useToast();
  const options = useMemo(cycleOptions, []);
  const [cycle, setCycle] = useState(options[0].value);

  const [cycleRows, setCycleRows] = useState([]);
  const [openRows, setOpenRows] = useState([]);
  const [creditTotal, setCreditTotal] = useState(0);
  const [creditCount, setCreditCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [generating, setGenerating] = useState(false);
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(10);
  const [payFor, setPayFor] = useState(null);
  const [reload, setReload] = useState(0);

  const refresh = useCallback(() => setReload((n) => n + 1), []);
  const canGenerate = can(session, "invoices", "create");
  const canPay = can(session, "payments", "create");

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      setError("");
      try {
        const [y, m] = cycle.split("-").map(Number);
        const next = monthStart(new Date(y, m, 1));
        const cols = "id, amount, amount_paid, balance_due, payment_status";
        const openCols =
          "id, invoice_number, subscriber_id, subscriber_name, subscriber_code, subscriber_phone, billing_month, period_end, due_date, promised_date, amount, amount_paid, balance_due, payment_status, invoice_type";
        const [cyc, open, credit] = await Promise.all([
          fetchAll((a, b) =>
            supabase.from("v_invoice_summary").select(cols).neq("invoice_status", "cancelled").gte("billing_month", cycle).lt("billing_month", next).order("id").range(a, b)
          ),
          fetchAll((a, b) =>
            supabase.from("v_invoice_summary").select(openCols).neq("invoice_status", "cancelled").gt("balance_due", 0).order("due_date").order("id").range(a, b)
          ),
          fetchAll((a, b) =>
            supabase.from("v_subscriber_credit").select("subscriber_id, credit_balance").gt("credit_balance", 0).order("subscriber_id").range(a, b)
          ),
        ]);
        if (!alive) return;
        setCycleRows(cyc);
        setOpenRows(open);
        setCreditTotal(sum(credit, "credit_balance"));
        setCreditCount(credit.length);
      } catch (e) {
        if (alive) setError(friendlyError(e));
      }
      if (alive) setLoading(false);
    })();
    return () => {
      alive = false;
    };
  }, [cycle, reload]);

  const today = todayISO();
  const soon = addDaysISO(today, 7);
  const promisedFuture = openRows.filter((r) => r.promised_date && r.promised_date >= today);
  const overdue = openRows.filter((r) => r.payment_status === "overdue");
  const attention = openRows.filter(
    (r) => r.payment_status === "overdue" || r.payment_status === "partial" || (r.promised_date && r.promised_date >= today && r.promised_date <= soon)
  );
  const pageRows = attention.slice(page * pageSize, page * pageSize + pageSize);

  const breakdown = ["unpaid", "partial", "overdue", "paid"].map((s) => {
    const rows = cycleRows.filter((r) => r.payment_status === s);
    return { status: s, count: rows.length, amount: sum(rows, "amount") };
  });

  async function generate() {
    setGenerating(true);
    const { data, error: e } = await supabase.rpc("generate_monthly_invoices");
    setGenerating(false);
    if (e) return toast.show(friendlyError(e), "error");
    toast.show(
      Number(data) > 0
        ? `${data} new invoice${Number(data) === 1 ? "" : "s"} created for subscribers whose billing cycle has started.`
        : "Nothing to bill: every subscriber whose cycle has started already has an invoice."
    );
    refresh();
  }

  return (
    <>
      <div className="grid grid-cols-12 gap-6">
        <div className="col-span-12 intro-y flex flex-col lg:flex-row lg:items-center">
          <div>
            <h2 className="text-lg font-medium">Billing</h2>
            <div className="text-slate-500 mt-1">
              Each subscriber is billed on the day of the month they were activated.
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 lg:ml-auto mt-4 lg:mt-0">
            <select className="form-select box w-52" value={cycle} onChange={(e) => { setCycle(e.target.value); setPage(0); }}>
              {options.map((o) => (
                <option key={o.value} value={o.value}>
                  Billing period: {o.label}
                </option>
              ))}
            </select>
            {canGenerate && (
              <button type="button" className="btn btn-primary shadow-md" onClick={generate} disabled={generating}>
                <Lucide icon="RefreshCw" className={`w-4 h-4 mr-2 ${generating ? "animate-spin" : ""}`} />
                {generating ? "Generating..." : "Generate Invoices"}
              </button>
            )}
          </div>
        </div>

        <div className="col-span-12">
          <ErrorBanner message={error} onClose={() => setError("")} />
        </div>

        {loading ? (
          <div className="col-span-12 box p-10 text-center text-slate-500">Loading billing figures...</div>
        ) : (
          <>
            <div className="col-span-12 sm:col-span-6 xl:col-span-4 intro-y">
              <StatCard icon="FileText" value={money(sum(cycleRows, "amount"))} label="Billed this period" hint={`${cycleRows.length} invoices`} />
            </div>
            <div className="col-span-12 sm:col-span-6 xl:col-span-4 intro-y">
              <StatCard icon="CheckCircle" tone="text-success" value={money(sum(cycleRows, "amount_paid"))} label="Collected this period" />
            </div>
            <div className="col-span-12 sm:col-span-6 xl:col-span-4 intro-y">
              <StatCard icon="CreditCard" tone="text-danger" value={money(sum(cycleRows, "balance_due"))} label="Outstanding this period" hint={`${money(sum(openRows, "balance_due"))} across all periods`} />
            </div>
            <div className="col-span-12 sm:col-span-6 xl:col-span-4 intro-y">
              <StatCard icon="AlertTriangle" tone="text-danger" value={`${overdue.length} / ${money(sum(overdue, "balance_due"))}`} label="Overdue invoices / amount" />
            </div>
            <div className="col-span-12 sm:col-span-6 xl:col-span-4 intro-y">
              <StatCard icon="Clock" tone="text-warning" value={money(sum(promisedFuture, "balance_due"))} label="Promised to pay" hint={`${promisedFuture.length} invoices with a future promise date`} />
            </div>
            <div className="col-span-12 sm:col-span-6 xl:col-span-4 intro-y">
              <StatCard icon="PiggyBank" tone="text-success" value={money(creditTotal)} label="Advance credit held" hint={`${creditCount} subscribers`} />
            </div>

            <div className="col-span-12 lg:col-span-5 intro-y">
              <div className="box p-5 h-full">
                <h3 className="font-medium mb-3">This period by payment status</h3>
                {cycleRows.length === 0 ? (
                  <div className="text-sm text-slate-500">No invoices in this billing period yet.</div>
                ) : (
                  <table className="table w-full text-sm">
                    <thead>
                      <tr>
                        <th>Status</th>
                        <th className="text-right">Invoices</th>
                        <th className="text-right">Amount</th>
                      </tr>
                    </thead>
                    <tbody>
                      {breakdown.map((b) => (
                        <tr key={b.status}>
                          <td>
                            <InvoicePaymentBadge status={b.status} />
                          </td>
                          <td className="text-right">{b.count}</td>
                          <td className="text-right whitespace-nowrap">{money(b.amount)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>

            <div className="col-span-12 lg:col-span-7 intro-y">
              <div className="box p-5 h-full text-sm text-slate-500">
                <h3 className="font-medium mb-3 text-slate-700 dark:text-slate-200">How billing works</h3>
                <ul className="list-disc pl-5 space-y-1">
                  <li>An invoice is raised on each subscriber's activation day of the month, covering one billing period.</li>
                  <li>"Generate Invoices" bills everyone whose cycle has started and who has no invoice yet. It is safe to press repeatedly.</li>
                  <li>Partial payments are allowed; set a "pay the rest on" date and the invoice is not overdue until then.</li>
                  <li>Advance credit is used automatically on open and future invoices.</li>
                </ul>
              </div>
            </div>

            <div className="col-span-12 mt-2">
              <div className="intro-y flex items-center h-10">
                <h2 className="text-lg font-medium truncate mr-5">Invoices needing attention</h2>
                <div className="ml-auto text-slate-500 text-sm">Overdue, partially paid, or promised within 7 days</div>
              </div>
              {attention.length === 0 ? (
                <div className="intro-y box p-10 mt-5 flex flex-col items-center text-center">
                  <Lucide icon="CheckCircle" className="w-12 h-12 text-slate-300 mb-3" />
                  <div className="text-slate-500">Nothing needs attention right now.</div>
                </div>
              ) : (
                <>
                  <div className="intro-y w-full overflow-x-auto mt-5">
                    <table className="table table-report w-full min-w-[1100px]">
                      <thead>
                        <tr>
                          <th className="whitespace-nowrap">INVOICE NO</th>
                          <th className="whitespace-nowrap">SUBSCRIBER</th>
                          <th className="whitespace-nowrap">BILLING PERIOD</th>
                          <th className="text-right whitespace-nowrap">AMOUNT</th>
                          <th className="text-right whitespace-nowrap">BALANCE</th>
                          <th className="whitespace-nowrap">DUE DATE</th>
                          <th className="whitespace-nowrap">PROMISED</th>
                          <th className="text-center whitespace-nowrap">STATUS</th>
                          <th className="text-center whitespace-nowrap">ACTIONS</th>
                        </tr>
                      </thead>
                      <tbody>
                        {pageRows.map((r) => (
                          <tr key={r.id} className="intro-x">
                            <td className="whitespace-nowrap font-medium">{r.invoice_number}</td>
                            <td className="whitespace-nowrap">
                              {r.subscriber_name}
                              <div className="text-slate-500 text-xs">
                                {r.subscriber_code} | {r.subscriber_phone}
                              </div>
                            </td>
                            <td className="whitespace-nowrap">
                              {formatDate(r.billing_month)}
                              {r.period_end && <div className="text-slate-500 text-xs">to {formatDate(r.period_end)}</div>}
                            </td>
                            <td className="text-right whitespace-nowrap">{money(r.amount)}</td>
                            <td className="text-right whitespace-nowrap text-danger">{money(r.balance_due)}</td>
                            <td className="whitespace-nowrap">{formatDate(r.due_date)}</td>
                            <td className="whitespace-nowrap">{r.promised_date ? formatDate(r.promised_date) : "—"}</td>
                            <td className="w-32">
                              <div className="flex justify-center">
                                <InvoicePaymentBadge status={r.payment_status} />
                              </div>
                            </td>
                            <td className="table-report__action whitespace-nowrap">
                              <div className="flex justify-center">
                                {canPay ? (
                                  <Tippy tag="a" href="" content="Record payment" onClick={(e) => { e.preventDefault(); setPayFor(r); }}>
                                    <Lucide icon="DollarSign" className="w-4 h-4 text-slate-500 hover:text-success" />
                                  </Tippy>
                                ) : (
                                  <span className="text-slate-400 text-xs">{titleCase(r.invoice_type)}</span>
                                )}
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <Pagination page={page} pageSize={pageSize} total={attention.length} onPage={setPage} onPageSize={(n) => { setPageSize(n); setPage(0); }} />
                </>
              )}
            </div>
          </>
        )}
      </div>

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
          }}
        />
      )}
      {toast.node}
    </>
  );
}

export default Main;
