import { useEffect, useState } from "react";
import { Lucide } from "@/base-components";
import { supabase } from "@/lib/supabase";
import { friendlyError } from "@/lib/errors";
import { money, titleCase } from "@/lib/format";
import { EQUIPMENT_TYPES, ErrorBanner } from "./common";

const EMPTY = { item_type: "stock", stock_item_id: "", equipment_type: "ONU", description: "", qty_ordered: "1", unit_cost: "0" };

/** Lines table; editable (add/edit/delete) only while the order is a draft. */
export default function LinesPanel({ po, items, canEdit, onChanged }) {
  const editable = canEdit && po.status === "draft";
  const [stock, setStock] = useState([]);
  const [form, setForm] = useState(null); // null = closed; {id?:..} otherwise
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!editable) return;
    supabase
      .from("stock_items")
      .select("id,name,unit,unit_cost,item_code")
      .eq("is_active", true)
      .order("name")
      .limit(1000)
      .then(({ data, error: e }) => (e ? setError(friendlyError(e)) : setStock(data || [])));
  }, [editable]);

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const pickStock = (e) => {
    const it = stock.find((s) => s.id === e.target.value);
    setForm({
      ...form,
      stock_item_id: e.target.value,
      description: it ? it.name : form.description,
      unit_cost: it && Number(form.unit_cost) === 0 ? String(it.unit_cost ?? 0) : form.unit_cost,
    });
  };

  const save = async () => {
    const qty = Number(form.qty_ordered);
    const cost = Number(form.unit_cost);
    if (form.item_type === "stock" && !form.stock_item_id) return setError("Choose a stock item.");
    if (!form.description.trim()) return setError("Enter a description.");
    if (!(qty > 0)) return setError("Quantity must be greater than zero.");
    if (!(cost >= 0)) return setError("Unit cost cannot be negative.");
    setSaving(true);
    setError("");
    const row = {
      item_type: form.item_type,
      stock_item_id: form.item_type === "stock" ? form.stock_item_id : null,
      equipment_type: form.item_type === "equipment" ? form.equipment_type : null,
      description: form.description.trim(),
      qty_ordered: qty,
      unit_cost: cost,
    };
    const { error: e } = form.id
      ? await supabase.from("purchase_order_items").update(row).eq("id", form.id)
      : await supabase.from("purchase_order_items").insert({ ...row, po_id: po.id });
    setSaving(false);
    if (e) return setError(friendlyError(e));
    setForm(null);
    onChanged();
  };

  const remove = async (id) => {
    if (!window.confirm("Remove this line?")) return;
    setError("");
    const { error: e } = await supabase.from("purchase_order_items").delete().eq("id", id);
    if (e) return setError(friendlyError(e));
    onChanged();
  };

  const unit = (stockId) => stock.find((s) => s.id === stockId)?.unit;

  return (
    <div>
      <div className="flex items-center mb-2">
        <div className="font-medium">Order lines</div>
        {editable && !form && (
          <button type="button" className="btn btn-outline-primary btn-sm ml-auto" onClick={() => setForm({ ...EMPTY })}>
            <Lucide icon="Plus" className="w-4 h-4 mr-1" /> Add line
          </button>
        )}
      </div>
      <ErrorBanner message={error} onClose={() => setError("")} />
      {form && (
        <div className="border border-slate-200/60 dark:border-darkmode-400 rounded-md p-3 mb-3 grid grid-cols-12 gap-3">
          <div className="col-span-12 sm:col-span-3">
            <label className="form-label">Type</label>
            <select
              className="form-select"
              value={form.item_type}
              onChange={(e) => setForm({ ...form, item_type: e.target.value, stock_item_id: "", description: "" })}
            >
              <option value="stock">Stock item</option>
              <option value="equipment">Equipment</option>
            </select>
          </div>
          {form.item_type === "stock" ? (
            <div className="col-span-12 sm:col-span-9">
              <label className="form-label">Stock item</label>
              <select className="form-select" value={form.stock_item_id} onChange={pickStock}>
                <option value="">Select item…</option>
                {stock.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.item_code} - {s.name} ({s.unit})
                  </option>
                ))}
              </select>
            </div>
          ) : (
            <>
              <div className="col-span-12 sm:col-span-3">
                <label className="form-label">Equipment type</label>
                <input list="po-eq-types" className="form-control" value={form.equipment_type} onChange={set("equipment_type")} />
                <datalist id="po-eq-types">
                  {EQUIPMENT_TYPES.map((t) => (
                    <option key={t} value={t} />
                  ))}
                </datalist>
              </div>
              <div className="col-span-12 sm:col-span-6">
                <label className="form-label">Description</label>
                <input className="form-control" value={form.description} onChange={set("description")} />
              </div>
            </>
          )}
          <div className="col-span-6 sm:col-span-3">
            <label className="form-label">
              Quantity{form.item_type === "stock" && unit(form.stock_item_id) ? ` (${unit(form.stock_item_id)})` : ""}
            </label>
            <input type="number" min="0" step="any" className="form-control" value={form.qty_ordered} onChange={set("qty_ordered")} />
          </div>
          <div className="col-span-6 sm:col-span-3">
            <label className="form-label">Unit cost</label>
            <input type="number" min="0" step="any" className="form-control" value={form.unit_cost} onChange={set("unit_cost")} />
          </div>
          <div className="col-span-12 sm:col-span-6 flex items-end justify-between">
            <div className="text-sm">
              Line total: <b>{money(Number(form.qty_ordered || 0) * Number(form.unit_cost || 0))}</b>
            </div>
            <div className="flex gap-2">
              <button type="button" className="btn btn-outline-secondary" onClick={() => { setForm(null); setError(""); }}>
                Cancel
              </button>
              <button type="button" className="btn btn-primary" disabled={saving} onClick={save}>
                {saving ? "Saving…" : form.id ? "Update line" : "Add line"}
              </button>
            </div>
          </div>
        </div>
      )}
      <div className="overflow-x-auto">
        <table className="table table-bordered text-sm">
          <thead>
            <tr>
              <th>Item</th>
              <th>Type</th>
              <th className="text-right">Ordered</th>
              <th className="text-right">Received</th>
              <th className="text-right">Unit cost</th>
              <th className="text-right">Total</th>
              {editable && <th></th>}
            </tr>
          </thead>
          <tbody>
            {items.map((i) => (
              <tr key={i.id}>
                <td>{i.description}</td>
                <td className="whitespace-nowrap">{i.item_type === "equipment" ? i.equipment_type : "Stock"}</td>
                <td className="text-right">{Number(i.qty_ordered)}</td>
                <td className="text-right">{Number(i.qty_received)}</td>
                <td className="text-right whitespace-nowrap">{money(i.unit_cost)}</td>
                <td className="text-right whitespace-nowrap">{money(i.qty_ordered * i.unit_cost)}</td>
                {editable && (
                  <td className="whitespace-nowrap text-right">
                    <button
                      type="button"
                      className="mr-3 text-primary"
                      title="Edit"
                      onClick={() =>
                        setForm({
                          id: i.id,
                          item_type: i.item_type,
                          stock_item_id: i.stock_item_id || "",
                          equipment_type: i.equipment_type || "ONU",
                          description: i.description,
                          qty_ordered: String(i.qty_ordered),
                          unit_cost: String(i.unit_cost),
                        })
                      }
                    >
                      <Lucide icon="Edit" className="w-4 h-4" />
                    </button>
                    <button type="button" className="text-danger" title="Delete" onClick={() => remove(i.id)}>
                      <Lucide icon="Trash2" className="w-4 h-4" />
                    </button>
                  </td>
                )}
              </tr>
            ))}
            {items.length === 0 && (
              <tr>
                <td colSpan={editable ? 7 : 6} className="text-center text-slate-500 py-4">
                  No lines yet.{editable ? " Add the first line." : ""}
                </td>
              </tr>
            )}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={5} className="text-right font-medium">
                Order total ({titleCase(po.status)})
              </td>
              <td className="text-right font-medium whitespace-nowrap">{money(items.reduce((s, i) => s + i.qty_ordered * i.unit_cost, 0))}</td>
              {editable && <td></td>}
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}
