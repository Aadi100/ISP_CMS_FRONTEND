import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { friendlyError } from "@/lib/errors";
import { money } from "@/lib/format";
import { ErrorBanner, StatCard, Loading, Empty, BranchSelect, DateRange, monthRange } from "./common";
import { CategoryBars } from "./Overview";

const PRESETS = [
  ["this", "This month"],
  ["last", "Last month"],
  ["three", "Last 3 months"],
  ["custom", "Custom"],
];

const presetRange = (p) =>
  p === "last" ? monthRange(-1, 1) : p === "three" ? monthRange(-2, 3) : monthRange(0, 1);

const monthLabel = (m) => {
  const d = new Date(`${String(m).slice(0, 10)}T00:00:00`);
  return Number.isNaN(d.getTime()) ? m : d.toLocaleString("en-GB", { month: "short", year: "numeric" });
};

export default function ProfitLoss({ branches }) {
  const [preset, setPreset] = useState("this");
  const init = monthRange(0, 1);
  const [from, setFrom] = useState(init.from);
  const [to, setTo] = useState(init.to);
  const [branch, setBranch] = useState("");
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const choose = (p) => {
    setPreset(p);
    if (p !== "custom") {
      const r = presetRange(p);
      setFrom(r.from);
      setTo(r.to);
    }
  };

  useEffect(() => {
    if (!from || !to) return;
    let alive = true;
    (async () => {
      setLoading(true);
      setError("");
      try {
        const { data: d, error: err } = await supabase.rpc("get_profit_loss", {
          p_from: from,
          p_to: to,
          p_branch: branch || null,
        });
        if (err) throw err;
        if (alive) setData(d);
      } catch (e) {
        if (alive) setError(friendlyError(e));
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [from, to, branch]);

  const cards = data
    ? [
        ["TrendingUp", "text-success", data.collected, "Collected"],
        ["RotateCcw", "text-warning", data.refunds, "Refunds"],
        ["DollarSign", "text-primary", data.net_collected, "Net collected"],
        ["FileText", "text-primary", data.billed, "Billed"],
        ["TrendingDown", "text-danger", data.expenses, "Expenses"],
        [
          "Activity",
          Number(data.net_profit_cash) < 0 ? "text-danger" : "text-success",
          data.net_profit_cash,
          "Net profit (cash basis)",
        ],
        [
          "Activity",
          Number(data.net_profit_billed) < 0 ? "text-danger" : "text-success",
          data.net_profit_billed,
          "Net profit (billed basis)",
        ],
      ]
    : [];

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <select className="form-select box w-44" value={preset} onChange={(e) => choose(e.target.value)}>
          {PRESETS.map(([k, l]) => (
            <option key={k} value={k}>
              {l}
            </option>
          ))}
        </select>
        {preset === "custom" && <DateRange from={from} to={to} onFrom={setFrom} onTo={setTo} />}
        <BranchSelect branches={branches} value={branch} onChange={setBranch} />
      </div>
      <ErrorBanner message={error} onClose={() => setError("")} />
      {loading ? (
        <Loading />
      ) : data ? (
        <>
          <div className="grid grid-cols-12 gap-5">
            {cards.map(([icon, tone, value, label]) => (
              <div key={label} className="col-span-12 sm:col-span-6 xl:col-span-3">
                <StatCard icon={icon} tone={tone} value={money(value)} label={label} />
              </div>
            ))}
          </div>
          <div className="grid grid-cols-12 gap-5 mt-5">
            <div className="col-span-12 lg:col-span-7 box p-5">
              <div className="font-medium mb-3">By month</div>
              {(data.by_month || []).length === 0 ? (
                <Empty text="No data." />
              ) : (
                <div className="overflow-x-auto">
                  <table className="table">
                    <thead>
                      <tr>
                        <th>Month</th>
                        <th className="text-right">Collected</th>
                        <th className="text-right">Refunds</th>
                        <th className="text-right">Expenses</th>
                        <th className="text-right">Net</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.by_month.map((m) => {
                        const net = Number(m.collected) - Number(m.refunds) - Number(m.expenses);
                        return (
                          <tr key={m.month}>
                            <td>{monthLabel(m.month)}</td>
                            <td className="text-right">{money(m.collected)}</td>
                            <td className="text-right">{money(m.refunds)}</td>
                            <td className="text-right">{money(m.expenses)}</td>
                            <td className={`text-right font-medium ${net < 0 ? "text-danger" : "text-success"}`}>{money(net)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
            <div className="col-span-12 lg:col-span-5 box p-5">
              <div className="font-medium mb-3">Expenses by category</div>
              <CategoryBars rows={data.expenses_by_category || []} />
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}
