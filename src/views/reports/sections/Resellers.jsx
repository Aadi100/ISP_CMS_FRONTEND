import { fetchAll } from "../fetchAll";
import { useLoader, num, groupBy, monthKey, monthLabel, startIso, endIso } from "../useLoader";
import { money, titleCase } from "@/lib/format";
import ReportTable from "../components/ReportTable";
import DataChart from "../components/DataChart";
import { Stat, ChartBox, Section, Badge } from "../components/ui";

function Resellers({ filters, canExport }) {
  const state = useLoader(async () => {
    const [resellers, pays] = await Promise.all([
      fetchAll(
        "v_reseller_overview",
        "id,reseller_code,name,status,wallet_balance,low_wallet_threshold,is_low_wallet,subscribers_count,monthly_collections",
        (q) => {
          if (filters.areaId) q = q.eq("area_id", filters.areaId);
          if (filters.branchId) q = q.eq("branch_id", filters.branchId);
          return q;
        }
      ),
      fetchAll(
        "v_payment_ledger",
        "id,reseller_id,amount,paid_at",
        (q) => {
          q = q.eq("status", "confirmed").neq("method", "advance_credit").not("reseller_id", "is", null);
          if (filters.from) q = q.gte("paid_at", startIso(filters.from));
          if (filters.to) q = q.lte("paid_at", endIso(filters.to));
          return q;
        }
      ),
    ]);
    const names = new Map(resellers.map((r) => [r.id, r.name]));
    const mine = pays.filter((p) => names.has(p.reseller_id));
    const monthly = groupBy(
      mine,
      (p) => `${monthKey(p.paid_at)}|${p.reseller_id}`,
      (k) => ({ key: k, month: k.split("|")[0], name: names.get(k.split("|")[1]), count: 0, total: 0 }),
      (g, p) => {
        g.count += 1;
        g.total += num(p.amount);
      }
    ).sort((a, b) => b.month.localeCompare(a.month) || a.name.localeCompare(b.name));
    const perMonth = groupBy(monthly, (r) => r.month, (key) => ({ key, total: 0 }), (g, r) => (g.total += r.total)).sort((a, b) => a.key.localeCompare(b.key));

    return {
      resellers,
      monthly,
      perMonth,
      wallets: resellers.reduce((s, r) => s + num(r.wallet_balance), 0),
      low: resellers.filter((r) => r.is_low_wallet).length,
      collected: mine.reduce((s, p) => s + num(p.amount), 0),
    };
  }, [filters.from, filters.to, filters.areaId, filters.branchId]);

  return (
    <Section state={state}>
      {(d) => (
        <>
          <div className="col-span-12 sm:col-span-6 lg:col-span-3">
            <Stat icon="Users" label="Resellers" value={d.resellers.length.toLocaleString()} />
          </div>
          <div className="col-span-12 sm:col-span-6 lg:col-span-3">
            <Stat icon="Wallet" color="text-success" label="Total wallet balance" value={money(d.wallets)} />
          </div>
          <div className="col-span-12 sm:col-span-6 lg:col-span-3">
            <Stat icon="AlertCircle" color="text-warning" label="Low wallets" value={d.low.toLocaleString()} />
          </div>
          <div className="col-span-12 sm:col-span-6 lg:col-span-3">
            <Stat icon="Download" color="text-primary" label="Collected in period" value={money(d.collected)} />
          </div>

          <div className="col-span-12">
            <ChartBox title="Reseller collections per month" empty={d.perMonth.length === 0}>
              <DataChart labels={d.perMonth.map((m) => monthLabel(m.key))} datasets={[{ label: "Collected (PKR)", data: d.perMonth.map((m) => m.total) }]} />
            </ChartBox>
          </div>

          <div className="col-span-12">
            <ReportTable
              title="Wallet balances"
              filename="reseller_wallets"
              canExport={canExport}
              rows={d.resellers}
              empty="No resellers."
              columns={[
                { key: "reseller_code", label: "Code" },
                { key: "name", label: "Reseller" },
                { key: "status", label: "Status", render: (r) => titleCase(r.status), csv: (r) => r.status },
                { key: "subscribers_count", label: "Subscribers", align: "right" },
                { key: "wallet_balance", label: "Wallet (PKR)", align: "right", render: (r) => money(r.wallet_balance), csv: (r) => r.wallet_balance },
                {
                  key: "is_low_wallet",
                  label: "Wallet state",
                  align: "center",
                  render: (r) => <Badge tone={r.is_low_wallet ? "danger" : "success"}>{r.is_low_wallet ? "Low" : "OK"}</Badge>,
                  csv: (r) => (r.is_low_wallet ? "low" : "ok"),
                },
                { key: "monthly_collections", label: "Collected this month (PKR)", align: "right", render: (r) => money(r.monthly_collections), csv: (r) => r.monthly_collections },
              ]}
            />
          </div>
          <div className="col-span-12">
            <ReportTable
              title="Collections by reseller per month"
              filename="reseller_collections"
              canExport={canExport}
              rows={d.monthly}
              empty="No reseller collections in this period."
              columns={[
                { key: "month", label: "Month", render: (r) => monthLabel(r.month), csv: (r) => r.month },
                { key: "name", label: "Reseller" },
                { key: "count", label: "Payments", align: "right" },
                { key: "total", label: "Collected (PKR)", align: "right", render: (r) => money(r.total), csv: (r) => r.total },
              ]}
            />
          </div>
        </>
      )}
    </Section>
  );
}

export default Resellers;
