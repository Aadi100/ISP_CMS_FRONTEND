import { useCallback, useEffect, useState } from "react";
import { Lucide } from "@/base-components";
import { supabase } from "@/lib/supabase";
import { can } from "@/lib/session";
import { friendlyError } from "@/lib/errors";
import { money, formatDate, titleCase } from "@/lib/format";

const today = () => new Date().toISOString().slice(0, 10);
const EMPTY = { name: "", kind: "percent", value: "", valid_from: today(), valid_until: "", note: "" };

function DiscountsTab({ sub, session }) {
  const [rows, setRows] = useState(null);
  const [form, setForm] = useState(null); // null = closed, object = add/edit
  const [editingId, setEditingId] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const canEdit = can(session, "subscribers", "edit");

  const load = useCallback(async () => {
    const { data, error: err } = await supabase
      .from("subscriber_discounts")
      .select("*")
      .eq("subscriber_id", sub.id)
      .order("created_at", { ascending: false });
    if (err) {
      setError(friendlyError(err));
      setRows([]);
    } else setRows(data || []);
  }, [sub.id]);

  useEffect(() => {
    load();
  }, [load]);

  const open = (d) => {
    setError("");
    if (d) {
      setEditingId(d.id);
      setForm({
        name: d.name,
        kind: d.kind,
        value: String(d.value),
        valid_from: d.valid_from,
        valid_until: d.valid_until || "",
        note: d.note || "",
      });
    } else {
      setEditingId(null);
      setForm({ ...EMPTY });
    }
  };

  const save = async () => {
    setError("");
    const value = Number(form.value);
    if (!form.name.trim()) return setError("Name is required.");
    if (!Number.isFinite(value) || value <= 0) return setError("Value must be greater than 0.");
    if (form.kind === "percent" && value > 100) return setError("A percentage cannot be more than 100.");
    if (form.valid_until && form.valid_until < form.valid_from)
      return setError("'Valid until' must be on or after 'Valid from'.");
    const payload = {
      name: form.name.trim(),
      kind: form.kind,
      value,
      valid_from: form.valid_from,
      valid_until: form.valid_until || null,
      note: form.note.trim() || null,
    };
    setBusy(true);
    try {
      const q = editingId
        ? supabase.from("subscriber_discounts").update(payload).eq("id", editingId)
        : supabase.from("subscriber_discounts").insert({ ...payload, subscriber_id: sub.id });
      const { error: err } = await q;
      if (err) throw err;
      setForm(null);
      await load();
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setBusy(false);
    }
  };

  const toggle = async (d) => {
    setError("");
    const { error: err } = await supabase
      .from("subscriber_discounts")
      .update({ is_active: !d.is_active })
      .eq("id", d.id);
    if (err) setError(friendlyError(err));
    else load();
  };

  const remove = async (d) => {
    if (!window.confirm(`Delete discount "${d.name}"?`)) return;
    const { error: err } = await supabase.from("subscriber_discounts").delete().eq("id", d.id);
    if (err) setError(friendlyError(err));
    else load();
  };

  const set = (k, v) => setForm((p) => ({ ...p, [k]: v }));

  return (
    <>
      <div className="alert alert-outline-primary show flex items-start text-sm mb-4">
        <Lucide icon="Info" className="w-5 h-5 mr-2 flex-none" />
        A discount applies to every invoice whose cycle starts inside its dates. A discount added today
        starts with the next cycle.
      </div>
      {error && <div className="alert alert-danger show mb-3">{error}</div>}
      {canEdit && !form && (
        <button type="button" className="btn btn-primary mb-4" onClick={() => open(null)}>
          <Lucide icon="Plus" className="w-4 h-4 mr-2" />
          Add discount
        </button>
      )}
      {form && (
        <div className="box p-4 mb-4 grid grid-cols-12 gap-3">
          <div className="col-span-12 sm:col-span-6">
            <label className="form-label">Name</label>
            <input className="form-control" placeholder="Eid offer" value={form.name} onChange={(e) => set("name", e.target.value)} />
          </div>
          <div className="col-span-6 sm:col-span-3">
            <label className="form-label">Type</label>
            <select className="form-select" value={form.kind} onChange={(e) => set("kind", e.target.value)}>
              <option value="percent">Percent</option>
              <option value="fixed">Fixed amount</option>
            </select>
          </div>
          <div className="col-span-6 sm:col-span-3">
            <label className="form-label">Value</label>
            <input type="number" min="0" step="0.01" className="form-control" value={form.value} onChange={(e) => set("value", e.target.value)} />
          </div>
          <div className="col-span-6">
            <label className="form-label">Valid from</label>
            <input type="date" className="form-control" value={form.valid_from} onChange={(e) => set("valid_from", e.target.value)} />
          </div>
          <div className="col-span-6">
            <label className="form-label">Valid until (optional)</label>
            <input type="date" className="form-control" value={form.valid_until} onChange={(e) => set("valid_until", e.target.value)} />
          </div>
          <div className="col-span-12">
            <label className="form-label">Note</label>
            <input className="form-control" value={form.note} onChange={(e) => set("note", e.target.value)} />
          </div>
          <div className="col-span-12 flex justify-end gap-2">
            <button type="button" className="btn btn-outline-secondary" disabled={busy} onClick={() => setForm(null)}>
              Cancel
            </button>
            <button type="button" className="btn btn-primary" disabled={busy} onClick={save}>
              {busy ? "Saving..." : editingId ? "Update" : "Save"}
            </button>
          </div>
        </div>
      )}
      {rows === null ? (
        <div className="p-6 text-center text-slate-500">Loading...</div>
      ) : rows.length === 0 ? (
        <div className="p-6 text-center text-slate-500">No discounts for this subscriber.</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="table w-full">
            <thead>
              <tr>
                <th>Name</th>
                <th>Discount</th>
                <th>Valid from</th>
                <th>Until</th>
                <th>Active</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((d) => (
                <tr key={d.id}>
                  <td>
                    {d.name}
                    {d.note && <div className="text-xs text-slate-500">{d.note}</div>}
                  </td>
                  <td className="whitespace-nowrap">
                    {d.kind === "percent" ? `${Number(d.value)}%` : money(d.value)} ({titleCase(d.kind)})
                  </td>
                  <td className="whitespace-nowrap">{formatDate(d.valid_from)}</td>
                  <td className="whitespace-nowrap">{formatDate(d.valid_until)}</td>
                  <td>
                    <input
                      type="checkbox"
                      className="form-check-input"
                      checked={d.is_active}
                      disabled={!canEdit}
                      onChange={() => toggle(d)}
                    />
                  </td>
                  <td className="whitespace-nowrap text-right">
                    {canEdit && (
                      <>
                        <button type="button" className="btn btn-sm btn-outline-secondary mr-2" onClick={() => open(d)}>
                          Edit
                        </button>
                        <button type="button" className="btn btn-sm btn-outline-danger" onClick={() => remove(d)}>
                          Delete
                        </button>
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

export default DiscountsTab;
