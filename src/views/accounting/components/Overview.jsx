import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { friendlyError } from "@/lib/errors";
import { money, formatDate } from "@/lib/format";
import { ErrorBanner, StatCard, Loading, Empty, thisMonth, todayISO, BranchSelect } from "./common";

export function CategoryBars({ rows }) {
  const max = Math.max(1, ...rows.map((r) => Number(r.amount)));
  if (!rows.length) return <Empty text="No expenses in this period." />;
  return (
    <div className="space-y-3">
      {rows.map((r) => (
        <div key={r.category}>
          <div className="flex justify-between text-sm mb-1">
            <span>{r.category}</span>
            <span className="font-medium">{money(r.amount)}</span>
          </div>
          <div className="h-2 rounded bg-slate-100 dark:bg-darkmode-400">
            <div className="h-2 rounded bg-primary" style={{ width: `${(Number(r.amount) / max) * 100}%` }}></div>
          </div>
        </div>
      ))}
    </div>
  );
}

export default function Overview({ branches }) {
  const [branch, setBranch] = useState("");
  const [pl, setPl] = useState(null);
  const [today, setToday] = useState(null);
  const [lastClosing, setLastClosing] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      setError("");
      try {
        const { from, to } = thisMonth();
        const t = todayISO();
        const b = branch || null;
        let cq = supabase.from("daily_closings").select("*").order("closing_date", { ascending: false }).limit(1);
        if (branch) cq = cq.eq("branch_id", branch);
        const [a, c, d] = await Promise.all([
          supabase.rpc("get_profit_loss", { p_from: from, p_to: to, p_branch: b }),
          supabase.rpc("get_cash_book", { p_from: t, p_to: t, p_branch: b }),
          cq,
        ]);
        if (a.error) throw a.error;
        if (c.error) throw c.error;
        if (d.error) throw d.error;
        if (!alive) return;
        setPl(a.data);
        setToday(c.data);
        setLastClosing(d.data?.[0] || null);
      } catch (e) {
        if (alive) setError(friendlyError(e));
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [branch]);

  return (
    <div>
      <div className="flex items-center mb-4">
        <div className="text-slate-500">This month</div>
        <div className="ml-auto">
          <BranchSelect branches={branches} value={branch} onChange={setBranch} />
        </div>
      </div>
      <ErrorBanner message={error} />
      {loading ? (
        <Loading />
      ) : pl ? (
        <>
          <div className="grid grid-cols-12 gap-5">
            <div className="col-span-12 sm:col-span-6 xl:col-span-3">
              <StatCard icon="TrendingUp" tone="text-success" value={money(pl.collected)} label="Collected" />
            </div>
            <div className="col-span-12 sm:col-span-6 xl:col-span-3">
              <StatCard icon="RotateCcw" tone="text-warning" value={money(pl.refunds)} label="Refunds" />
            </div>
            <div className="col-span-12 sm:col-span-6 xl:col-span-3">
              <StatCard icon="TrendingDown" tone="text-danger" value={money(pl.expenses)} label="Expenses" />
            </div>
            <div className="col-span-12 sm:col-span-6 xl:col-span-3">
              <StatCard
                icon="DollarSign"
                tone={Number(pl.net_profit_cash) < 0 ? "text-danger" : "text-primary"}
                value={money(pl.net_profit_cash)}
                label="Net (cash basis)"
              />
            </div>
            <div className="col-span-12 sm:col-span-6">
              <StatCard
                icon="Wallet"
                value={money(today?.closing_balance ?? 0)}
                label="Cash in drawer today"
                hint={`As of ${formatDate(todayISO())}`}
              />
            </div>
            <div className="col-span-12 sm:col-span-6">
              <StatCard
                icon="Lock"
                value={lastClosing ? formatDate(lastClosing.closing_date) : "-"}
                label="Last closing"
                hint={
                  lastClosing
                    ? `Counted ${money(lastClosing.counted_cash)}, difference ${money(lastClosing.difference)}`
                    : "No day closed yet"
                }
              />
            </div>
          </div>
          <div className="box p-5 mt-5">
            <div className="font-medium mb-4">Expenses by category (this month)</div>
            <CategoryBars rows={pl.expenses_by_category || []} />
          </div>
        </>
      ) : null}
    </div>
  );
}
