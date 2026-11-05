import { supabase } from "@/lib/supabase";
import { can } from "@/lib/session";
import { money } from "@/lib/format";
import { useWidget, Widget, Row, Empty, SubTitle, isoDate } from "./kit";

export function MoneyToday({ session }) {
  const ok = can(session, "accounting", "view");
  const state = useWidget(async () => {
    const now = new Date();
    const today = isoDate(now);
    const first = isoDate(new Date(now.getFullYear(), now.getMonth(), 1));
    const [book, pl] = await Promise.all([
      supabase.rpc("get_cash_book", { p_from: today, p_to: today, p_branch: null }),
      supabase.rpc("get_profit_loss", { p_from: first, p_to: today, p_branch: null }),
    ]);
    if (book.error) throw book.error;
    if (pl.error) throw pl.error;
    return { book: book.data || {}, pl: pl.data || {} };
  }, ok);
  if (!ok) return null;
  const { book = {}, pl = {} } = state.data || {};
  const net = Number(pl.net_profit_cash ?? 0);
  return (
    <Widget title="Money today" icon="Wallet" to="/accounting" state={state}>
      <Row label="Cash in drawer (closing)" value={money(book.closing_balance)} />
      <Row label="Cash in today" value={money(book.total_cash_in)} tone="text-success" />
      <Row label="Cash out today" value={money(book.total_cash_out)} tone="text-danger" />
      <SubTitle>This month</SubTitle>
      <Row label="Collected" value={money(pl.net_collected ?? pl.collected)} />
      <Row label="Expenses" value={money(pl.expenses)} tone="text-danger" />
      <Row label="Net profit" value={money(net)} tone={net < 0 ? "text-danger" : "text-success"} />
    </Widget>
  );
}

const STAGES = [
  ["new", "New"],
  ["contacted", "Contacted"],
  ["feasibility", "Feasibility"],
  ["survey_scheduled", "Survey scheduled"],
  ["survey_done", "Survey done"],
  ["quoted", "Quoted"],
];

export function LeadsWidget({ session }) {
  const ok = can(session, "leads", "view");
  const state = useWidget(async () => {
    const { data, error } = await supabase
      .from("v_lead_overview")
      .select("id,stage,follow_up_overdue,updated_at")
      .limit(1000);
    if (error) throw error;
    return data || [];
  }, ok);
  if (!ok) return null;
  const rows = state.data || [];
  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);
  const open = rows.filter((r) => !["won", "lost"].includes(r.stage));
  const won = rows.filter((r) => r.stage === "won" && new Date(r.updated_at) >= monthStart).length;
  return (
    <Widget title="Leads" icon="UserPlus" to="/leads" state={state}>
      {rows.length === 0 ? (
        <Empty text="No leads yet." />
      ) : (
        <>
          {STAGES.map(([k, label]) => (
            <Row key={k} label={label} value={open.filter((r) => r.stage === k).length} />
          ))}
          <Row label="Follow-ups overdue" value={open.filter((r) => r.follow_up_overdue).length} tone="text-danger" />
          <Row label="Won this month" value={won} tone="text-success" />
        </>
      )}
    </Widget>
  );
}
