import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { friendlyError } from "@/lib/errors";
import { money, formatDate, titleCase } from "@/lib/format";
import {
  StatusBadge,
  ErrorBanner,
  InfoBanner,
  Modal,
  Pagination,
  edgeError,
  ORG_STATUSES,
} from "../shared";

const PAGE_SIZE = 10;

const emptyEdit = { name: "", owner_name: "", email: "", phone: "", city: "", status: "active" };
const emptyAdd = { name: "", slug: "", owner_name: "", owner_email: "", plan_id: "", trial_days: 14 };

function Main() {
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [plans, setPlans] = useState([]);
  const [defaultTrial, setDefaultTrial] = useState(14);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [modalError, setModalError] = useState("");

  const [mode, setMode] = useState(null); // "add" | "edit" | "delete"
  const [target, setTarget] = useState(null);
  const [form, setForm] = useState(emptyEdit);
  const [addForm, setAddForm] = useState(emptyAdd);
  const [confirmText, setConfirmText] = useState("");

  // debounce search
  useEffect(() => {
    const t = setTimeout(() => {
      setQuery(search.trim());
      setPage(0);
    }, 300);
    return () => clearTimeout(t);
  }, [search]);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      let q = supabase
        .from("organizations")
        .select("id, name, slug, status, owner_name, email, phone, city, created_at", {
          count: "exact",
        })
        .order("created_at", { ascending: false })
        .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1);
      if (statusFilter !== "all") q = q.eq("status", statusFilter);
      if (query) {
        const s = query.replace(/[,()%*]/g, " ");
        q = q.or(
          `name.ilike.%${s}%,slug.ilike.%${s}%,email.ilike.%${s}%,owner_name.ilike.%${s}%,city.ilike.%${s}%`
        );
      }
      const { data, error: err, count } = await q;
      if (err) throw err;
      const orgs = data || [];

      const ids = orgs.map((o) => o.id);
      let subs = [];
      let admins = [];
      let bills = [];
      if (ids.length) {
        const [subRes, adminRes, billRes] = await Promise.all([
          supabase
            .from("organization_subscriptions")
            .select("id, organization_id, status, started_at, expires_at, created_at, saas_plans(name, price, billing_cycle)")
            .in("organization_id", ids)
            .order("created_at", { ascending: false }),
          supabase
            .from("profiles")
            .select("organization_id, full_name, email, status, created_at")
            .eq("role", "isp_admin")
            .in("organization_id", ids)
            .order("created_at"),
          supabase
            .from("saas_invoices")
            .select("organization_id, amount, amount_paid")
            .in("status", ["unpaid", "partial", "overdue"])
            .in("organization_id", ids),
        ]);
        if (billRes.error) throw billRes.error;
        bills = billRes.data || [];
        if (subRes.error) throw subRes.error;
        if (adminRes.error) throw adminRes.error;
        subs = subRes.data || [];
        admins = adminRes.data || [];
      }

      setRows(
        orgs.map((o) => {
          const own = subs.filter((s) => s.organization_id === o.id);
          const live = own.find((s) => ["active", "trial"].includes(s.status)) || own[0] || null;
          const admin = admins.find((a) => a.organization_id === o.id) || null;
          const own_bills = bills.filter((b) => b.organization_id === o.id);
          const unpaid = {
            count: own_bills.length,
            amount: own_bills.reduce((t, b) => t + Number(b.amount) - Number(b.amount_paid), 0),
          };
          return { ...o, subscription: live, admin, unpaid };
        })
      );
      setTotal(count || 0);
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setLoading(false);
    }
  }, [page, query, statusFilter]);

  useEffect(() => {
    load();
  }, [load]);

  // plans + default trial length (for the Add ISP form)
  useEffect(() => {
    (async () => {
      const [p, s] = await Promise.all([
        supabase.from("saas_plans").select("id, name, price, billing_cycle").eq("is_active", true).order("price"),
        supabase.from("platform_settings").select("trial_days").limit(1).maybeSingle(),
      ]);
      setPlans(p.data || []);
      if (s.data?.trial_days !== undefined && s.data?.trial_days !== null) setDefaultTrial(s.data.trial_days);
    })();
  }, []);

  const close = () => {
    setMode(null);
    setTarget(null);
    setModalError("");
    setConfirmText("");
  };

  const openAdd = () => {
    setAddForm({ ...emptyAdd, plan_id: plans[0]?.id || "", trial_days: defaultTrial });
    setModalError("");
    setMode("add");
  };

  const openEdit = (o) => {
    setTarget(o);
    setForm({
      name: o.name || "",
      owner_name: o.owner_name || "",
      email: o.email || "",
      phone: o.phone || "",
      city: o.city || "",
      status: o.status || "active",
    });
    setModalError("");
    setMode("edit");
  };

  const openDelete = (o) => {
    setTarget(o);
    setConfirmText("");
    setModalError("");
    setMode("delete");
  };

  const submitAdd = async (e) => {
    e.preventDefault();
    if (!addForm.name.trim()) return setModalError("ISP name is required.");
    if (!addForm.owner_email.trim()) return setModalError("Owner e-mail is required (an invitation is sent to it).");
    if (!addForm.owner_name.trim()) return setModalError("Owner name is required.");
    if (!addForm.plan_id) return setModalError("Please choose a plan.");
    setSaving(true);
    setModalError("");
    try {
      const body = {
        name: addForm.name.trim(),
        owner_email: addForm.owner_email.trim(),
        owner_name: addForm.owner_name.trim(),
        plan_id: addForm.plan_id,
        trial_days: Number(addForm.trial_days) || 0,
      };
      if (addForm.slug.trim()) body.slug = addForm.slug.trim().toLowerCase();
      const { data, error: err } = await supabase.functions.invoke("create-organization", { body });
      if (err) {
        setModalError(await edgeError(err, friendlyError));
        return;
      }
      if (data?.error) {
        setModalError(data.error);
        return;
      }
      close();
      setNotice(`ISP "${body.name}" created. An invitation was sent to ${body.owner_email}.`);
      await load();
    } catch (err) {
      setModalError(friendlyError(err));
    } finally {
      setSaving(false);
    }
  };

  const submitEdit = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) return setModalError("ISP name is required.");
    setSaving(true);
    setModalError("");
    try {
      const { error: err } = await supabase
        .from("organizations")
        .update({
          name: form.name.trim(),
          owner_name: form.owner_name.trim() || null,
          email: form.email.trim() || null,
          phone: form.phone.trim() || null,
          city: form.city.trim() || null,
          status: form.status,
        })
        .eq("id", target.id);
      if (err) throw err;
      close();
      setNotice("ISP updated.");
      await load();
    } catch (err) {
      setModalError(friendlyError(err));
    } finally {
      setSaving(false);
    }
  };

  const setStatus = async (o, status) => {
    setError("");
    setNotice("");
    try {
      const { error: err } = await supabase.from("organizations").update({ status }).eq("id", o.id);
      if (err) throw err;
      setNotice(`${o.name} is now ${status}.`);
      await load();
    } catch (err) {
      setError(friendlyError(err));
    }
  };

  const submitDelete = async () => {
    if (confirmText !== target.slug) return;
    setSaving(true);
    setModalError("");
    try {
      const { error: err } = await supabase.from("organizations").delete().eq("id", target.id);
      if (err) throw err;
      close();
      setNotice("ISP and all its data were deleted.");
      await load();
    } catch (err) {
      setModalError(friendlyError(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="p-5">
      <div className="intro-y flex items-center h-10 mb-5">
        <h2 className="text-lg font-medium truncate">ISPs / Organizations</h2>
      </div>

      <ErrorBanner message={error} onClose={() => setError("")} />
      <InfoBanner message={notice} onClose={() => setNotice("")} />

      <div className="intro-y box p-5">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-5">
          <div>
            <h3 className="text-base font-medium">ISP Organizations</h3>
            <div className="text-slate-500 text-sm mt-1">Manage all ISPs using your SaaS platform.</div>
          </div>
          <button className="btn btn-primary" onClick={openAdd}>
            + Add ISP
          </button>
        </div>

        <div className="flex flex-col sm:flex-row gap-3 mb-5">
          <input
            type="text"
            className="form-control"
            placeholder="Search by name, slug, e-mail, owner or city..."
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
            {ORG_STATUSES.map((s) => (
              <option key={s} value={s}>
                {titleCase(s)}
              </option>
            ))}
          </select>
        </div>

        <div className="overflow-x-auto">
          <table className="table table-report">
            <thead>
              <tr>
                <th>ISP</th>
                <th>OWNER / ADMIN</th>
                <th>PLAN</th>
                <th>SUBSCRIPTION</th>
                <th>STATUS / BILLS</th>
                <th>JOINED</th>
                <th>ACTION</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan="7" className="text-center">Loading organizations...</td></tr>
              ) : rows.length === 0 ? (
                <tr><td colSpan="7" className="text-center">No organizations found.</td></tr>
              ) : (
                rows.map((o) => (
                  <tr key={o.id}>
                    <td>
                      <div className="font-medium">{o.name}</div>
                      <div className="text-slate-500 text-xs">
                        {o.slug}
                        {o.city ? ` · ${o.city}` : ""}
                      </div>
                    </td>
                    <td>
                      <div>{o.admin?.full_name || o.owner_name || "-"}</div>
                      <div className="text-slate-500 text-xs">{o.admin?.email || o.email || "-"}</div>
                    </td>
                    <td>
                      {o.subscription ? (
                        <>
                          <div>{o.subscription.saas_plans?.name || "-"}</div>
                          <div className="text-slate-500 text-xs">
                            {money(o.subscription.saas_plans?.price)} / {o.subscription.saas_plans?.billing_cycle}
                          </div>
                        </>
                      ) : (
                        <span className="text-slate-500">No plan</span>
                      )}
                    </td>
                    <td>
                      {o.subscription ? (
                        <>
                          <StatusBadge status={o.subscription.status} />
                          <div className="text-slate-500 text-xs mt-1">
                            Expires {formatDate(o.subscription.expires_at)}
                          </div>
                          {!["active", "trial"].includes(o.subscription.status) && (
                            <div className="text-danger text-xs">Not live - read-only</div>
                          )}
                        </>
                      ) : (
                        "-"
                      )}
                    </td>
                    <td>
                      <StatusBadge status={o.status} />
                      {o.status !== "active" && (
                        <div className="text-danger text-xs mt-1">Locked out completely</div>
                      )}
                      <div className={`text-xs mt-1 ${o.unpaid?.count ? "text-danger" : "text-slate-500"}`}>
                        {o.unpaid?.count
                          ? `${o.unpaid.count} unpaid bill${o.unpaid.count === 1 ? "" : "s"} (${money(o.unpaid.amount)})`
                          : "No unpaid bills"}
                      </div>
                    </td>
                    <td>{formatDate(o.created_at)}</td>
                    <td>
                      <div className="flex flex-wrap gap-2">
                        <button className="btn btn-sm btn-outline-secondary" onClick={() => openEdit(o)}>
                          Edit
                        </button>
                        {o.status === "active" ? (
                          <button className="btn btn-sm btn-outline-danger" onClick={() => setStatus(o, "suspended")}>
                            Suspend
                          </button>
                        ) : (
                          <button className="btn btn-sm btn-outline-success" onClick={() => setStatus(o, "active")}>
                            Activate
                          </button>
                        )}
                        <button className="btn btn-sm btn-outline-danger" onClick={() => openDelete(o)}>
                          Delete
                        </button>
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

      {mode === "add" && (
        <Modal title="Add ISP" onClose={close}>
          <form onSubmit={submitAdd}>
            <ErrorBanner message={modalError} />
            <div className="text-slate-500 text-xs mb-4">
              This creates the ISP, its first subscription and sends an invitation e-mail to the owner so they can set
              a password and log in.
            </div>
            <div className="mb-4">
              <label className="form-label">ISP name</label>
              <input
                className="form-control"
                placeholder="ABC Internet Services"
                value={addForm.name}
                onChange={(e) => setAddForm({ ...addForm, name: e.target.value })}
              />
            </div>
            <div className="mb-4">
              <label className="form-label">Slug (optional)</label>
              <input
                className="form-control"
                placeholder="abc-internet"
                value={addForm.slug}
                onChange={(e) => setAddForm({ ...addForm, slug: e.target.value })}
              />
              <div className="text-slate-500 text-xs mt-1">
                Lowercase letters, numbers and hyphens. Generated from the name when empty.
              </div>
            </div>
            <div className="mb-4">
              <label className="form-label">Owner name</label>
              <input
                className="form-control"
                value={addForm.owner_name}
                onChange={(e) => setAddForm({ ...addForm, owner_name: e.target.value })}
              />
            </div>
            <div className="mb-4">
              <label className="form-label">Owner e-mail (login)</label>
              <input
                type="email"
                className="form-control"
                value={addForm.owner_email}
                onChange={(e) => setAddForm({ ...addForm, owner_email: e.target.value })}
              />
            </div>
            <div className="mb-4">
              <label className="form-label">Plan</label>
              <select
                className="form-select"
                value={addForm.plan_id}
                onChange={(e) => setAddForm({ ...addForm, plan_id: e.target.value })}
              >
                <option value="">Select a plan</option>
                {plans.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} - {money(p.price)} / {p.billing_cycle}
                  </option>
                ))}
              </select>
            </div>
            <div className="mb-5">
              <label className="form-label">Trial days</label>
              <input
                type="number"
                min="0"
                className="form-control"
                value={addForm.trial_days}
                onChange={(e) => setAddForm({ ...addForm, trial_days: e.target.value })}
              />
              <div className="text-slate-500 text-xs mt-1">0 = start as an active (paid) subscription.</div>
            </div>
            <div className="flex justify-end gap-2">
              <button type="button" className="btn btn-outline-secondary" onClick={close}>
                Cancel
              </button>
              <button type="submit" className="btn btn-primary" disabled={saving}>
                {saving ? "Creating..." : "Create ISP"}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {mode === "edit" && target && (
        <Modal title={`Edit ${target.name}`} onClose={close}>
          <form onSubmit={submitEdit}>
            <ErrorBanner message={modalError} />
            <div className="mb-4">
              <label className="form-label">ISP name</label>
              <input className="form-control" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div className="mb-4">
              <label className="form-label">Slug</label>
              <input className="form-control" value={target.slug} disabled />
            </div>
            <div className="mb-4">
              <label className="form-label">Owner name</label>
              <input className="form-control" value={form.owner_name} onChange={(e) => setForm({ ...form, owner_name: e.target.value })} />
            </div>
            <div className="mb-4">
              <label className="form-label">E-mail</label>
              <input type="email" className="form-control" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            </div>
            <div className="mb-4">
              <label className="form-label">Phone</label>
              <input className="form-control" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            </div>
            <div className="mb-4">
              <label className="form-label">City</label>
              <input className="form-control" value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} />
            </div>
            <div className="mb-5">
              <label className="form-label">Status</label>
              <select className="form-select" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
                {ORG_STATUSES.map((s) => (
                  <option key={s} value={s}>{titleCase(s)}</option>
                ))}
              </select>
              <div className="text-slate-500 text-xs mt-1">
                Inactive or suspended ISPs keep their data but should not be used.
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <button type="button" className="btn btn-outline-secondary" onClick={close}>
                Cancel
              </button>
              <button type="submit" className="btn btn-primary" disabled={saving}>
                {saving ? "Saving..." : "Update ISP"}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {mode === "delete" && target && (
        <Modal title="Delete ISP permanently" onClose={close}>
          <ErrorBanner message={modalError} />
          <div className="alert alert-danger show mb-4">
            Deleting <b>{target.name}</b> permanently removes the ISP and ALL of its data: subscribers, invoices,
            payments, tickets, inventory, staff profiles and its subscription history. This cannot be undone.
          </div>
          <div className="text-sm mb-4">
            If you only want to stop the ISP from using the platform, use <b>Suspend</b> instead - the data is kept and
            the ISP can be re-activated at any time.
          </div>
          <label className="form-label">
            Type <b>{target.slug}</b> to confirm
          </label>
          <input className="form-control mb-5" value={confirmText} onChange={(e) => setConfirmText(e.target.value)} />
          <div className="flex justify-end gap-2">
            <button type="button" className="btn btn-outline-secondary" onClick={close}>
              Cancel
            </button>
            <button
              type="button"
              className="btn btn-danger"
              disabled={saving || confirmText !== target.slug}
              onClick={submitDelete}
            >
              {saving ? "Deleting..." : "Delete everything"}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}

export default Main;
