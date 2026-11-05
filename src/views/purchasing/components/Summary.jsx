import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { friendlyError } from "@/lib/errors";
import { money } from "@/lib/format";
import { StatCard, ErrorBanner, fetchAll } from "./common";

export default function Summary({ refreshKey }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const rows = await fetchAll((from, to) =>
          supabase
            .from("v_purchase_overview")
            .select("id,status,total,paid_amount,qty_pending")
            .neq("status", "cancelled")
            .range(from, to)
        );
        const open = rows.filter((r) => r.status === "ordered" || r.status === "partial");
        const now = new Date();
        const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
        const p = (n) => String(n).padStart(2, "0");
        const startISO = `${monthStart.getFullYear()}-${p(monthStart.getMonth() + 1)}-01`;
        let spent = null;
        const { data: exp, error: expErr } = await supabase
          .from("expenses")
          .select("amount")
          .eq("source", "purchase")
          .gte("expense_date", startISO)
          .limit(5000);
        if (!expErr) spent = (exp || []).reduce((s, r) => s + Number(r.amount || 0), 0);
        if (!alive) return;
        setData({
          open: open.length,
          pending: open.reduce((s, r) => s + Number(r.qty_pending || 0), 0),
          unpaid: rows.reduce((s, r) => s + Math.max(0, Number(r.total || 0) - Number(r.paid_amount || 0)), 0),
          spent,
        });
        setError("");
      } catch (e) {
        if (alive) setError(friendlyError(e));
      }
    })();
    return () => {
      alive = false;
    };
  }, [refreshKey]);

  return (
    <div className="mb-5">
      <ErrorBanner message={error} />
      <div className="grid grid-cols-12 gap-4">
        <div className="col-span-12 sm:col-span-6 xl:col-span-3">
          <StatCard icon="ShoppingCart" value={data ? data.open : "…"} label="Open orders" hint="Ordered or partly received" />
        </div>
        <div className="col-span-12 sm:col-span-6 xl:col-span-3">
          <StatCard
            icon="Package"
            tone="text-warning"
            value={data ? data.pending.toLocaleString("en-PK") : "…"}
            label="Goods pending"
            hint="Units still to be received"
          />
        </div>
        <div className="col-span-12 sm:col-span-6 xl:col-span-3">
          <StatCard
            icon="CreditCard"
            tone="text-danger"
            value={data ? money(data.unpaid) : "…"}
            label="Unpaid to suppliers"
          />
        </div>
        <div className="col-span-12 sm:col-span-6 xl:col-span-3">
          <StatCard
            icon="TrendingDown"
            tone="text-success"
            value={data ? (data.spent === null ? "—" : money(data.spent)) : "…"}
            label="Spent this month"
            hint="Supplier payments"
          />
        </div>
      </div>
    </div>
  );
}
