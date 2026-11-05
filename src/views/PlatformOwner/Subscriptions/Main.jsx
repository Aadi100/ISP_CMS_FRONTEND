import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { friendlyError } from "@/lib/errors";
import { money, formatDate, titleCase, toDateInput } from "@/lib/format";
import {
  StatusBadge,
  ErrorBanner,
  InfoBanner,
  Modal,
  Pagination,
  SUB_STATUSES,
  isOverdue,
} from "../shared";

const PAGE_SIZE = 10;
const CYCLES = ["monthly", "quarterly", "yearly"];

const emptySub = { organization_id: "", plan_id: "", status: "active", started_at: "", expires_at: "" };
const emptyPlan = {
  name: "",
  description: "",
  price: "0",
  billing_cycle: "monthly",
  max_subscribers: "",
  max_staff: "",
  features: "",
  is_active: true,
};

function addDays(dateStr, days) {
  const d = dateStr ? new Date(dateStr) : new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function Main() {
  const [tab, setTab] = useState("subscriptions");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [saving, setSaving] = useState(false);
  const [modalError, setModalError] = useState("");

  // lookups
  const [orgs, setOrgs] = useState([]);
  const [plans, setPlans] = useState([]);
  const [plansLoading, setPlansLoading] = useState(true);

  // subscriptions list
  const [subs, setSubs] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [loading, setLoading] = useState(true);

  // modals
  const [subModal, setSubModal] = useState(null); // { editing: row|null }
  const [subForm, setSubForm] = useState(emptySub);
  const [planModal, setPlanModal] = useState(null); // { editing: row|null }
  const [planForm, setPlanForm] = useState(emptyPlan);

  useEffect(() => {
    const t = setTimeout(() => {
      setQuery(search.trim());
      setPage(0);
    }, 300);
    return () => clearTimeout(t);
  }, [search]);

  const loadLookups = useCallback(async () => {
    setPlansLoading(true);
    try {
      const [o, p] = await Promise.all([
        supabase.from("organizations").select("id, name, slug").order("name"),
        supabase.from("saas_plans").select("*").order("price"),
      ]);
      if (o.error) throw o.error;
      if (p.error) throw p.error;
      setOrgs(o.data || []);
      setPlans(p.data || []);
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setPlansLoading(false);
    }
  }, []);

  const loadSubs = useCallback(async () => {
    setLoading(true);
    try {
      let q = supabase
        .from("organization_subscriptions")
        .select(
          "id, organization_id, plan_id, status, started_at, expires_at, created_at, organizations!inner(name, slug), saas_plans(name, price, billing_cycle)",
          { count: "exact" }
        )
        .order("created_at", { ascending: false })
        .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1);
      if (statusFilter !== "all") q = q.eq("status", statusFilter);
      if (query) q = q.ilike("organizations.name", `%${query.replace(/[%*]/g, " ")}%`);
      const { data, error: err, count } = await q;
      if (err) throw err;
      setSubs(data || []);
      setTotal(count || 0);
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setLoading(false);
    }
  }, [page, query, statusFilter]);

  useEffect(() => {
    loadLookups();
  }, [loadLookups]);
  useEffect(() => {
    loadSubs();
  }, [loadSubs]);

  // ---------------- subscriptions ----------------
  const openSub = (row) => {
    setModalError("");
    if (row) {
      setSubForm({
        organization_id: row.organization_id,
        plan_id: row.plan_id,
        status: row.status,
        started_at: toDateInput(row.started_at),
        expires_at: toDateInput(row.expires_at),
      });
    } else {
      setSubForm({ ...emptySub, started_at: toDateInput(new Date()) });
    }
    setSubModal({ editing: row });
  };

  const saveSub = async (e) => {
    e.preventDefault();
    if (!subForm.organization_id) return setModalError("Please select an ISP.");
    if (!subForm.plan_id) return setModalError("Please select a plan.");
    if (!subForm.started_at) return setModalError("Start date is required.");
    if (subForm.expires_at && subForm.expires_at < subForm.started_at)
      return setModalError("The expiry date cannot be before the start date.");
    setSaving(true);
    setModalError("");
    try {
      const payload = {
        organization_id: subForm.organization_id,
        plan_id: subForm.plan_id,
        status: subForm.status,
        started_at: subForm.started_at,
        expires_at: subForm.expires_at || null,
      };
      const editing = subModal.editing;
      const { error: err } = editing
        ? await supabase.from("organization_subscriptions").update(payload).eq("id", editing.id)
        : await supabase.from("organization_subscriptions").insert([payload]);
      if (err) throw err;
      setSubModal(null);
      setNotice(
        editing
          ? "Subscription updated."
          : "Subscription created. Any previous active/trial subscription of this ISP was deactivated automatically."
      );
      await loadSubs();
    } catch (err) {
      setModalError(friendlyError(err));
    } finally {
      setSaving(false);
    }
  };

  const extend = async (row, days) => {
    setError("");
    setNotice("");
    try {
      const base = row.expires_at && new Date(row.expires_at) > new Date() ? row.expires_at : new Date().toISOString();
      const next = addDays(base, days);
      const patch = { expires_at: next };
      if (row.status === "expired") patch.status = "active";
      const { error: err } = await supabase.from("organization_subscriptions").update(patch).eq("id", row.id);
      if (err) throw err;
      setNotice(`Extended to ${formatDate(next)}.`);
      await loadSubs();
    } catch (err) {
      setError(friendlyError(err));
    }
  };

  const deleteSub = async (row) => {
    if (!window.confirm(`Delete the ${row.saas_plans?.name} subscription of ${row.organizations?.name}?`)) return;
    setError("");
    try {
      const { error: err } = await supabase.from("organization_subscriptions").delete().eq("id", row.id);
      if (err) throw err;
      setNotice("Subscription deleted.");
      await loadSubs();
    } catch (err) {
      setError(friendlyError(err));
    }
  };

  // ---------------- plans ----------------
  const openPlan = (row) => {
    setModalError("");
    if (row) {
      setPlanForm({
        name: row.name,
        description: row.description || "",
        price: String(row.price ?? 0),
        billing_cycle: row.billing_cycle,
        max_subscribers: row.max_subscribers ?? "",
        max_staff: row.max_staff ?? "",
        features: Array.isArray(row.features) ? row.features.join("\n") : "",
        is_active: row.is_active,
      });
    } else {
      setPlanForm(emptyPlan);
    }
    setPlanModal({ editing: row });
  };

  const savePlan = async (e) => {
    e.preventDefault();
    if (!planForm.name.trim()) return setModalError("Plan name is required.");
    if (Number(planForm.price) < 0 || planForm.price === "") return setModalError("Price must be 0 or more.");
    setSaving(true);
    setModalError("");
    try {
      const payload = {
        name: planForm.name.trim(),
        description: planForm.description.trim() || null,
        price: Number(planForm.price),
        billing_cycle: planForm.billing_cycle,
        max_subscribers: planForm.max_subscribers === "" ? null : Number(planForm.max_subscribers),
        max_staff: planForm.max_staff === "" ? null : Number(planForm.max_staff),
        features: planForm.features
          .split("\n")
          .map((f) => f.trim())
          .filter(Boolean),
        is_active: planForm.is_active,
      };
      const editing = planModal.editing;
      const { error: err } = editing
        ? await supabase.from("saas_plans").update(payload).eq("id", editing.id)
        : await supabase.from("saas_plans").insert([payload]);
      if (err) throw err;
      setPlanModal(null);
      setNotice(editing ? "Plan updated." : "Plan created.");
      await loadLookups();
      await loadSubs();
    } catch (err) {
      setModalError(err.code === "23505" ? "A plan with this name already exists." : friendlyError(err));
    } finally {
      setSaving(false);
    }
  };

  const togglePlan = async (row) => {
    setError("");
    try {
      const { error: err } = await supabase.from("saas_plans").update({ is_active: !row.is_active }).eq("id", row.id);
      if (err) throw err;
      await loadLookups();
    } catch (err) {
      setError(friendlyError(err));
    }
  };

  const deletePlan = async (row) => {
    if (!window.confirm(`Delete the plan "${row.name}"?`)) return;
    setError("");
    try {
      const { error: err } = await supabase.from("saas_plans").delete().eq("id", row.id);
      if (err) {
        if (err.code === "23503")
          throw new Error("This plan is used by ISP subscriptions and cannot be deleted. Deactivate it instead.");
        throw err;
      }
      setNotice("Plan deleted.");
      await loadLookups();
    } catch (err) {
      setError(friendlyError(err));
    }
  };

  const liveSelectedOrg =
    subModal && !subModal.editing && ["active", "trial"].includes(subForm.status) && subForm.organization_id
      ? subs.find((s) => s.organization_id === subForm.organization_id && ["active", "trial"].includes(s.status))
      : null;

  return (
    <div className="p-5">
      <div className="intro-y flex items-center h-10 mb-5">
        <h2 className="text-lg font-medium truncate">ISP Subscriptions &amp; Plans</h2>
      </div>

      <ErrorBanner message={error} onClose={() => setError("")} />
      <InfoBanner message={notice} onClose={() => setNotice("")} />

      <div className="intro-y alert alert-primary show mb-5 text-sm">
        <b>Plan limits are enforced by the database.</b> <code>max_subscribers</code> and <code>max_staff</code> of an
        ISP's plan block new customers or staff beyond the limit. An ISP whose subscription is not live (expired or none)
        is read-only: no new customers or invoices. A suspended or inactive ISP is locked out completely and sees nothing.
      </div>

      <div className="flex gap-2 mb-5">
        <button
          className={`btn ${tab === "subscriptions" ? "btn-primary" : "btn-outline-secondary"}`}
          onClick={() => setTab("subscriptions")}
        >
          Subscriptions
        </button>
        <button
          className={`btn ${tab === "plans" ? "btn-primary" : "btn-outline-secondary"}`}
          onClick={() => setTab("plans")}
        >
          Plans
        </button>
      </div>

      {tab === "subscriptions" && (
        <div className="intro-y box p-5">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-5">
            <div>
              <h3 className="text-base font-medium">ISP Subscriptions</h3>
              <div className="text-slate-500 text-sm mt-1">
                Assign or change the plan of an ISP. Only one active/trial subscription per ISP is allowed - creating a
                new one deactivates the previous.
              </div>
            </div>
            <button className="btn btn-primary" onClick={() => openSub(null)}>
              + Add subscription
            </button>
          </div>

          <div className="flex flex-col sm:flex-row gap-3 mb-5">
            <input
              className="form-control"
              placeholder="Search by ISP name..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <select
              className="form-select sm:w-48"
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value);
                setPage(0);
              }}
            >
              <option value="all">All statuses</option>
              {SUB_STATUSES.map((s) => (
                <option key={s} value={s}>{titleCase(s)}</option>
              ))}
            </select>
          </div>

          <div className="overflow-x-auto">
            <table className="table table-report">
              <thead>
                <tr>
                  <th>ISP</th>
                  <th>PLAN</th>
                  <th>STATUS</th>
                  <th>STARTED</th>
                  <th>EXPIRES</th>
                  <th>ACTION</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan="6" className="text-center">Loading subscriptions...</td></tr>
                ) : subs.length === 0 ? (
                  <tr><td colSpan="6" className="text-center">No subscriptions found.</td></tr>
                ) : (
                  subs.map((s) => (
                    <tr key={s.id}>
                      <td>
                        <div className="font-medium">{s.organizations?.name}</div>
                        <div className="text-slate-500 text-xs">{s.organizations?.slug}</div>
                      </td>
                      <td>
                        <div>{s.saas_plans?.name}</div>
                        <div className="text-slate-500 text-xs">
                          {money(s.saas_plans?.price)} / {s.saas_plans?.billing_cycle}
                        </div>
                      </td>
                      <td>
                        <StatusBadge status={s.status} />
                        {isOverdue(s) && <div className="text-danger text-xs mt-1">Past expiry date</div>}
                      </td>
                      <td>{formatDate(s.started_at)}</td>
                      <td>{formatDate(s.expires_at)}</td>
                      <td>
                        <div className="flex flex-wrap gap-2">
                          <button className="btn btn-sm btn-outline-secondary" onClick={() => openSub(s)}>Edit</button>
                          <button className="btn btn-sm btn-outline-primary" onClick={() => extend(s, 30)}>+30 days</button>
                          <button className="btn btn-sm btn-outline-danger" onClick={() => deleteSub(s)}>Delete</button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          <Pagination page={page} pageSize={PAGE_SIZE} total={total} onPage={setPage} />
        </div>
      )}

      {tab === "plans" && (
        <div className="intro-y box p-5">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-5">
            <div>
              <h3 className="text-base font-medium">SaaS Plans</h3>
              <div className="text-slate-500 text-sm mt-1">The plans your ISPs can subscribe to.</div>
            </div>
            <button className="btn btn-primary" onClick={() => openPlan(null)}>
              + Add plan
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="table table-report">
              <thead>
                <tr>
                  <th>PLAN</th>
                  <th>PRICE</th>
                  <th>LIMITS</th>
                  <th>FEATURES</th>
                  <th>STATUS</th>
                  <th>ACTION</th>
                </tr>
              </thead>
              <tbody>
                {plansLoading ? (
                  <tr><td colSpan="6" className="text-center">Loading plans...</td></tr>
                ) : plans.length === 0 ? (
                  <tr><td colSpan="6" className="text-center">No plans yet.</td></tr>
                ) : (
                  plans.map((p) => (
                    <tr key={p.id}>
                      <td>
                        <div className="font-medium">{p.name}</div>
                        <div className="text-slate-500 text-xs">{p.description}</div>
                      </td>
                      <td>
                        {money(p.price)}
                        <div className="text-slate-500 text-xs">{p.billing_cycle}</div>
                      </td>
                      <td className="text-xs">
                        {p.max_subscribers ?? "Unlimited"} subscribers
                        <br />
                        {p.max_staff ?? "Unlimited"} staff
                      </td>
                      <td className="text-xs">
                        {(Array.isArray(p.features) ? p.features : []).join(", ") || "-"}
                      </td>
                      <td>
                        <StatusBadge status={p.is_active ? "active" : "inactive"} />
                      </td>
                      <td>
                        <div className="flex flex-wrap gap-2">
                          <button className="btn btn-sm btn-outline-secondary" onClick={() => openPlan(p)}>Edit</button>
                          <button className="btn btn-sm btn-outline-secondary" onClick={() => togglePlan(p)}>
                            {p.is_active ? "Deactivate" : "Activate"}
                          </button>
                          <button className="btn btn-sm btn-outline-danger" onClick={() => deletePlan(p)}>Delete</button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {subModal && (
        <Modal title={subModal.editing ? "Edit subscription" : "Add subscription"} onClose={() => setSubModal(null)}>
          <form onSubmit={saveSub}>
            <ErrorBanner message={modalError} />
            <div className="mb-4">
              <label className="form-label">ISP</label>
              <select
                className="form-select"
                value={subForm.organization_id}
                disabled={Boolean(subModal.editing)}
                onChange={(e) => setSubForm({ ...subForm, organization_id: e.target.value })}
              >
                <option value="">Select an ISP</option>
                {orgs.map((o) => (
                  <option key={o.id} value={o.id}>{o.name}</option>
                ))}
              </select>
            </div>
            <div className="mb-4">
              <label className="form-label">Plan</label>
              <select
                className="form-select"
                value={subForm.plan_id}
                onChange={(e) => setSubForm({ ...subForm, plan_id: e.target.value })}
              >
                <option value="">Select a plan</option>
                {plans.map((p) => (
                  <option key={p.id} value={p.id} disabled={!p.is_active && p.id !== subForm.plan_id}>
                    {p.name} - {money(p.price)} / {p.billing_cycle}
                    {p.is_active ? "" : " (inactive)"}
                  </option>
                ))}
              </select>
            </div>
            <div className="mb-4">
              <label className="form-label">Status</label>
              <select
                className="form-select"
                value={subForm.status}
                onChange={(e) => setSubForm({ ...subForm, status: e.target.value })}
              >
                {SUB_STATUSES.map((s) => (
                  <option key={s} value={s}>{titleCase(s)}</option>
                ))}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3 mb-4">
              <div>
                <label className="form-label">Start date</label>
                <input
                  type="date"
                  className="form-control"
                  value={subForm.started_at}
                  onChange={(e) => setSubForm({ ...subForm, started_at: e.target.value })}
                />
              </div>
              <div>
                <label className="form-label">Expiry date</label>
                <input
                  type="date"
                  className="form-control"
                  value={subForm.expires_at}
                  onChange={(e) => setSubForm({ ...subForm, expires_at: e.target.value })}
                />
              </div>
            </div>
            {liveSelectedOrg && (
              <div className="text-warning text-xs mb-4">
                This ISP already has a live {liveSelectedOrg.saas_plans?.name} subscription; it will be deactivated
                automatically.
              </div>
            )}
            <div className="flex justify-end gap-2">
              <button type="button" className="btn btn-outline-secondary" onClick={() => setSubModal(null)}>
                Cancel
              </button>
              <button type="submit" className="btn btn-primary" disabled={saving}>
                {saving ? "Saving..." : "Save"}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {planModal && (
        <Modal title={planModal.editing ? "Edit plan" : "Add plan"} onClose={() => setPlanModal(null)}>
          <form onSubmit={savePlan}>
            <ErrorBanner message={modalError} />
            <div className="mb-4">
              <label className="form-label">Name</label>
              <input className="form-control" value={planForm.name} onChange={(e) => setPlanForm({ ...planForm, name: e.target.value })} />
            </div>
            <div className="mb-4">
              <label className="form-label">Description</label>
              <input className="form-control" value={planForm.description} onChange={(e) => setPlanForm({ ...planForm, description: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-3 mb-4">
              <div>
                <label className="form-label">Price (PKR)</label>
                <input type="number" min="0" step="0.01" className="form-control" value={planForm.price} onChange={(e) => setPlanForm({ ...planForm, price: e.target.value })} />
              </div>
              <div>
                <label className="form-label">Billing cycle</label>
                <select className="form-select" value={planForm.billing_cycle} onChange={(e) => setPlanForm({ ...planForm, billing_cycle: e.target.value })}>
                  {CYCLES.map((c) => (
                    <option key={c} value={c}>{titleCase(c)}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3 mb-4">
              <div>
                <label className="form-label">Max subscribers</label>
                <input type="number" min="1" className="form-control" placeholder="Unlimited" value={planForm.max_subscribers} onChange={(e) => setPlanForm({ ...planForm, max_subscribers: e.target.value })} />
              </div>
              <div>
                <label className="form-label">Max staff</label>
                <input type="number" min="1" className="form-control" placeholder="Unlimited" value={planForm.max_staff} onChange={(e) => setPlanForm({ ...planForm, max_staff: e.target.value })} />
              </div>
            </div>
            <div className="mb-4">
              <label className="form-label">Features (one per line)</label>
              <textarea rows="5" className="form-control" value={planForm.features} onChange={(e) => setPlanForm({ ...planForm, features: e.target.value })} />
            </div>
            <label className="flex items-center gap-2 mb-5">
              <input type="checkbox" className="form-check-input" checked={planForm.is_active} onChange={(e) => setPlanForm({ ...planForm, is_active: e.target.checked })} />
              <span>Active (available for new subscriptions)</span>
            </label>
            <div className="flex justify-end gap-2">
              <button type="button" className="btn btn-outline-secondary" onClick={() => setPlanModal(null)}>
                Cancel
              </button>
              <button type="submit" className="btn btn-primary" disabled={saving}>
                {saving ? "Saving..." : "Save plan"}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}

export default Main;
