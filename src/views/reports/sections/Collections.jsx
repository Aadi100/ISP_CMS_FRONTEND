import { fetchAll } from "../fetchAll";
import { useLoader, num, groupBy, monthKey, dayKey, monthLabel, startIso, endIso } from "../useLoader";
import { money, formatDate, titleCase } from "@/lib/format";
import ReportTable from "../components/ReportTable";
import DataChart from "../components/DataChart";
import { Stat, ChartBox, Section } from "../components/ui";

function Collections({ filters, canExport }) {
  const state = useLoader(async () => {
    const [pays, refunds] = await Promise.all([
      fetchAll(
        "v_payment_ledger",
        "id,receipt_number,subscriber_name,area_name,amount,method,paid_at,invoice_id",
        (q) => {
          q = q.eq("status", "confirmed").neq("method", "advance_credit");
          if (filters.from) q = q.gte("paid_at", startIso(filters.from));
          if (filters.to) q = q.lte("paid_at", endIso(filters.to));
          if (filters.areaName) q = q.eq("area_name", filters.areaName);
          return q;
        }
      ),
      fetchAll(
        "v_refund_ledger",
        "id,refund_number,receipt_number,subscriber_name,amount,method,reason,refunded_at",
        (q) => {
          if (filters.from) q = q.gte("refunded_at", startIso(filters.from));
          if (filters.to) q = q.lte("refunded_at", endIso(filters.to));
          return q;
        }
      ),
    ]);

    const agg = (keyFn) =>
      groupBy(
        pays,
        keyFn,
        (key) => ({ key, count: 0, total: 0 }),
        (g, r) => {
          g.count += 1;
          g.total += num(r.amount);
        }
      );

    return {
      pays,
      refunds,
      total: pays.reduce((s, r) => s + num(r.amount), 0),
      refundTotal: refunds.reduce((s, r) => s + num(r.amount), 0),
      advance: pays.filter((r) => !r.invoice_id).reduce((s, r) => s + num(r.amount), 0),
      byMonth: agg((r) => monthKey(r.paid_at)).sort((a, b) => a.key.localeCompare(b.key)),
      byMethod: agg((r) => r.method).sort((a, b) => b.total - a.total),
      byDay: agg((r) => dayKey(r.paid_at)).sort((a, b) => b.key.localeCompare(a.key)),
    };
  }, [filters.from, filters.to, filters.areaName]);

  return (
    <Section state={state}>
      {(d) => (
        <>
          <div className="col-span-12 sm:col-span-6 lg:col-span-3">
            <Stat icon="Wallet" color="text-success" label="Cash collected (excl. advance credit used)" value={money(d.total)} />
          </div>
          <div className="col-span-12 sm:col-span-6 lg:col-span-3">
            <Stat icon="Download" color="text-primary" label="Payments received" value={d.pays.length.toLocaleString()} />
          </div>
          <div className="col-span-12 sm:col-span-6 lg:col-span-3">
            <Stat icon="RotateCcw" color="text-danger" label="Refunded" value={money(d.refundTotal)} />
          </div>
          <div className="col-span-12 sm:col-span-6 lg:col-span-3">
            <Stat icon="PiggyBank" color="text-warning" label="Of which advance payments" value={money(d.advance)} />
          </div>

          <div className="col-span-12 lg:col-span-8">
            <ChartBox title="Collections per month" empty={d.byMonth.length === 0}>
              <DataChart
                labels={d.byMonth.map((m) => monthLabel(m.key))}
                datasets={[{ label: "Collected (PKR)", data: d.byMonth.map((m) => m.total) }]}
              />
            </ChartBox>
          </div>
          <div className="col-span-12 lg:col-span-4">
            <ChartBox title="By payment method" empty={d.byMethod.length === 0}>
              <DataChart
                type="doughnut"
                labels={d.byMethod.map((m) => titleCase(m.key))}
                datasets={[{ data: d.byMethod.map((m) => m.total) }]}
              />
            </ChartBox>
          </div>

          <div className="col-span-12 lg:col-span-6">
            <ReportTable
              title="Collections by method"
              filename="collections_by_method"
              canExport={canExport}
              rows={d.byMethod}
              columns={[
                { key: "key", label: "Method", render: (r) => titleCase(r.key), csv: (r) => titleCase(r.key) },
                { key: "count", label: "Payments", align: "right" },
                { key: "total", label: "Amount (PKR)", align: "right", render: (r) => money(r.total), csv: (r) => r.total },
              ]}
            />
          </div>
          <div className="col-span-12 lg:col-span-6">
            <ReportTable
              title="Collections by day"
              filename="collections_by_day"
              canExport={canExport}
              rows={d.byDay}
              columns={[
                { key: "key", label: "Date", render: (r) => formatDate(r.key), csv: (r) => r.key },
                { key: "count", label: "Payments", align: "right" },
                { key: "total", label: "Amount (PKR)", align: "right", render: (r) => money(r.total), csv: (r) => r.total },
              ]}
            />
          </div>
          <div className="col-span-12">
            <ReportTable
              title="Refunds"
              filename="refunds"
              canExport={canExport}
              rows={d.refunds}
              empty="No refunds in this period."
              columns={[
                { key: "refund_number", label: "Refund #" },
                { key: "receipt_number", label: "Receipt #" },
                { key: "subscriber_name", label: "Subscriber" },
                { key: "method", label: "Method", render: (r) => titleCase(r.method), csv: (r) => r.method },
                { key: "reason", label: "Reason" },
                { key: "refunded_at", label: "Date", render: (r) => formatDate(r.refunded_at), csv: (r) => r.refunded_at },
                { key: "amount", label: "Amount (PKR)", align: "right", render: (r) => money(r.amount), csv: (r) => r.amount },
              ]}
            />
          </div>
        </>
      )}
    </Section>
  );
}

export default Collections;
