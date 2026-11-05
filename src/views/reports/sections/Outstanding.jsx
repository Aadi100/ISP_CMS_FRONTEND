import { fetchAll } from "../fetchAll";
import { useLoader, num } from "../useLoader";
import { money, formatDate, titleCase } from "@/lib/format";
import ReportTable from "../components/ReportTable";
import DataChart from "../components/DataChart";
import { Stat, ChartBox, Section, Badge } from "../components/ui";

const BUCKETS = [
  { key: "current", label: "Not yet due", test: (d) => d <= 0 },
  { key: "b1", label: "0-30 days past due", test: (d) => d > 0 && d <= 30 },
  { key: "b2", label: "31-60 days past due", test: (d) => d > 30 && d <= 60 },
  { key: "b3", label: "61+ days past due", test: (d) => d > 60 },
];

function daysPastDue(due) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const d = new Date(`${due}T00:00:00`);
  return Math.floor((today - d) / 86400000);
}

const statusTone = { overdue: "danger", partial: "warning", unpaid: "pending", paid: "success" };

function Outstanding({ filters, canExport }) {
  const state = useLoader(async () => {
    const rows = await fetchAll(
      "v_invoice_summary",
      "id,invoice_number,subscriber_name,area_name,billing_month,due_date,amount,amount_paid,balance_due,payment_status,promised_date",
      (q) => {
        q = q.neq("invoice_status", "cancelled").gt("balance_due", 0);
        if (filters.from) q = q.gte("due_date", filters.from);
        if (filters.to) q = q.lte("due_date", filters.to);
        if (filters.areaName) q = q.eq("area_name", filters.areaName);
        if (filters.branchId) q = q.eq("subscriber_branch_id", filters.branchId);
        return q;
      }
    );
    const withAge = rows
      .map((r) => ({ ...r, days: daysPastDue(r.due_date) }))
      .sort((a, b) => b.days - a.days);
    const ageing = BUCKETS.map((b) => {
      const list = withAge.filter((r) => b.test(r.days));
      return { key: b.key, label: b.label, count: list.length, total: list.reduce((s, r) => s + num(r.balance_due), 0) };
    });
    return {
      list: withAge,
      ageing,
      pastDue: withAge.filter((r) => r.days > 0),
      promised: withAge.filter((r) => r.promised_date),
      total: withAge.reduce((s, r) => s + num(r.balance_due), 0),
    };
  }, [filters.from, filters.to, filters.areaName, filters.branchId]);

  const invoiceColumns = [
    { key: "invoice_number", label: "Invoice #" },
    { key: "subscriber_name", label: "Subscriber" },
    { key: "area_name", label: "Area" },
    { key: "due_date", label: "Due date", render: (r) => formatDate(r.due_date), csv: (r) => r.due_date },
    { key: "days", label: "Days past due", align: "right", render: (r) => (r.days > 0 ? r.days : "—"), csv: (r) => Math.max(r.days, 0) },
    { key: "amount", label: "Amount (PKR)", align: "right", render: (r) => money(r.amount), csv: (r) => r.amount },
    { key: "balance_due", label: "Balance (PKR)", align: "right", render: (r) => money(r.balance_due), csv: (r) => r.balance_due },
    {
      key: "payment_status",
      label: "Status",
      align: "center",
      render: (r) => <Badge tone={statusTone[r.payment_status] || "pending"}>{titleCase(r.payment_status)}</Badge>,
      csv: (r) => r.payment_status,
    },
  ];

  return (
    <Section state={state}>
      {(d) => (
        <>
          <div className="col-span-12 sm:col-span-4">
            <Stat icon="AlertCircle" color="text-danger" label="Total outstanding" value={money(d.total)} />
          </div>
          <div className="col-span-12 sm:col-span-4">
            <Stat icon="Clock" color="text-warning" label="Invoices past due" value={d.pastDue.length.toLocaleString()} />
          </div>
          <div className="col-span-12 sm:col-span-4">
            <Stat icon="CalendarCheck" color="text-primary" label="Promised to pay" value={d.promised.length.toLocaleString()} />
          </div>

          <div className="col-span-12 lg:col-span-5">
            <ChartBox title="Ageing (balance by days past due)" empty={d.list.length === 0}>
              <DataChart labels={d.ageing.map((b) => b.label)} datasets={[{ label: "Balance (PKR)", data: d.ageing.map((b) => b.total) }]} />
            </ChartBox>
          </div>
          <div className="col-span-12 lg:col-span-7">
            <ReportTable
              title="Ageing buckets"
              filename="ageing_buckets"
              canExport={canExport}
              rows={d.ageing}
              pageSize={10}
              columns={[
                { key: "label", label: "Bucket" },
                { key: "count", label: "Invoices", align: "right" },
                { key: "total", label: "Balance (PKR)", align: "right", render: (r) => money(r.total), csv: (r) => r.total },
              ]}
            />
          </div>

          <div className="col-span-12">
            <ReportTable
              title="Outstanding & overdue invoices"
              filename="outstanding_invoices"
              canExport={canExport}
              rows={d.list}
              empty="No outstanding invoices."
              columns={invoiceColumns}
            />
          </div>
          <div className="col-span-12">
            <ReportTable
              title="Promised to pay"
              filename="promised_to_pay"
              canExport={canExport}
              rows={d.promised}
              empty="No promises to pay recorded."
              columns={[
                { key: "invoice_number", label: "Invoice #" },
                { key: "subscriber_name", label: "Subscriber" },
                { key: "due_date", label: "Due date", render: (r) => formatDate(r.due_date), csv: (r) => r.due_date },
                { key: "promised_date", label: "Promised date", render: (r) => formatDate(r.promised_date), csv: (r) => r.promised_date },
                { key: "balance_due", label: "Balance (PKR)", align: "right", render: (r) => money(r.balance_due), csv: (r) => r.balance_due },
              ]}
            />
          </div>
        </>
      )}
    </Section>
  );
}

export default Outstanding;
