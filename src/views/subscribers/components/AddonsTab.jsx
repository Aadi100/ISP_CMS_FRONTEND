import { useCallback, useEffect, useState } from "react";
import { Lucide } from "@/base-components";
import { supabase } from "@/lib/supabase";
import { can } from "@/lib/session";
import { friendlyError } from "@/lib/errors";
import { money, formatDate, titleCase } from "@/lib/format";

const today = () => new Date().toISOString().slice(0, 10);

function AddonsTab({ sub, session }) {
  const [rows, setRows] = useState(null);
  const [catalogue, setCatalogue] = useState([]);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ addon_id: "", price: "", start_date: today() });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const canEdit = can(session, "subscribers", "edit");

  const load = useCallback(async () => {
    const { data, error: err } = await supabase
      .from("v_subscriber_addons")
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
    supabase
      .from("addons")
      .select("id,name,kind,price")
      .eq("is_active", true)
      .order("name")
      .then(({ data }) => setCatalogue(data || []));
  }, [load]);

  const pick = (id) => {
    const a = catalogue.find((x) => x.id === id);
    setForm((p) => ({ ...p, addon_id: id, price: a ? String(a.price) : "" }));
  };

  const attach = async () => {
    setError("");
    const price = Number(form.price);
    if (!form.addon_id) return setError("Choose an add-on.");
    if (!Number.isFinite(price) || price < 0) return setError("Price must be 0 or more.");
    setBusy(true);
    try {
      const { error: err } = await supabase.from("subscriber_addons").insert({
        subscriber_id: sub.id,
        addon_id: form.addon_id,
        price,
        start_date: form.start_date || today(),
      });
      if (err) throw err;
      setAdding(false);
      setForm({ addon_id: "", price: "", start_date: today() });
      await load();
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setBusy(false);
    }
  };

  const end = async (r) => {
    if (!window.confirm(`End add-on "${r.addon_name}" today?`)) return;
    setError("");
    const endDate = today() < r.start_date ? r.start_date : today();
    const { error: err } = await supabase
      .from("subscriber_addons")
      .update({ status: "ended", end_date: endDate })
      .eq("id", r.id);
    if (err) setError(friendlyError(err));
    else load();
  };

  return (
    <>
      <div className="alert alert-outline-primary show flex items-start text-sm mb-4">
        <Lucide icon="Info" className="w-5 h-5 mr-2 flex-none" />
        Recurring add-ons are added to every invoice; one-time add-ons to the next invoice only. An
        add-on attached today is billed from the next cycle.
      </div>
      {error && <div className="alert alert-danger show mb-3">{error}</div>}
      {canEdit && !adding && (
        <button type="button" className="btn btn-primary mb-4" onClick={() => setAdding(true)}>
          <Lucide icon="Plus" className="w-4 h-4 mr-2" />
          Attach add-on
        </button>
      )}
      {adding && (
        <div className="box p-4 mb-4 grid grid-cols-12 gap-3">
          <div className="col-span-12 sm:col-span-5">
            <label className="form-label">Add-on</label>
            <select className="form-select" value={form.addon_id} onChange={(e) => pick(e.target.value)}>
              <option value="">Select add-on</option>
              {catalogue.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name} ({titleCase(a.kind)}) - {money(a.price)}
                </option>
              ))}
            </select>
            {catalogue.length === 0 && (
              <div className="text-xs text-slate-500 mt-1">
                The catalogue is empty. Add add-ons on the Packages page.
              </div>
            )}
          </div>
          <div className="col-span-6 sm:col-span-3">
            <label className="form-label">Price</label>
            <input
              type="number"
              min="0"
              step="0.01"
              className="form-control"
              value={form.price}
              onChange={(e) => setForm((p) => ({ ...p, price: e.target.value }))}
            />
          </div>
          <div className="col-span-6 sm:col-span-4">
            <label className="form-label">Start date</label>
            <input
              type="date"
              className="form-control"
              value={form.start_date}
              onChange={(e) => setForm((p) => ({ ...p, start_date: e.target.value }))}
            />
          </div>
          <div className="col-span-12 flex justify-end gap-2">
            <button type="button" className="btn btn-outline-secondary" disabled={busy} onClick={() => setAdding(false)}>
              Cancel
            </button>
            <button type="button" className="btn btn-primary" disabled={busy} onClick={attach}>
              {busy ? "Saving..." : "Attach"}
            </button>
          </div>
        </div>
      )}
      {rows === null ? (
        <div className="p-6 text-center text-slate-500">Loading...</div>
      ) : rows.length === 0 ? (
        <div className="p-6 text-center text-slate-500">No add-ons for this subscriber.</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="table w-full">
            <thead>
              <tr>
                <th>Add-on</th>
                <th>Kind</th>
                <th>Price</th>
                <th>Start</th>
                <th>End</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td>{r.addon_name}</td>
                  <td>{titleCase(r.addon_kind)}</td>
                  <td className="whitespace-nowrap">{money(r.price)}</td>
                  <td className="whitespace-nowrap">{formatDate(r.start_date)}</td>
                  <td className="whitespace-nowrap">{formatDate(r.end_date)}</td>
                  <td>
                    <span
                      className={`py-1 px-2 rounded-full text-xs font-medium ${
                        r.status === "active" ? "bg-success/20 text-success" : "bg-slate-200 text-slate-500"
                      }`}
                    >
                      {titleCase(r.status)}
                    </span>
                  </td>
                  <td className="text-right">
                    {canEdit && r.status === "active" && (
                      <button type="button" className="btn btn-sm btn-outline-danger" onClick={() => end(r)}>
                        End
                      </button>
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

export default AddonsTab;
