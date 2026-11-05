import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { friendlyError } from "@/lib/errors";
import { money, formatDate, formatDateTime, titleCase } from "@/lib/format";
import { StatusBadge, ErrorBanner, BarList } from "./shared";

function StatCard({ label, value, loading, hint }) {
  return (
    <div className="intro-y col-span-12 sm:col-span-6 xl:col-span-3">
      <div className="box p-5">
        <div className="text-slate-500">{label}</div>
        <div className="text-2xl font-medium mt-2">{loading ? "..." : value}</div>
        {hint && <div className="text-slate-500 text-xs mt-1">{hint}</div>}
      </div>
    </div>
  );
}

function Main() {
  const [stats, setStats] = useState(null);
  const [recentOrgs, setRecentOrgs] = useState([]);
  const [expiring, setExpiring] = useState([]);
  const [audit, setAudit] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const in14 = new Date(Date.now() + 14 * 86400000).toISOString();
      const [statsRes, orgsRes, expRes, auditRes] = await Promise.all([
        supabase.rpc("get_platform_stats"),
        supabase
          .from("organizations")
          .select("id, name, slug, status, city, created_at")
          .order("created_at", { ascending: false })
          .limit(5),
        supabase
          .from("organization_subscriptions")
          .select("id, status, expires_at, organizations(name), saas_plans(name)")
          .in("status", ["active", "trial"])
          .not("expires_at", "is", null)
          .lte("expires_at", in14)
          .order("expires_at")
          .limit(8),
        supabase
          .from("audit_logs")
          .select("id, action, table_name, record_id, actor_id, organization_id, created_at")
          .order("created_at", { ascending: false })
          .limit(8),
      ]);
      for (const r of [statsRes, orgsRes, expRes, auditRes]) if (r.error) throw r.error;

      setStats(statsRes.data);
      setRecentOrgs(orgsRes.data || []);
      setExpiring(expRes.data || []);

      // resolve actor / organisation names for the audit feed
      const rows = auditRes.data || [];
      const actorIds = [...new Set(rows.map((r) => r.actor_id).filter(Boolean))];
      const orgIds = [...new Set(rows.map((r) => r.organization_id).filter(Boolean))];
      const [actors, orgs] = await Promise.all([
        actorIds.length
          ? supabase.from("profiles").select("id, full_name, email").in("id", actorIds)
          : { data: [] },
        orgIds.length
          ? supabase.from("organizations").select("id, name").in("id", orgIds)
          : { data: [] },
      ]);
      const actorMap = Object.fromEntries((actors.data || []).map((a) => [a.id, a.full_name || a.email]));
      const orgMap = Object.fromEntries((orgs.data || []).map((o) => [o.id, o.name]));
      setAudit(
        rows.map((r) => ({
          ...r,
          actor: r.actor_id ? actorMap[r.actor_id] || "Unknown user" : "System",
          org: r.organization_id ? orgMap[r.organization_id] || "-" : "Platform",
        }))
      );
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const orgs = stats?.organizations || {};
  const subs = stats?.subscriptions || {};
  const byPlan = stats?.by_plan || [];

  return (
    <div className="p-5">
      <div className="intro-y flex items-center h-10 mb-5">
        <h2 className="text-lg font-medium truncate mr-auto">Platform Owner Dashboard</h2>
        <button className="btn btn-outline-secondary" onClick={load} disabled={loading}>
          {loading ? "Loading..." : "Refresh"}
        </button>
      </div>

      <ErrorBanner message={error} onClose={() => setError("")} />

      <div className="grid grid-cols-12 gap-6">
        <StatCard
          label="Total ISPs"
          value={orgs.total ?? 0}
          loading={loading}
          hint={`${orgs.new_this_month ?? 0} new this month`}
        />
        <StatCard
          label="Active ISPs"
          value={orgs.active ?? 0}
          loading={loading}
          hint={`${orgs.inactive ?? 0} inactive · ${orgs.suspended ?? 0} suspended`}
        />
        <StatCard
          label="Active / trial subscriptions"
          value={`${subs.active ?? 0} / ${subs.trial ?? 0}`}
          loading={loading}
          hint={`${subs.expired ?? 0} expired · ${subs.expiring_in_7_days ?? 0} expiring in 7 days`}
        />
        <StatCard
          label="MRR (calculated)"
          value={money(stats?.mrr)}
          loading={loading}
          hint="Active subscriptions x plan price"
        />

        <div className="intro-y col-span-12 lg:col-span-6">
          <div className="box p-5">
            <h3 className="text-base font-medium mb-1">Monthly recurring revenue by plan</h3>
            <div className="text-slate-500 text-xs mb-4">Plan price x ISPs on the plan</div>
            <BarList
              items={byPlan.map((p) => ({
                label: p.name,
                value: Number(p.price) * Number(p.organizations),
                hint: `${p.organizations} ISP${p.organizations === 1 ? "" : "s"}`,
              }))}
              format={(v) => money(v)}
              empty="No active subscriptions yet."
            />
          </div>
        </div>

        <div className="intro-y col-span-12 lg:col-span-6">
          <div className="box p-5">
            <h3 className="text-base font-medium mb-1">Plan distribution</h3>
            <div className="text-slate-500 text-xs mb-4">Number of ISPs per plan</div>
            <BarList
              items={byPlan.map((p) => ({ label: p.name, value: Number(p.organizations) }))}
              empty="No active subscriptions yet."
            />
          </div>
        </div>

        <div className="intro-y col-span-12 lg:col-span-6">
          <div className="box p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-medium">Recent ISPs</h3>
              <Link to="/platform-owner/organizations" className="text-primary text-sm">
                View all
              </Link>
            </div>
            <div className="overflow-x-auto">
              <table className="table table-report">
                <thead>
                  <tr>
                    <th>ISP</th>
                    <th>CITY</th>
                    <th>STATUS</th>
                    <th>JOINED</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr><td colSpan="4" className="text-center">Loading...</td></tr>
                  ) : recentOrgs.length === 0 ? (
                    <tr><td colSpan="4" className="text-center">No ISPs yet.</td></tr>
                  ) : (
                    recentOrgs.map((o) => (
                      <tr key={o.id}>
                        <td>
                          <div className="font-medium">{o.name}</div>
                          <div className="text-slate-500 text-xs">{o.slug}</div>
                        </td>
                        <td>{o.city || "-"}</td>
                        <td><StatusBadge status={o.status} /></td>
                        <td>{formatDate(o.created_at)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <div className="intro-y col-span-12 lg:col-span-6">
          <div className="box p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-medium">Expiring or overdue subscriptions</h3>
              <Link to="/platform-owner/subscriptions" className="text-primary text-sm">
                Manage
              </Link>
            </div>
            <div className="overflow-x-auto">
              <table className="table table-report">
                <thead>
                  <tr>
                    <th>ISP</th>
                    <th>PLAN</th>
                    <th>STATUS</th>
                    <th>EXPIRES</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr><td colSpan="4" className="text-center">Loading...</td></tr>
                  ) : expiring.length === 0 ? (
                    <tr><td colSpan="4" className="text-center">Nothing expires in the next 14 days.</td></tr>
                  ) : (
                    expiring.map((s) => (
                      <tr key={s.id}>
                        <td className="font-medium">{s.organizations?.name || "-"}</td>
                        <td>{s.saas_plans?.name || "-"}</td>
                        <td><StatusBadge status={s.status} /></td>
                        <td className={new Date(s.expires_at) < new Date() ? "text-danger" : ""}>
                          {formatDate(s.expires_at)}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <div className="intro-y col-span-12">
          <div className="box p-5">
            <h3 className="text-base font-medium mb-4">Recent activity (audit log)</h3>
            <div className="overflow-x-auto">
              <table className="table table-report">
                <thead>
                  <tr>
                    <th>WHEN</th>
                    <th>WHO</th>
                    <th>ISP</th>
                    <th>EVENT</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr><td colSpan="4" className="text-center">Loading...</td></tr>
                  ) : audit.length === 0 ? (
                    <tr><td colSpan="4" className="text-center">No audit events yet.</td></tr>
                  ) : (
                    audit.map((a) => (
                      <tr key={a.id}>
                        <td>{formatDateTime(a.created_at)}</td>
                        <td>{a.actor}</td>
                        <td>{a.org}</td>
                        <td>
                          {titleCase(a.action.toLowerCase())} on {titleCase(a.table_name)}
                        </td>
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
