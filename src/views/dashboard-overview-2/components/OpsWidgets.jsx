import { supabase } from "@/lib/supabase";
import { can } from "@/lib/session";
import { money, formatDate, formatDateTime, titleCase } from "@/lib/format";
import { useWidget, Widget, Row, Empty, SubTitle, Bar } from "./kit";

const CLOSED = ["resolved", "closed"];

function slaText(t) {
  if (t.resolution_breached) return { text: "SLA breached", cls: "text-danger" };
  const m = Number(t.minutes_to_resolution_due);
  if (Number.isNaN(m) || t.minutes_to_resolution_due === null) return { text: "No SLA", cls: "text-slate-500" };
  if (m < 0) return { text: `${Math.abs(m)} min overdue`, cls: "text-danger" };
  if (m <= 60) return { text: `${m} min left`, cls: "text-warning" };
  return { text: m < 2880 ? `${Math.round(m / 60)} h left` : `${Math.round(m / 1440)} d left`, cls: "text-slate-500" };
}

export function SlaWidget({ session }) {
  const ok = can(session, "tickets", "view");
  const state = useWidget(async () => {
    const { data, error } = await supabase
      .from("v_ticket_overview")
      .select("id,ticket_number,subscriber_name,priority,status,escalation_level,resolution_breached,minutes_to_resolution_due")
      .not("status", "in", "(resolved,closed)")
      .order("minutes_to_resolution_due", { ascending: true, nullsFirst: false })
      .limit(1000);
    if (error) throw error;
    return data || [];
  }, ok);
  if (!ok) return null;
  const open = (state.data || []).filter((t) => !CLOSED.includes(t.status));
  const breached = open.filter((t) => t.resolution_breached).length;
  const soon = open.filter((t) => !t.resolution_breached && t.minutes_to_resolution_due !== null && Number(t.minutes_to_resolution_due) >= 0 && Number(t.minutes_to_resolution_due) <= 60).length;
  const escalated = open.filter((t) => Number(t.escalation_level) > 0).length;
  const worst = open.filter((t) => t.minutes_to_resolution_due !== null || t.resolution_breached).slice(0, 5);
  return (
    <Widget title="Support SLA" icon="LifeBuoy" to="/support" state={state}>
      <Row label="Breached" value={breached} tone={breached ? "text-danger" : ""} />
      <Row label="Due within 1 hour" value={soon} tone={soon ? "text-warning" : ""} />
      <Row label="Escalated" value={escalated} />
      <SubTitle>Most urgent</SubTitle>
      {worst.length === 0 ? (
        <Empty text="No open tickets with an SLA." />
      ) : (
        worst.map((t) => {
          const s = slaText(t);
          return (
            <Row key={t.id} to="/support" label={`${t.ticket_number} ${t.subscriber_name || ""}`} value={s.text} tone={s.cls} />
          );
        })
      )}
    </Widget>
  );
}

export function FieldCollectionWidget({ session }) {
  const ok = can(session, "collections", "edit");
  const state = useWidget(async () => {
    const me = await supabase.from("employees").select("is_collector").eq("profile_id", session.user.id).maybeSingle();
    if (me.data?.is_collector) return { hidden: true };
    const [cash, pend] = await Promise.all([
      supabase.from("v_collector_cash").select("collector_id,full_name,cash_in_hand,pending_handover"),
      supabase.from("collector_handovers").select("id", { count: "exact", head: true }).eq("status", "pending"),
    ]);
    if (cash.error) throw cash.error;
    if (pend.error) throw pend.error;
    return { rows: cash.data || [], pending: pend.count || 0 };
  }, ok);
  if (!ok || state.data?.hidden) return null;
  const rows = (state.data?.rows || []).slice();
  const held = rows.reduce((s, r) => s + Number(r.cash_in_hand || 0), 0);
  const top = rows.sort((a, b) => Number(b.cash_in_hand) - Number(a.cash_in_hand)).filter((r) => Number(r.cash_in_hand) > 0).slice(0, 5);
  return (
    <Widget title="Field collection" icon="Wallet" to="/collections" state={state}>
      <Row label="Cash held by collectors" value={money(held)} />
      <Row label="Pending handovers" value={state.data?.pending ?? 0} tone={state.data?.pending ? "text-warning" : ""} />
      <SubTitle>Top collectors by cash in hand</SubTitle>
      {top.length === 0 ? (
        <Empty text="No collector holds cash." />
      ) : (
        top.map((r) => <Row key={r.collector_id} to="/collections" label={r.full_name} value={money(r.cash_in_hand)} />)
      )}
    </Widget>
  );
}

export function ApprovalsWidget({ session }) {
  const hr = can(session, "hr", "edit");
  const rs = can(session, "resellers", "edit");
  const pay = can(session, "payments", "edit");
  const ok = hr || rs || pay;
  const state = useWidget(async () => {
    const count = async (q) => {
      const { count: c, error } = await q;
      if (error) throw error;
      return c || 0;
    };
    const head = (t) => supabase.from(t).select("id", { count: "exact", head: true });
    const [leave, payroll, topups, payments] = await Promise.all([
      hr ? count(head("leave_requests").eq("status", "pending")) : 0,
      hr ? count(head("payroll_runs").in("status", ["draft", "approved"])) : 0,
      rs ? count(head("wallet_topup_requests").eq("status", "pending")) : 0,
      pay ? count(head("payments").eq("status", "pending")) : 0,
    ]);
    return { leave, payroll, topups, payments };
  }, ok);
  if (!ok) return null;
  const d = state.data || {};
  const rows = [
    hr && ["Leave requests pending", d.leave, "/hr"],
    hr && ["Payroll runs not paid", d.payroll, "/hr"],
    rs && ["Wallet top-up requests", d.topups, "/resellers"],
    pay && ["Payments awaiting confirmation", d.payments, "/payments"],
  ].filter(Boolean);
  return (
    <Widget title="Approvals waiting" icon="CheckSquare" state={state}>
      {rows.map(([label, n, to]) => (
        <Row key={label} to={to} label={label} value={n} tone={n ? "text-warning" : ""} />
      ))}
    </Widget>
  );
}

export function PurchasingWidget({ session }) {
  const ok = can(session, "purchasing", "view");
  const state = useWidget(async () => {
    const { data, error } = await supabase
      .from("v_purchase_overview")
      .select("id,status,balance_due,qty_pending,expected_date")
      .neq("status", "cancelled")
      .limit(1000);
    if (error) throw error;
    return data || [];
  }, ok);
  if (!ok) return null;
  const rows = state.data || [];
  const open = rows.filter((r) => ["ordered", "partial"].includes(r.status));
  const today = new Date().toISOString().slice(0, 10);
  const late = open.filter((r) => r.expected_date && r.expected_date < today).length;
  const unpaid = rows.filter((r) => r.status !== "draft").reduce((s, r) => s + Math.max(0, Number(r.balance_due || 0)), 0);
  return (
    <Widget title="Purchasing" icon="Package" to="/purchasing" state={state}>
      {rows.length === 0 ? (
        <Empty text="No purchase orders yet." />
      ) : (
        <>
          <Row label="Open orders" value={open.length} />
          <Row label="Orders with goods pending" value={open.filter((r) => Number(r.qty_pending) > 0).length} />
          <Row label="Unpaid to suppliers" value={money(unpaid)} tone={unpaid ? "text-danger" : ""} />
          <Row label="Past expected date" value={late} tone={late ? "text-danger" : ""} />
        </>
      )}
    </Widget>
  );
}

export function OutagesWidget({ session }) {
  const ok = can(session, "network", "view");
  const state = useWidget(async () => {
    const [dev, out] = await Promise.all([
      supabase.from("network_devices").select("status").limit(1000),
      supabase.from("outages").select("id,title,started_at").eq("status", "open").order("started_at", { ascending: false }).limit(5),
    ]);
    if (dev.error) throw dev.error;
    if (out.error) throw out.error;
    return { dev: dev.data || [], out: out.data || [] };
  }, ok);
  if (!ok) return null;
  const n = (s) => (state.data?.dev || []).filter((d) => d.status === s).length;
  return (
    <Widget title="Network & outages" icon="Wifi" to="/network" state={state}>
      <Row label="Devices online" value={n("online")} tone="text-success" />
      <Row label="Devices offline" value={n("offline")} tone={n("offline") ? "text-danger" : ""} />
      <Row label="Under maintenance" value={n("maintenance")} tone={n("maintenance") ? "text-warning" : ""} />
      <SubTitle>Open outages</SubTitle>
      {(state.data?.out || []).length === 0 ? (
        <Empty text="No open outages." />
      ) : (
        state.data.out.map((o) => (
          <Row key={o.id} to="/network" label={o.title} value={formatDateTime(o.started_at)} tone="text-slate-500" />
        ))
      )}
    </Widget>
  );
}

export function SubscriptionWidget({ session }) {
  const ok = session?.role === "isp_admin";
  const state = useWidget(async () => {
    const { data, error } = await supabase.rpc("get_my_subscription");
    if (error) throw error;
    return data || {};
  }, ok);
  if (!ok) return null;
  const s = state.data || {};
  return (
    <Widget title="Subscription" icon="CreditCard" to="/settings" state={state}>
      {!s.plan ? (
        <Empty text="No subscription plan found." />
      ) : (
        <>
          <Row label="Plan" value={`${s.plan} (${titleCase(s.status)})`} />
          <Row label="Expires" value={s.expires_at ? formatDate(s.expires_at) : "—"} />
          <Row
            label="Days left"
            value={s.days_left ?? "—"}
            tone={s.days_left !== null && s.days_left !== undefined && s.days_left <= 7 ? "text-danger" : ""}
          />
          {Number(s.unpaid_invoices) > 0 && <Row label="Unpaid platform invoices" value={s.unpaid_invoices} tone="text-danger" />}
          <div className="mt-4">
            <Bar label="Subscribers" used={Number(s.subscribers_used || 0)} max={s.max_subscribers} />
            <Bar label="Staff" used={Number(s.staff_used || 0)} max={s.max_staff} />
          </div>
          {!s.is_live && (
            <div className="text-danger text-sm">
              Your subscription is not active. Creating customers and invoices is blocked until it is renewed.
            </div>
          )}
        </>
      )}
    </Widget>
  );
}

