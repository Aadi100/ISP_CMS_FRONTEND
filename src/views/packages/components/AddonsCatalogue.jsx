import { useCallback, useEffect, useState } from "react";
import { Lucide } from "@/base-components";
import classnames from "classnames";
import { supabase } from "@/lib/supabase";
import { can } from "@/lib/session";
import { friendlyError } from "@/lib/errors";
import { money, titleCase } from "@/lib/format";

const EMPTY = { name: "", kind: "recurring", price: "", description: "", is_active: true };

function AddonsCatalogue({ session }) {
  const [rows, setRows] = useState([]);
  const [usage, setUsage] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [form, setForm] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [saving, setSaving] = useState(false);

  const canCreate = can(session, "packages", "create");
  const canEdit = can(session, "packages", "edit");
  const canDelete = can(session, "packages", "delete");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [a, u] = await Promise.all([
        supabase.from("addons").select("*").order("name"),
        supabase.from("subscriber_addons").select("addon_id").eq("status", "active").limit(10000),
      ]);
      if (a.error) throw a.error;
      if (u.error) throw u.error;
      const counts = {};
      (u.data || []).forEach((r) => {
        counts[r.addon_id] = (counts[r.addon_id] || 0) + 1;
      });
      setRows(a.data || []);
      setUsage(counts);
      setError("");
    } catch (err) {
      setError(friendlyError(err, "Failed to load add-ons."));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const open = (a) => {
    setError("");
    if (a) {
      setEditingId(a.id);
      setForm({
        name: a.name,
        kind: a.kind,
        price: String(a.price),
        description: a.description || "",
        is_active: a.is_active,
      });
    } else {
      setEditingId(null);
      setForm({ ...EMPTY });
    }
  };

  const set = (k, v) => setForm((p) => ({ ...p, [k]: v }));

  const save = async () => {
    setError("");
    const price = Number(form.price);
    if (!form.name.trim()) return setError("Add-on name is required.");
    if (form.price === "" || !Number.isFinite(price) || price < 0)
      return setError("Price must be 0 or more.");
    const payload = {
      name: form.name.trim(),
      kind: form.kind,
      price,
      description: form.description.trim() || null,
      is_active: form.is_active,
    };
    setSaving(true);
    try {
      const q = editingId
        ? supabase.from("addons").update(payload).eq("id", editingId)
        : supabase.from("addons").insert(payload);
      const { error: err } = await q;
      if (err) throw err;
      setForm(null);
      await load();
    } catch (err) {
      setError(friendlyError(err, "Failed to save add-on."));
    } finally {
      setSaving(false);
    }
  };

  const toggle = async (a) => {
    setError("");
    const { error: err } = await supabase
      .from("addons")
      .update({ is_active: !a.is_active })
      .eq("id", a.id);
    if (err) setError(friendlyError(err));
    else load();
  };

  const remove = async (a) => {
    setError("");
    if (!window.confirm(`Delete add-on "${a.name}"?`)) return;
    const { error: err } = await supabase.from("addons").delete().eq("id", a.id);
    if (err) {
      setError(
        err.code === "23503"
          ? `"${a.name}" is attached to customers and cannot be deleted. Mark it Inactive instead.`
          : friendlyError(err)
      );
    } else load();
  };

  return (
    <div className="grid grid-cols-12 gap-6">
      <div className="col-span-12 intro-y flex flex-col sm:flex-row sm:items-center">
        <div>
          <h2 className="text-lg font-medium">Add-ons catalogue</h2>
          <div className="text-slate-500 mt-1">
            Extra services (static IP, router rental, ...) that can be attached to subscribers.
          </div>
        </div>
        {canCreate && (
          <button type="button" className="btn btn-primary shadow-md sm:ml-auto mt-4 sm:mt-0" onClick={() => open(null)}>
            <Lucide icon="Plus" className="w-4 h-4 mr-2" />
            Add Add-on
          </button>
        )}
      </div>

      {error && (
        <div className="col-span-12 intro-y">
          <div className="alert alert-danger show flex items-center">
            <Lucide icon="AlertCircle" className="w-5 h-5 mr-2" />
            <span>{error}</span>
            <button type="button" className="ml-auto" onClick={() => setError("")}>
              <Lucide icon="X" className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      <div className="col-span-12">
        {loading ? (
          <div className="intro-y box p-10 text-center text-slate-500">
            <Lucide icon="Loader" className="w-8 h-8 mx-auto mb-3 animate-spin text-primary" />
            Loading add-ons...
          </div>
        ) : rows.length === 0 ? (
          <div className="intro-y box p-10 text-center text-slate-500">No add-ons yet.</div>
        ) : (
          <div className="intro-y w-full overflow-x-auto">
            <table className="table table-report w-full min-w-[800px]">
              <thead>
                <tr>
                  <th>ADD-ON</th>
                  <th className="text-center">KIND</th>
                  <th className="text-right">PRICE</th>
                  <th className="text-center">STATUS</th>
                  <th className="text-center">CUSTOMERS</th>
                  <th className="text-center">ACTIONS</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((a) => (
                  <tr key={a.id} className="intro-x">
                    <td>
                      <div className="font-medium">{a.name}</div>
                      {a.description && (
                        <div className="text-slate-500 text-xs mt-1 max-w-[320px] truncate">{a.description}</div>
                      )}
                    </td>
                    <td className="text-center">{titleCase(a.kind)}</td>
                    <td className="text-right whitespace-nowrap">{money(a.price)}</td>
                    <td className="text-center">
                      <span
                        className={classnames("py-1 px-2 rounded-full text-xs font-medium", {
                          "bg-success/20 text-success": a.is_active,
                          "bg-slate-200 text-slate-500": !a.is_active,
                        })}
                      >
                        {a.is_active ? "Active" : "Inactive"}
                      </span>
                    </td>
                    <td className="text-center">{usage[a.id] || 0}</td>
                    <td className="table-report__action">
                      <div className="flex justify-center items-center gap-3">
                        {canEdit && (
                          <>
                            <button type="button" title="Edit" onClick={() => open(a)}>
                              <Lucide icon="Pencil" className="w-4 h-4 text-slate-500 hover:text-primary" />
                            </button>
                            <button type="button" title={a.is_active ? "Deactivate" : "Activate"} onClick={() => toggle(a)}>
                              <Lucide
                                icon="Power"
                                className={classnames("w-4 h-4", a.is_active ? "text-success" : "text-slate-400")}
                              />
                            </button>
                          </>
                        )}
                        {canDelete && (
                          <button
                            type="button"
                            title={usage[a.id] ? "In use - set to Inactive instead" : "Delete"}
                            onClick={() => remove(a)}
                          >
                            <Lucide
                              icon="Trash2"
                              className={classnames("w-4 h-4", usage[a.id] ? "text-slate-300" : "text-slate-500 hover:text-danger")}
                            />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {form && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60" onClick={() => !saving && setForm(null)}></div>
          <div className="relative box w-full max-w-lg p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center mb-5">
              <h2 className="text-lg font-medium">{editingId ? "Edit Add-on" : "Add Add-on"}</h2>
              <button type="button" className="ml-auto text-slate-500" onClick={() => setForm(null)}>
                <Lucide icon="X" className="w-5 h-5" />
              </button>
            </div>
            <div className="grid grid-cols-12 gap-4">
              <div className="col-span-12">
                <label className="text-xs text-slate-500">Name</label>
                <input className="form-control box mt-1 w-full" value={form.name} onChange={(e) => set("name", e.target.value)} />
              </div>
              <div className="col-span-6">
                <label className="text-xs text-slate-500">Kind</label>
                <select className="form-select box mt-1 w-full" value={form.kind} onChange={(e) => set("kind", e.target.value)}>
                  <option value="recurring">Recurring (every invoice)</option>
                  <option value="one_time">One time</option>
                </select>
              </div>
              <div className="col-span-6">
                <label className="text-xs text-slate-500">Price (PKR)</label>
                <input
                  type="number"
                  min="0"
                  className="form-control box mt-1 w-full"
                  value={form.price}
                  onChange={(e) => set("price", e.target.value)}
                />
              </div>
              <div className="col-span-12">
                <label className="text-xs text-slate-500">Description</label>
                <textarea
                  className="form-control box mt-1 w-full"
                  rows={2}
                  value={form.description}
                  onChange={(e) => set("description", e.target.value)}
                ></textarea>
              </div>
              <div className="col-span-12">
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    className="form-check-input"
                    checked={form.is_active}
                    onChange={(e) => set("is_active", e.target.checked)}
                  />
                  Active (available to attach)
                </label>
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-6">
              <button type="button" className="btn btn-outline-secondary" disabled={saving} onClick={() => setForm(null)}>
                Cancel
              </button>
              <button type="button" className="btn btn-primary shadow-md" disabled={saving} onClick={save}>
                {saving ? "Saving..." : editingId ? "Update Add-on" : "Save Add-on"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default AddonsCatalogue;
