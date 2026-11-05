import classnames from "classnames";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { friendlyError } from "@/lib/errors";
import { money, formatDate, titleCase } from "@/lib/format";

const BADGE = {
  paid: "bg-success/20 text-success",
  partial: "bg-warning/20 text-warning",
  unpaid: "bg-warning/20 text-warning",
  overdue: "bg-danger/20 text-danger",
  cancelled: "bg-slate-200 text-slate-500",
};

function Usage({ label, used, max }) {
  const unlimited = max == null;
  const pct = unlimited || !max ? 0 : Math.min(100, Math.round((used / max) * 100));
  return (
    <div>
      <div className="flex text-sm mb-1">
        <span>{label}</span>
        <span className="ml-auto text-slate-500">{used ?? 0} / {unlimited ? "Unlimited" : max}</span>
      </div>
      <div className="h-2 rounded-full bg-slate-200 dark:bg-darkmode-400 overflow-hidden">
        <div className={classnames("h-full", pct >= 90 ? "bg-danger" : "bg-primary")} style={{ width: unlimited ? "0%" : `${pct}%` }}></div>
      </div>
    </div>
  );
}

function SubscriptionTab() {
  const [sub, setSub] = useState(null);
  const [invoices, setInvoices] = useState([]);
  const [payments, setPayments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const [s, i, p] = await Promise.all([
          supabase.rpc("get_my_subscription"),
          supabase.from("saas_invoices").select("*").order("period_start", { ascending: false }),
          supabase.from("saas_payments").select("*").order("paid_at", { ascending: false }),
        ]);
        if (s.error) throw s.error;
        if (i.error) throw i.error;
        if (p.error) throw p.error;
        setSub(Array.isArray(s.data) ? s.data[0] : s.data);
        setInvoices(i.data || []);
        setPayments(p.data || []);
      } catch (e) {
        setError(friendlyError(e));
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) return <div className="intro-y box p-5 text-slate-500 text-sm">Loading subscription...</div>;
  if (error) return <div className="alert alert-danger show">{error}</div>;

  const features = Array.isArray(sub?.features)
    ? sub.features
    : sub?.features && typeof sub.features === "object"
    ? Object.entries(sub.features).filter(([, v]) => v).map(([k]) => k)
    : [];
  const notLive = sub && (sub.is_live === false || Number(sub.unpaid_invoices) > 0);

  return (
    <div className="space-y-6">
      {notLive && (
        <div className="alert alert-danger show text-sm">
          {sub.is_live === false
            ? "Your subscription is not active. Adding customers and invoices is blocked until it is renewed."
            : null}{" "}
          {Number(sub.unpaid_invoices) > 0 ? `You have ${sub.unpaid_invoices} unpaid platform bill(s).` : null}
        </div>
      )}
      <div className="intro-y box p-5">
        <div className="text-base font-medium mb-4">Current plan</div>
        {!sub || !sub.plan ? (
          <div className="text-slate-500 text-sm">No subscription plan is assigned to your ISP.</div>
        ) : (
          <div className="grid grid-cols-12 gap-4">
            {[
              ["Plan", sub.plan],
              ["Price", `${money(sub.price)} / ${sub.billing_cycle || "month"}`],
              ["Status", titleCase(sub.status)],
              ["Started", formatDate(sub.started_at)],
              ["Expires", formatDate(sub.expires_at)],
              ["Days left", sub.days_left ?? "—"],
            ].map(([k, v]) => (
              <div key={k} className="col-span-6 sm:col-span-4 lg:col-span-2">
                <div className="text-xs text-slate-500">{k}</div>
                <div className="font-medium">{v}</div>
              </div>
            ))}
            <div className="col-span-12 sm:col-span-6"><Usage label="Subscribers" used={sub.subscribers_used} max={sub.max_subscribers} /></div>
            <div className="col-span-12 sm:col-span-6"><Usage label="Staff accounts" used={sub.staff_used} max={sub.max_staff} /></div>
            {features.length > 0 && (
              <div className="col-span-12">
                <div className="text-xs text-slate-500 mb-1">Included features</div>
                <div className="flex flex-wrap gap-2">
                  {features.map((f) => (
                    <span key={String(f)} className="py-1 px-2 rounded-full text-xs bg-slate-100 dark:bg-darkmode-400">{titleCase(String(f))}</span>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="intro-y box p-5">
        <div className="text-base font-medium mb-4">Platform bills</div>
        {invoices.length === 0 ? (
          <div className="text-slate-500 text-sm">No bills yet.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="table w-full text-sm min-w-[700px]">
              <thead>
                <tr><th>INVOICE</th><th>PERIOD</th><th className="text-right">AMOUNT</th><th className="text-right">PAID</th><th>STATUS</th><th>DUE</th></tr>
              </thead>
              <tbody>
                {invoices.map((v) => (
                  <tr key={v.id}>
                    <td className="font-medium">{v.invoice_number}</td>
                    <td className="whitespace-nowrap">{formatDate(v.period_start)} - {formatDate(v.period_end)}</td>
                    <td className="text-right">{money(v.amount)}</td>
                    <td className="text-right">{money(v.amount_paid)}</td>
                    <td><span className={classnames("py-1 px-2 rounded-full text-xs font-medium", BADGE[v.status])}>{titleCase(v.status)}</span></td>
                    <td className="whitespace-nowrap">{formatDate(v.due_date)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="intro-y box p-5">
        <div className="text-base font-medium mb-4">Payments to the platform</div>
        {payments.length === 0 ? (
          <div className="text-slate-500 text-sm">No payments recorded.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="table w-full text-sm min-w-[600px]">
              <thead>
                <tr><th>DATE</th><th>BILL</th><th>METHOD</th><th>REFERENCE</th><th className="text-right">AMOUNT</th></tr>
              </thead>
              <tbody>
                {payments.map((p) => (
                  <tr key={p.id}>
                    <td className="whitespace-nowrap">{formatDate(p.paid_at)}</td>
                    <td>{invoices.find((v) => v.id === p.saas_invoice_id)?.invoice_number || "—"}</td>
                    <td>{titleCase(p.method)}</td>
                    <td>{p.reference || "—"}</td>
                    <td className="text-right">{money(p.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

export default SubscriptionTab;
