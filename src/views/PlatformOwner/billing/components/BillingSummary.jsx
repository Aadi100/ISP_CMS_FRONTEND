import { money } from "@/lib/format";
import { BarList } from "../../shared";

function Card({ label, value, hint, danger, loading }) {
  return (
    <div className="intro-y col-span-12 sm:col-span-6 xl:col-span-3">
      <div className="box p-5">
        <div className="text-slate-500">{label}</div>
        <div className={`text-2xl font-medium mt-2 ${danger ? "text-danger" : ""}`}>{loading ? "..." : value}</div>
        {hint && <div className="text-slate-500 text-xs mt-1">{hint}</div>}
      </div>
    </div>
  );
}

/** real = { billed, collected, outstanding, overdueCount, overdueAmount }, calc = { mrr, activeCount, renewals, renewalValue, byPlan } */
export default function BillingSummary({ real, calc, loading }) {
  return (
    <div className="grid grid-cols-12 gap-6 mb-6">
      <Card label="Billed this month" value={money(real.billed)} hint="SaaS invoices created this month" loading={loading} />
      <Card label="Collected this month" value={money(real.collected)} hint="Payments recorded this month" loading={loading} />
      <Card label="Outstanding" value={money(real.outstanding)} hint="Unpaid balance of open invoices" loading={loading} />
      <Card
        label="Overdue"
        value={`${real.overdueCount} (${money(real.overdueAmount)})`}
        hint="Past due date and not fully paid"
        danger={real.overdueCount > 0}
        loading={loading}
      />

      <div className="intro-y col-span-12 lg:col-span-6">
        <div className="box p-5">
          <h3 className="text-base font-medium mb-1">Subscription revenue (calculated)</h3>
          <div className="text-slate-500 text-xs mb-4">
            Expected, not received: active subscriptions x plan price (monthly equivalent).
          </div>
          <div className="flex gap-8 mb-4">
            <div>
              <div className="text-slate-500 text-xs">Expected MRR</div>
              <div className="text-xl font-medium">{loading ? "..." : money(calc.mrr)}</div>
              <div className="text-slate-500 text-xs">{calc.activeCount} active subscriptions</div>
            </div>
            <div>
              <div className="text-slate-500 text-xs">Renewals in 30 days</div>
              <div className="text-xl font-medium">{loading ? "..." : money(calc.renewalValue)}</div>
              <div className="text-slate-500 text-xs">{calc.renewals} subscriptions</div>
            </div>
          </div>
        </div>
      </div>
      <div className="intro-y col-span-12 lg:col-span-6">
        <div className="box p-5">
          <h3 className="text-base font-medium mb-4">Revenue by plan (calculated MRR)</h3>
          <BarList items={calc.byPlan} format={(v) => money(v)} empty="No active subscriptions." />
        </div>
      </div>
    </div>
  );
}
