import { Lucide } from "@/base-components";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { friendlyError } from "@/lib/errors";
import { formatDateTime, money, titleCase } from "@/lib/format";
import { EQUIPMENT_STATUSES, ErrorBanner, Spinner, StatusBadge, moveLabel, qty } from "./shared";

export default function OverviewTab({ goTo }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [data, setData] = useState(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const eqCounts = await Promise.all(
          EQUIPMENT_STATUSES.map((s) =>
            supabase.from("v_equipment_overview").select("id", { count: "exact", head: true }).eq("status", s)
          )
        );
        const [stock, pending, moves] = await Promise.all([
          supabase
            .from("v_stock_overview")
            .select("id, item_code, name, unit, quantity_on_hand, reorder_level, unit_cost, is_low, stock_value, is_active")
            .order("name")
            .limit(2000),
          supabase
            .from("v_installation_overview")
            .select("id, installation_number, status, scheduled_at, subscriber_name, technician_name", { count: "exact" })
            .in("status", ["planned", "in_progress"])
            .order("scheduled_at", { ascending: true, nullsFirst: false })
            .limit(6),
          supabase.from("v_stock_movements").select("*").order("created_at", { ascending: false }).limit(8),
        ]);
        const firstErr = [...eqCounts, stock, pending, moves].find((r) => r.error)?.error;
        if (firstErr) throw firstErr;
        if (cancelled) return;
        const items = stock.data || [];
        const active = items.filter((i) => i.is_active);
        setData({
          equipmentByStatus: EQUIPMENT_STATUSES.map((s, i) => ({ status: s, count: eqCounts[i].count || 0 })),
          itemsCount: active.length,
          low: active.filter((i) => i.is_low),
          stockValue: active.reduce((sum, i) => sum + Number(i.stock_value || 0), 0),
          pendingCount: pending.count || 0,
          pending: pending.data || [],
          moves: moves.data || [],
        });
        setError("");
      } catch (e) {
        if (!cancelled) setError(friendlyError(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) return <Spinner />;
  if (error) return <ErrorBanner message={error} />;
  const totalEq = data.equipmentByStatus.reduce((s, x) => s + x.count, 0);

  const Card = ({ icon, color, value, label, onClick }) => (
    <div className="col-span-12 sm:col-span-6 xl:col-span-3">
      <div className={`box p-5 flex items-center ${onClick ? "cursor-pointer" : ""}`} onClick={onClick}>
        <Lucide icon={icon} className={`w-8 h-8 mr-4 flex-none ${color}`} />
        <div>
          <div className="text-xl font-medium">{value}</div>
          <div className="text-slate-500 text-xs mt-0.5">{label}</div>
        </div>
      </div>
    </div>
  );

  return (
    <div className="grid grid-cols-12 gap-6">
      <Card icon="Package" color="text-primary" value={totalEq} label="Serial equipment units" onClick={() => goTo("equipment")} />
      <Card icon="Layers" color="text-success" value={data.itemsCount} label="Stock items" onClick={() => goTo("stock")} />
      <Card icon="AlertTriangle" color="text-warning" value={data.low.length} label="Low stock items" onClick={() => goTo("stock")} />
      <Card icon="Wallet" color="text-primary" value={money(data.stockValue)} label="Stock value" />
      <Card icon="Wrench" color="text-pending" value={data.pendingCount} label="Pending installations" onClick={() => goTo("installations")} />

      <div className="col-span-12 lg:col-span-6 box p-5">
        <div className="font-medium mb-3">Equipment by status</div>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {data.equipmentByStatus.map((s) => (
            <div key={s.status} className="border border-slate-200/60 dark:border-darkmode-400 rounded-md p-3">
              <div className="text-xl font-medium">{s.count}</div>
              <StatusBadge value={s.status} />
            </div>
          ))}
        </div>
      </div>

      <div className="col-span-12 lg:col-span-6 box p-5">
        <div className="font-medium mb-3">Low stock</div>
        {data.low.length === 0 ? (
          <div className="text-slate-500 text-sm">All stock items are above their reorder level.</div>
        ) : (
          <table className="table w-full">
            <thead>
              <tr>
                <th>ITEM</th>
                <th className="text-right">ON HAND</th>
                <th className="text-right">REORDER AT</th>
              </tr>
            </thead>
            <tbody>
              {data.low.map((i) => (
                <tr key={i.id}>
                  <td>{i.name}</td>
                  <td className="text-right text-danger font-medium">
                    {qty(i.quantity_on_hand)} {i.unit}
                  </td>
                  <td className="text-right">
                    {qty(i.reorder_level)} {i.unit}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="col-span-12 lg:col-span-6 box p-5">
        <div className="font-medium mb-3">Pending installations</div>
        {data.pending.length === 0 ? (
          <div className="text-slate-500 text-sm">No installations are waiting.</div>
        ) : (
          <table className="table w-full">
            <thead>
              <tr>
                <th>JOB</th>
                <th>CUSTOMER</th>
                <th>TECHNICIAN</th>
                <th>SCHEDULED</th>
              </tr>
            </thead>
            <tbody>
              {data.pending.map((p) => (
                <tr key={p.id}>
                  <td className="font-medium">{p.installation_number}</td>
                  <td>{p.subscriber_name}</td>
                  <td>{p.technician_name || "—"}</td>
                  <td>{formatDateTime(p.scheduled_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="col-span-12 lg:col-span-6 box p-5">
        <div className="font-medium mb-3">Recent stock movements</div>
        {data.moves.length === 0 ? (
          <div className="text-slate-500 text-sm">No stock movements yet.</div>
        ) : (
          <table className="table w-full">
            <thead>
              <tr>
                <th>WHEN</th>
                <th>ITEM</th>
                <th>TYPE</th>
                <th className="text-right">QTY</th>
              </tr>
            </thead>
            <tbody>
              {data.moves.map((m) => (
                <tr key={m.id}>
                  <td className="whitespace-nowrap">{formatDateTime(m.created_at)}</td>
                  <td>{m.item_name}</td>
                  <td>{moveLabel(m.movement_type)}</td>
                  <td className={`text-right font-medium ${Number(m.quantity) < 0 ? "text-danger" : "text-success"}`}>
                    {Number(m.quantity) > 0 ? "+" : ""}
                    {qty(m.quantity)} {m.unit}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
