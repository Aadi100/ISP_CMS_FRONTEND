import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { friendlyError } from "@/lib/errors";
import { money, formatDate, titleCase } from "@/lib/format";
import AuditLogTab from "./AuditLogTab";
import {
  ErrorBanner,
  BarList,
  ColumnChart,
  downloadCsv,
  lastMonths,
  monthKey,
  monthLabel,
  monthlyPrice,
  SUB_STATUSES,
} from "../shared";

function Main() {
  const [orgs, setOrgs] = useState([]);
  const [subs, setSubs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [tab, setTab] = useState("reports");

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const [o, s] = await Promise.all([
        supabase
          .from("organizations")
          .select("id, name, slug, status, city, owner_name, email, created_at")
          .order("created_at"),
        supabase
          .from("organization_subscriptions")
          .select("id, organization_id, status, started_at, expires_at, updated_at, organizations(name), saas_plans(name, price, billing_cycle)"),
      ]);
      if (o.error) throw o.error;
      if (s.error) throw s.error;
      setOrgs(o.data || []);
      setSubs(s.data || []);
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const r = useMemo(() => {
    const months = lastMonths(12);
    const counts = Object.fromEntries(months.map((m) => [m, 0]));
    orgs.forEach((o) => {
      const k = monthKey(o.created_at);
      if (k in counts) counts[k] += 1;
    });
    const growth = months.map((m) => ({ label: monthLabel(m), value: counts[m] }));

    const byStatus = SUB_STATUSES.map((s) => ({
      label: titleCase(s),
      value: subs.filter((x) => x.status === s).length,
    })).filter((x) => x.value > 0);

    const planMap = {};
    subs.forEach((x) => {
      const n = x.saas_plans?.name || "Unknown";
      planMap[n] = (planMap[n] || 0) + 1;
    });
    const byPlan = Object.entries(planMap)
      .map(([label, value]) => ({ label, value }))
      .sort((a, b) => b.value - a.value);

    const churned = subs.filter((x) => ["expired", "cancelled"].includes(x.status));
    // an ISP is churned only if it has no live subscription at all
    const liveOrgIds = new Set(subs.filter((x) => ["active", "trial"].includes(x.status)).map((x) => x.organization_id));
    const churnedOrgs = new Set(churned.map((x) => x.organization_id).filter((id) => !liveOrgIds.has(id)));
    const churnRate = orgs.length ? (churnedOrgs.size / orgs.length) * 100 : 0;
    const lostMrr = churned
      .filter((x) => churnedOrgs.has(x.organization_id))
      .reduce((t, x) => t + monthlyPrice(x.saas_plans), 0);

    const orgStatus = ["active", "inactive", "suspended"].map((s) => ({
      label: titleCase(s),
      value: orgs.filter((o) => o.status === s).length,
    }));

    return { growth, byStatus, byPlan, churned, churnedOrgs, churnRate, lostMrr, orgStatus };
  }, [orgs, subs]);

  const exportOrgs = () =>
    downloadCsv("isp-organizations.csv", [
      ["Name", "Slug", "Status", "Owner", "E-mail", "City", "Joined"],
      ...orgs.map((o) => [o.name, o.slug, o.status, o.owner_name, o.email, o.city, formatDate(o.created_at)]),
    ]);

  const exportSubs = () =>
    downloadCsv("isp-subscriptions.csv", [
      ["ISP", "Plan", "Price", "Billing cycle", "Status", "Started", "Expires"],
      ...subs.map((s) => [
        s.organizations?.name,
        s.saas_plans?.name,
        s.saas_plans?.price,
        s.saas_plans?.billing_cycle,
        s.status,
        formatDate(s.started_at),
        formatDate(s.expires_at),
      ]),
    ]);

  const exportGrowth = () =>
    downloadCsv("organizations-growth.csv", [
      ["Month", "New ISPs"],
      ...r.growth.map((g) => [g.label, g.value]),
    ]);

  return (
    <div className="p-5">
      <div className="intro-y flex flex-wrap items-center gap-2 mb-5">
        <h2 className="text-lg font-medium truncate mr-auto">Platform Reports</h2>
        <button className="btn btn-outline-secondary" onClick={exportOrgs} disabled={loading || !orgs.length}>
          Export ISPs (CSV)
        </button>
        <button className="btn btn-outline-secondary" onClick={exportSubs} disabled={loading || !subs.length}>
          Export subscriptions (CSV)
        </button>
        <button className="btn btn-outline-secondary" onClick={exportGrowth} disabled={loading}>
          Export growth (CSV)
        </button>
      </div>

      <ErrorBanner message={error} onClose={() => setError("")} />

      <div className="flex gap-2 mb-5">
        <button className={`btn ${tab === "reports" ? "btn-primary" : "btn-outline-secondary"}`} onClick={() => setTab("reports")}>
          Reports
        </button>
        <button className={`btn ${tab === "audit" ? "btn-primary" : "btn-outline-secondary"}`} onClick={() => setTab("audit")}>
          Audit log
        </button>
      </div>

      {tab === "audit" && <AuditLogTab />}

      <div className={`grid grid-cols-12 gap-6 ${tab === "audit" ? "hidden" : ""}`}>
        <div className="intro-y col-span-12 sm:col-span-4">
          <div className="box p-5">
            <div className="text-slate-500">Total ISPs</div>
            <div className="text-2xl font-medium mt-2">{loading ? "..." : orgs.length}</div>
          </div>
        </div>
        <div className="intro-y col-span-12 sm:col-span-4">
          <div className="box p-5">
            <div className="text-slate-500">Churned ISPs (no live subscription)</div>
            <div className="text-2xl font-medium mt-2 text-danger">
              {loading ? "..." : `${r.churnedOrgs.size} (${r.churnRate.toFixed(1)}%)`}
            </div>
          </div>
        </div>
        <div className="intro-y col-span-12 sm:col-span-4">
          <div className="box p-5">
            <div className="text-slate-500">Monthly revenue lost to churn (calculated)</div>
            <div className="text-2xl font-medium mt-2">{loading ? "..." : money(r.lostMrr)}</div>
          </div>
        </div>

        <div className="intro-y col-span-12 lg:col-span-7">
          <div className="box p-5">
            <h3 className="text-base font-medium mb-4">New ISPs per month (last 12 months)</h3>
            {loading ? <div className="text-slate-500">Loading...</div> : <ColumnChart items={r.growth} empty="No ISPs created in the last 12 months." />}
          </div>
        </div>
        <div className="intro-y col-span-12 lg:col-span-5">
          <div className="box p-5">
            <h3 className="text-base font-medium mb-4">ISPs by status</h3>
            <BarList items={r.orgStatus} empty="No ISPs yet." />
          </div>
        </div>

        <div className="intro-y col-span-12 lg:col-span-6">
          <div className="box p-5">
            <h3 className="text-base font-medium mb-4">Subscriptions by status</h3>
            <BarList items={r.byStatus} empty="No subscriptions yet." />
          </div>
        </div>
        <div className="intro-y col-span-12 lg:col-span-6">
          <div className="box p-5">
            <h3 className="text-base font-medium mb-4">Subscriptions by plan</h3>
            <BarList items={r.byPlan} empty="No subscriptions yet." />
          </div>
        </div>

        <div className="intro-y col-span-12">
          <div className="box p-5">
            <h3 className="text-base font-medium mb-4">Churn: expired and cancelled subscriptions</h3>
            <div className="overflow-x-auto">
              <table className="table table-report">
                <thead>
                  <tr><th>ISP</th><th>PLAN</th><th>STATUS</th><th>ENDED / EXPIRED</th></tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr><td colSpan="4" className="text-center">Loading...</td></tr>
                  ) : r.churned.length === 0 ? (
                    <tr><td colSpan="4" className="text-center">No expired or cancelled subscriptions.</td></tr>
                  ) : (
                    r.churned.map((s) => (
                      <tr key={s.id}>
                        <td className="font-medium">{s.organizations?.name}</td>
                        <td>{s.saas_plans?.name}</td>
                        <td>{titleCase(s.status)}</td>
                        <td>{formatDate(s.expires_at || s.updated_at)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default Main;
