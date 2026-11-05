import { useEffect, useMemo, useState, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { friendlyError } from "@/lib/errors";
import { ErrorBanner, isOverdue, monthlyPrice } from "../shared";
import BillingSummary from "./components/BillingSummary";
import SaasInvoiceList from "./components/SaasInvoiceList";
import UnpaidByIsp from "./components/UnpaidByIsp";

function Main() {
  const [subs, setSubs] = useState([]);
  const [open, setOpen] = useState([]); // unpaid / partial / overdue invoices
  const [monthInvoices, setMonthInvoices] = useState([]);
  const [monthPayments, setMonthPayments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const d = new Date();
      const monthStart = new Date(d.getFullYear(), d.getMonth(), 1).toISOString();
      const [s, o, mi, mp] = await Promise.all([
        supabase
          .from("organization_subscriptions")
          .select("id, status, expires_at, saas_plans(name, price, billing_cycle)"),
        supabase
          .from("saas_invoices")
          .select("id, organization_id, amount, amount_paid, status, due_date, organizations(name)")
          .in("status", ["unpaid", "partial", "overdue"]),
        supabase.from("saas_invoices").select("amount, status").gte("created_at", monthStart).neq("status", "cancelled"),
        supabase.from("saas_payments").select("amount").gte("paid_at", monthStart),
      ]);
      for (const r of [s, o, mi, mp]) if (r.error) throw r.error;
      setSubs(s.data || []);
      setOpen(o.data || []);
      setMonthInvoices(mi.data || []);
      setMonthPayments(mp.data || []);
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const onChanged = () => {
    setRefreshKey((k) => k + 1);
    load();
  };

  const real = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    const bal = (i) => Number(i.amount) - Number(i.amount_paid);
    const overdue = open.filter((i) => i.status === "overdue" || i.due_date < today);
    return {
      billed: monthInvoices.reduce((t, i) => t + Number(i.amount), 0),
      collected: monthPayments.reduce((t, p) => t + Number(p.amount), 0),
      outstanding: open.reduce((t, i) => t + bal(i), 0),
      overdueCount: overdue.length,
      overdueAmount: overdue.reduce((t, i) => t + bal(i), 0),
    };
  }, [open, monthInvoices, monthPayments]);

  const calc = useMemo(() => {
    const now = new Date();
    const in30 = new Date(now.getTime() + 30 * 86400000);
    const active = subs.filter((s) => s.status === "active" && !isOverdue(s));
    const renewals = subs.filter(
      (s) =>
        ["active", "trial"].includes(s.status) &&
        s.expires_at &&
        new Date(s.expires_at) >= now &&
        new Date(s.expires_at) <= in30
    );
    const map = {};
    active.forEach((s) => {
      const n = s.saas_plans?.name || "Unknown";
      map[n] = map[n] || { value: 0, count: 0 };
      map[n].value += monthlyPrice(s.saas_plans);
      map[n].count += 1;
    });
    return {
      mrr: active.reduce((t, s) => t + monthlyPrice(s.saas_plans), 0),
      activeCount: active.length,
      renewals: renewals.length,
      renewalValue: renewals.reduce((t, s) => t + Number(s.saas_plans?.price || 0), 0),
      byPlan: Object.entries(map)
        .map(([label, v]) => ({ label, value: v.value, hint: `${v.count} ISP${v.count === 1 ? "" : "s"}` }))
        .sort((a, b) => b.value - a.value),
    };
  }, [subs]);

  return (
    <div className="p-5">
      <div className="intro-y flex items-center h-10 mb-5">
        <h2 className="text-lg font-medium truncate mr-auto">SaaS Billing</h2>
        <button className="btn btn-outline-secondary" onClick={onChanged} disabled={loading}>
          {loading ? "Loading..." : "Refresh"}
        </button>
      </div>

      <ErrorBanner message={error} onClose={() => setError("")} />

      <BillingSummary real={real} calc={calc} loading={loading} />

      <div className="space-y-6">
        <SaasInvoiceList refreshKey={refreshKey} onChanged={onChanged} />
        <UnpaidByIsp invoices={open} loading={loading} />
      </div>
    </div>
  );
}

export default Main;
