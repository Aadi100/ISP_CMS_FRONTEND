import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import classnames from "classnames";

import { Lucide } from "@/base-components";
import { supabase } from "@/lib/supabase";
import { getSession, can } from "@/lib/session";
import { friendlyError } from "@/lib/errors";
import { money, formatDate, titleCase } from "@/lib/format";
import DataChart from "@/views/reports/components/DataChart";
import { MoneyToday, LeadsWidget } from "./components/MoneyLeads";
import {
  SlaWidget,
  FieldCollectionWidget,
  ApprovalsWidget,
  PurchasingWidget,
  OutagesWidget,
  SubscriptionWidget,
} from "./components/OpsWidgets";

const STATUS_TONE = {
  active: "text-success",
  pending: "text-warning",
  suspended: "text-danger",
  terminated: "text-danger",
  overdue: "text-danger",
  partial: "text-warning",
  unpaid: "text-warning",
  paid: "text-success",
  open: "text-danger",
  assigned: "text-warning",
  in_progress: "text-warning",
  waiting_for_customer: "text-warning",
  resolved: "text-success",
  closed: "text-slate-500",
  planned: "text-warning",
  critical: "text-danger",
  high: "text-danger",
  medium: "text-warning",
  low: "text-slate-500",
};

const tone = (v) => STATUS_TONE[v] || "text-slate-500";

function monthShort(value) {
  return new Date(`${String(value).slice(0, 10)}T00:00:00`).toLocaleDateString("en-GB", {
    month: "short",
    year: "2-digit",
  });
}

function Panel({ title, to, navigate, children, className = "lg:col-span-6" }) {
  return (
    <div className={classnames("col-span-12 mt-6", className)}>
      <div className="intro-y flex items-center h-10">
        <h2 className="text-lg font-medium truncate mr-5">{title}</h2>
        {to && (
          <button type="button" className="ml-auto text-primary truncate" onClick={() => navigate(to)}>
            View All
          </button>
        )}
      </div>
      <div className="intro-y box p-5 mt-2">{children}</div>
    </div>
  );
}

function Empty({ loading, text }) {
  return <div className="text-center py-6 text-slate-500">{loading ? "Loading..." : text}</div>;
}

function Table({ head, rows, loading, empty, row }) {
  if (loading || rows.length === 0) return <Empty loading={loading} text={empty} />;
  return (
    <div className="overflow-auto">
      <table className="table table-report">
        <thead>
          <tr>
            {head.map((h) => (
              <th key={h.label} className={classnames("whitespace-nowrap", h.cls)}>
                {h.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>{rows.map((r) => row(r))}</tbody>
      </table>
    </div>
  );
}

function Main() {
  const navigate = useNavigate();
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [errors, setErrors] = useState([]);
  const [d, setD] = useState({});

  const today = new Date().toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  const load = useCallback(async () => {
    setLoading(true);
    const s = await getSession();
    setSession(s);
    if (!s) {
      setLoading(false);
      return;
    }
    const errs = [];
    // run one widget query; a failing widget must not break the others
    const run = async (name, allowed, fn) => {
      if (!allowed) return null;
      try {
        const { data, error } = await fn();
        if (error) throw error;
        return data;
      } catch (e) {
        errs.push(`${name}: ${friendlyError(e)}`);
        return null;
      }
    };

    const [
      summary, months, areas, packages, recentSubs, payments, tickets, overdue, lowStock, installs,
    ] = await Promise.all([
      run("Summary", true, () => supabase.rpc("get_isp_dashboard")),
      run("Collections", can(s, "payments", "view") || can(s, "billing", "view"), () =>
        supabase.from("v_monthly_collections").select("month,total_collected,payments_count").order("month", { ascending: false }).limit(6)
      ),
      run("Areas", can(s, "subscribers", "view"), () =>
        supabase.from("v_subscribers_by_area").select("area_name,subscribers").order("subscribers", { ascending: false })
      ),
      run("Packages", can(s, "subscribers", "view"), () =>
        supabase.from("v_subscribers_by_package").select("package_name,subscribers").order("subscribers", { ascending: false })
      ),
      run("Recent subscribers", can(s, "subscribers", "view"), () =>
        supabase
          .from("v_subscriber_overview")
          .select("id,full_name,package_name,created_at,connection_status")
          .order("created_at", { ascending: false })
          .limit(5)
      ),
      run("Recent payments", can(s, "payments", "view"), () =>
        supabase
          .from("v_payment_ledger")
          .select("id,receipt_number,subscriber_name,method,paid_at,amount,status")
          .order("paid_at", { ascending: false })
          .limit(8)
      ),
      run("Tickets", can(s, "tickets", "view"), () =>
        supabase
          .from("v_ticket_overview")
          .select("id,ticket_number,subscriber_name,category,priority,status")
          .order("created_at", { ascending: false })
          .limit(8)
      ),
      run("Overdue invoices", can(s, "invoices", "view"), () =>
        supabase
          .from("v_invoice_summary")
          .select("id,invoice_number,subscriber_name,due_date,balance_due")
          .eq("payment_status", "overdue")
          .neq("invoice_status", "cancelled")
          .order("due_date", { ascending: true })
          .limit(8)
      ),
      run("Low stock", can(s, "inventory", "view"), () =>
        supabase
          .from("v_stock_overview")
          .select("id,name,unit,quantity_on_hand,reorder_level")
          .eq("is_low", true)
          .eq("is_active", true)
          .order("quantity_on_hand", { ascending: true })
          .limit(8)
      ),
      run("Installations", can(s, "inventory", "view"), () =>
        supabase
          .from("v_installation_overview")
          .select("id,installation_number,subscriber_name,technician_name,scheduled_at,status")
          .in("status", ["planned", "in_progress"])
          .order("scheduled_at", { ascending: true, nullsFirst: false })
          .limit(8)
      ),
    ]);

    setD({
      summary,
      months: (months || []).slice().reverse(),
      areas: areas || [],
      packages: packages || [],
      recentSubs: recentSubs || [],
      payments: payments || [],
      tickets: tickets || [],
      overdue: overdue || [],
      lowStock: lowStock || [],
      installs: installs || [],
    });
    setErrors(errs);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const sm = d.summary || {};
  const sub = sm.subscribers || {};
  const bill = sm.billing || {};
  const col = sm.collections || {};
  const tk = sm.tickets || {};
  const inv = sm.inventory || {};
  const net = sm.network || {};
  const v = (x) => (loading ? "..." : Number(x ?? 0).toLocaleString());
  const m = (x) => (loading ? "..." : money(x));

  const allow = (module) => can(session, module, "view");

  const cards = [
    { show: allow("subscribers"), label: "Active Subscribers", value: v(sub.active), sub: `${v(sub.total)} total, ${v(sub.new_this_month)} new this month`, icon: "Users", color: "text-primary" },
    { show: allow("subscribers"), label: "Pending / Suspended", value: `${v(sub.pending)} / ${v(sub.suspended)}`, icon: "Clock", color: "text-warning" },
    { show: allow("payments"), label: "Collected Today", value: m(col.today), sub: `${m(col.this_month)} this month`, icon: "Wallet", color: "text-success" },
    { show: allow("billing"), label: "Billed This Month", value: m(bill.billed_this_month), icon: "FileText", color: "text-primary" },
    { show: allow("billing"), label: "Outstanding", value: m(bill.outstanding_total), sub: `${v(bill.overdue_count)} overdue, ${v(bill.unpaid_count)} unpaid/partial`, icon: "CreditCard", color: "text-danger" },
    { show: allow("billing"), label: "Advance Credit Held", value: m(bill.advance_credit_held), sub: `${v(bill.promised_count)} promised to pay`, icon: "PiggyBank", color: "text-success" },
    { show: allow("tickets"), label: "Open Tickets", value: v(tk.open), sub: `${v(tk.critical_open)} critical, ${v(tk.resolved_today)} resolved today`, icon: "LifeBuoy", color: "text-danger" },
    { show: allow("inventory"), label: "Pending Installations", value: v(inv.pending_installations), icon: "Wrench", color: "text-warning" },
    { show: allow("inventory"), label: "Low Stock Items", value: v(inv.low_stock_items), sub: `${v(inv.available)} units available, ${v(inv.damaged)} damaged`, icon: "PackageX", color: "text-warning" },
    { show: allow("network"), label: "Network Devices", value: `${v(net.online)} online`, sub: `${v(net.offline)} offline`, icon: "Wifi", color: "text-primary" },
  ].filter((c) => c.show);

  const quickActions = [
    { show: can(session, "subscribers", "create"), label: "Add Subscriber", icon: "UserPlus", path: "/subscribers" },
    { show: can(session, "invoices", "create"), label: "Create Invoice", icon: "FileText", path: "/invoices" },
    { show: can(session, "tickets", "create"), label: "Register Complaint", icon: "AlertCircle", path: "/support" },
    { show: can(session, "packages", "create"), label: "Add Package", icon: "Package", path: "/packages" },
    { show: can(session, "inventory", "create"), label: "Add Equipment", icon: "HardDrive", path: "/inventory" },
    { show: can(session, "employees", "create"), label: "Add Employee", icon: "Briefcase", path: "/employees" },
  ].filter((a) => a.show);

  const monthLabels = (d.months || []).map((x) => monthShort(x.month));
  const monthData = (d.months || []).map((x) => Number(x.total_collected));
  const pkgs = (d.packages || []).filter((p) => Number(p.subscribers) > 0);
  const areas = (d.areas || []).slice(0, 8);

  return (
    <div className="grid grid-cols-12 gap-6">
      <div className="col-span-12 intro-y flex flex-col sm:flex-row sm:items-center">
        <div>
          <h2 className="text-lg font-medium">Dashboard</h2>
          <div className="text-slate-500 mt-1">
            {session?.profile?.full_name ? `Welcome, ${session.profile.full_name}. ` : ""}
            Here is what is happening across your network today.
          </div>
        </div>
        <div className="sm:ml-auto mt-3 sm:mt-0 flex items-center text-slate-500">
          <Lucide icon="Calendar" className="w-4 h-4 mr-2" />
          {today}
        </div>
      </div>

      {errors.length > 0 && (
        <div className="col-span-12 intro-y">
          <div className="alert alert-danger show flex items-center">
            <Lucide icon="AlertCircle" className="w-5 h-5 mr-2 flex-none" />
            <div className="flex-1">{errors.join(" | ")}</div>
            <button type="button" className="btn btn-sm btn-outline-danger ml-3" onClick={load}>
              Retry
            </button>
          </div>
        </div>
      )}

      {quickActions.length > 0 && (
        <div className="col-span-12 intro-y">
          <div className="box p-5">
            <div className="font-medium mb-4">Quick Actions</div>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
              {quickActions.map((a) => (
                <button
                  key={a.label}
                  type="button"
                  className="btn btn-outline-secondary flex flex-col items-center justify-center py-4 px-2"
                  onClick={() => navigate(a.path)}
                >
                  <Lucide icon={a.icon} className="w-5 h-5 mb-2" />
                  <span className="text-xs text-center">{a.label}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {cards.length > 0 && (
        <div className="col-span-12 mt-2">
          <div className="intro-y flex items-center h-10">
            <h2 className="text-lg font-medium truncate mr-5">System Overview</h2>
          </div>
          <div className="grid grid-cols-12 gap-6 mt-2">
            {cards.map((c) => (
              <div key={c.label} className="col-span-12 sm:col-span-6 lg:col-span-4 xl:col-span-3 intro-y">
                <div className="box p-5 flex items-center h-full">
                  <Lucide icon={c.icon} className={classnames("w-8 h-8 mr-4 flex-none", c.color)} />
                  <div className="min-w-0">
                    <div className="text-xl font-medium truncate">{c.value}</div>
                    <div className="text-slate-500 text-xs mt-0.5">{c.label}</div>
                    {c.sub && <div className="text-slate-400 text-xs mt-0.5">{c.sub}</div>}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {session && (
        <div className="col-span-12 mt-6">
          <div className="intro-y flex items-center h-10">
            <h2 className="text-lg font-medium truncate mr-5">Operations</h2>
          </div>
          <div className="grid grid-cols-12 gap-6 mt-2">
            <MoneyToday session={session} />
            <LeadsWidget session={session} />
            <SlaWidget session={session} />
            <FieldCollectionWidget session={session} />
            <ApprovalsWidget session={session} />
            <PurchasingWidget session={session} />
            <OutagesWidget session={session} />
            <SubscriptionWidget session={session} />
          </div>
        </div>
      )}

      {(allow("payments") || allow("billing")) && (
        <Panel title="Collections, last 6 months" className="lg:col-span-6">
          {loading || monthData.length === 0 ? (
            <Empty loading={loading} text="No collections recorded yet." />
          ) : (
            <DataChart labels={monthLabels} datasets={[{ label: "Collected (PKR)", data: monthData }]} height={240} />
          )}
        </Panel>
      )}

      {allow("subscribers") && (
        <Panel title="Subscribers by package" className="lg:col-span-6">
          {loading || pkgs.length === 0 ? (
            <Empty loading={loading} text="No subscribers yet." />
          ) : (
            <DataChart type="doughnut" labels={pkgs.map((p) => p.package_name)} datasets={[{ data: pkgs.map((p) => Number(p.subscribers)) }]} height={240} />
          )}
        </Panel>
      )}

      {allow("subscribers") && (
        <Panel title="Subscribers by area" className="lg:col-span-6">
          {loading || areas.length === 0 ? (
            <Empty loading={loading} text="No subscribers yet." />
          ) : (
            <DataChart labels={areas.map((a) => a.area_name)} datasets={[{ label: "Subscribers", data: areas.map((a) => Number(a.subscribers)) }]} height={240} />
          )}
        </Panel>
      )}

      {allow("subscribers") && (
        <Panel title="Recent Subscribers" to="/subscribers" navigate={navigate}>
          <Table
            loading={loading}
            rows={d.recentSubs || []}
            empty="No subscribers found."
            head={[{ label: "CUSTOMER" }, { label: "PACKAGE" }, { label: "JOINED" }, { label: "STATUS", cls: "text-center" }]}
            row={(r) => (
              <tr key={r.id} className="intro-x">
                <td className="whitespace-nowrap">{r.full_name}</td>
                <td className="whitespace-nowrap">{r.package_name || "No package"}</td>
                <td className="whitespace-nowrap">{formatDate(r.created_at)}</td>
                <td className={classnames("text-center whitespace-nowrap", tone(r.connection_status))}>{titleCase(r.connection_status)}</td>
              </tr>
            )}
          />
        </Panel>
      )}

      {allow("payments") && (
        <Panel title="Recent Payments" to="/payments" navigate={navigate}>
          <Table
            loading={loading}
            rows={d.payments || []}
            empty="No payments recorded yet."
            head={[{ label: "CUSTOMER" }, { label: "METHOD" }, { label: "DATE PAID" }, { label: "AMOUNT", cls: "text-right" }]}
            row={(r) => (
              <tr key={r.id} className="intro-x">
                <td className="whitespace-nowrap">{r.subscriber_name}</td>
                <td className="whitespace-nowrap">{titleCase(r.method)}</td>
                <td className="whitespace-nowrap">{formatDate(r.paid_at)}</td>
                <td className="text-right whitespace-nowrap">{money(r.amount)}</td>
              </tr>
            )}
          />
        </Panel>
      )}

      {allow("invoices") && (
        <Panel title="Overdue Invoices" to="/invoices" navigate={navigate}>
          <Table
            loading={loading}
            rows={d.overdue || []}
            empty="No overdue invoices."
            head={[{ label: "INVOICE #" }, { label: "CUSTOMER" }, { label: "DUE" }, { label: "BALANCE", cls: "text-right" }]}
            row={(r) => (
              <tr key={r.id} className="intro-x">
                <td className="whitespace-nowrap">{r.invoice_number}</td>
                <td className="whitespace-nowrap">{r.subscriber_name}</td>
                <td className="whitespace-nowrap text-danger">{formatDate(r.due_date)}</td>
                <td className="text-right whitespace-nowrap">{money(r.balance_due)}</td>
              </tr>
            )}
          />
        </Panel>
      )}

      {allow("tickets") && (
        <Panel title="Latest Support Tickets" to="/support" navigate={navigate}>
          <Table
            loading={loading}
            rows={d.tickets || []}
            empty="No support tickets yet."
            head={[{ label: "TICKET #" }, { label: "CUSTOMER" }, { label: "ISSUE" }, { label: "PRIORITY", cls: "text-center" }, { label: "STATUS", cls: "text-center" }]}
            row={(r) => (
              <tr key={r.id} className="intro-x">
                <td className="whitespace-nowrap">{r.ticket_number}</td>
                <td className="whitespace-nowrap">{r.subscriber_name || "—"}</td>
                <td className="whitespace-nowrap">{titleCase(r.category)}</td>
                <td className={classnames("text-center whitespace-nowrap", tone(r.priority))}>{titleCase(r.priority)}</td>
                <td className={classnames("text-center whitespace-nowrap", tone(r.status))}>{titleCase(r.status)}</td>
              </tr>
            )}
          />
        </Panel>
      )}

      {allow("inventory") && (
        <Panel title="Low Stock Items" to="/inventory" navigate={navigate}>
          <Table
            loading={loading}
            rows={d.lowStock || []}
            empty="No items are below their reorder level."
            head={[{ label: "ITEM" }, { label: "ON HAND", cls: "text-right" }, { label: "REORDER AT", cls: "text-right" }]}
            row={(r) => (
              <tr key={r.id} className="intro-x">
                <td className="whitespace-nowrap">{r.name}</td>
                <td className="text-right whitespace-nowrap text-danger">{Number(r.quantity_on_hand)} {r.unit}</td>
                <td className="text-right whitespace-nowrap">{Number(r.reorder_level)} {r.unit}</td>
              </tr>
            )}
          />
        </Panel>
      )}

      {allow("inventory") && (
        <Panel title="Upcoming Installations" to="/inventory" navigate={navigate}>
          <Table
            loading={loading}
            rows={d.installs || []}
            empty="No pending installations."
            head={[{ label: "JOB #" }, { label: "CUSTOMER" }, { label: "SCHEDULED" }, { label: "TECHNICIAN", cls: "text-center" }, { label: "STATUS", cls: "text-center" }]}
            row={(r) => (
              <tr key={r.id} className="intro-x">
                <td className="whitespace-nowrap">{r.installation_number}</td>
                <td className="whitespace-nowrap">{r.subscriber_name}</td>
                <td className="whitespace-nowrap">{r.scheduled_at ? formatDate(r.scheduled_at) : "Not scheduled"}</td>
                <td className="text-center whitespace-nowrap">{r.technician_name || "Not assigned"}</td>
                <td className={classnames("text-center whitespace-nowrap", tone(r.status))}>{titleCase(r.status)}</td>
              </tr>
            )}
          />
        </Panel>
      )}
    </div>
  );
}

export default Main;
