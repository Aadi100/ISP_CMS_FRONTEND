import { fetchAll } from "../fetchAll";
import { useLoader, num, groupBy, monthKey, monthLabel } from "../useLoader";
import { money } from "@/lib/format";
import ReportTable from "../components/ReportTable";
import DataChart from "../components/DataChart";
import { Stat, ChartBox, Section } from "../components/ui";

function Revenue({ filters, canExport }) {
  const state = useLoader(async () => {
    const rows = await fetchAll(
      "v_invoice_summary",
      "id,billing_month,amount,amount_paid,balance_due",
      (q) => {
        q = q.neq("invoice_status", "cancelled");
        if (filters.from) q = q.gte("billing_month", `${filters.from.slice(0, 7)}-01`);
        if (filters.to) q = q.lte("billing_month", filters.to);
        if (filters.areaName) q = q.eq("area_name", filters.areaName);
        if (filters.branchId) q = q.eq("subscriber_branch_id", filters.branchId);
        return q;
      }
    );
    const months = groupBy(
      rows,
      (r) => monthKey(r.billing_month),
      (key) => ({ key, invoices: 0, billed: 0, collected: 0, outstanding: 0 }),
      (g, r) => {
        g.invoices += 1;
        g.billed += num(r.amount);
        g.collected += num(r.amount_paid);
        g.outstanding += num(r.balance_due);
      }
    ).sort((a, b) => a.key.localeCompare(b.key));
    const sum = (k) => months.reduce((s, m) => s + m[k], 0);
    return { months, invoices: rows.length, billed: sum("billed"), collected: sum("collected"), outstanding: sum("outstanding") };
  }, [filters.from, filters.to, filters.areaName, filters.branchId]);

  return (
    <Section state={state}>
      {(d) => (
        <>
          <div className="col-span-12 sm:col-span-6 lg:col-span-3">
            <Stat icon="FileText" label="Invoices" value={d.invoices.toLocaleString()} />
          </div>
          <div className="col-span-12 sm:col-span-6 lg:col-span-3">
            <Stat icon="Receipt" label="Billed" value={money(d.billed)} />
          </div>
          <div className="col-span-12 sm:col-span-6 lg:col-span-3">
            <Stat icon="Wallet" color="text-success" label="Collected against invoices" value={money(d.collected)} />
          </div>
          <div className="col-span-12 sm:col-span-6 lg:col-span-3">
            <Stat icon="AlertCircle" color="text-danger" label="Outstanding" value={money(d.outstanding)} />
          </div>
          <div className="col-span-12">
            <ChartBox title="Billed vs collected vs outstanding by billing period" empty={d.months.length === 0}>
              <DataChart
                labels={d.months.map((m) => monthLabel(m.key))}
                datasets={[
                  { label: "Billed", data: d.months.map((m) => m.billed) },
                  { label: "Collected", data: d.months.map((m) => m.collected) },
                  { label: "Outstanding", data: d.months.map((m) => m.outstanding) },
                ]}
              />
            </ChartBox>
          </div>
          <div className="col-span-12">
            <ReportTable
              title="Revenue by billing period"
              filename="revenue_by_billing_period"
              canExport={canExport}
              rows={d.months}
              columns={[
                { key: "key", label: "Billing period", render: (r) => monthLabel(r.key), csv: (r) => r.key },
                { key: "invoices", label: "Invoices", align: "right" },
                { key: "billed", label: "Billed (PKR)", align: "right", render: (r) => money(r.billed), csv: (r) => r.billed },
                { key: "collected", label: "Collected (PKR)", align: "right", render: (r) => money(r.collected), csv: (r) => r.collected },
                { key: "outstanding", label: "Outstanding (PKR)", align: "right", render: (r) => money(r.outstanding), csv: (r) => r.outstanding },
                {
                  key: "rate",
                  label: "Collection rate",
                  align: "right",
                  render: (r) => (r.billed ? `${Math.round((r.collected / r.billed) * 100)}%` : "—"),
                  csv: (r) => (r.billed ? Math.round((r.collected / r.billed) * 100) : ""),
                },
              ]}
            />
          </div>
        </>
      )}
    </Section>
  );
}

export default Revenue;
