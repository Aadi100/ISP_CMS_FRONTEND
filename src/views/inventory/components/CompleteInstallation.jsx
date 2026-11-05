import { Lucide } from "@/base-components";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { friendlyError } from "@/lib/errors";
import { money, titleCase } from "@/lib/format";
import { EquipmentPicker, equipLabel, useInventoryOptions } from "./InstallationForm";
import { ErrorBanner, Field, Modal, nullIfEmpty, qty } from "./shared";

export default function CompleteInstallation({ job, onClose, onDone }) {
  const [planned, setPlanned] = useState(null); // {items, equipmentIds, subscriberStatus}
  const [rows, setRows] = useState([]); // {item_id, used}
  const [picked, setPicked] = useState(new Set());
  const [notes, setNotes] = useState("");
  const [loadErr, setLoadErr] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState(null);

  const plannedEquipIds = planned?.equipmentIds || [];
  const { stock, equipment, loading: optLoading, error: optErr } = useInventoryOptions(plannedEquipIds);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [items, eq, sub] = await Promise.all([
        supabase.from("installation_items").select("stock_item_id, planned_qty, used_qty").eq("installation_id", job.id),
        supabase.from("installation_equipment").select("equipment_id").eq("installation_id", job.id),
        supabase.from("subscribers").select("connection_status").eq("id", job.subscriber_id).maybeSingle(),
      ]);
      if (cancelled) return;
      const err = items.error || eq.error || sub.error;
      if (err) return setLoadErr(friendlyError(err));
      const equipmentIds = (eq.data || []).map((e) => e.equipment_id);
      setPlanned({ items: items.data || [], equipmentIds, subscriberStatus: sub.data?.connection_status });
      setRows((items.data || []).map((i) => ({ item_id: i.stock_item_id, used: String(i.planned_qty), planned: Number(i.planned_qty) })));
      setPicked(new Set(equipmentIds));
    })();
    return () => {
      cancelled = true;
    };
  }, [job.id, job.subscriber_id]);

  const stockById = Object.fromEntries(stock.map((s) => [s.id, s]));
  const setRow = (i, patch) => setRows((r) => r.map((x, idx) => (idx === i ? { ...x, ...patch } : x)));
  const toggle = (id) =>
    setPicked((p) => {
      const n = new Set(p);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });

  const lines = rows.map((r) => {
    const item = stockById[r.item_id];
    const used = Number(r.used) || 0;
    const onHand = item ? Number(item.quantity_on_hand) : 0;
    return { ...r, item, used, onHand, after: onHand - used, short: item ? onHand - used < 0 : false };
  });
  const shortLines = lines.filter((l) => l.short);
  const totalCost = lines.reduce((s, l) => s + l.used * Number(l.item?.unit_cost || 0), 0);
  const badEquip = [...picked].filter((id) => {
    const e = equipment.find((x) => x.id === id);
    return !e || !["available", "in_stock"].includes(e.status);
  });

  const submit = async () => {
    setSaving(true);
    setError("");
    const items = lines.filter((l) => l.item_id && l.used > 0).map((l) => ({ item_id: l.item_id, qty: l.used }));
    const { data, error: err } = await supabase.rpc("complete_installation", {
      p_installation_id: job.id,
      p_items: items,
      p_equipment_ids: [...picked],
      p_notes: nullIfEmpty(notes),
    });
    if (err) {
      setSaving(false);
      return setError(friendlyError(err));
    }
    let invoiceNumber = null;
    const { data: ov } = await supabase
      .from("v_installation_overview")
      .select("invoice_number, installation_fee")
      .eq("id", job.id)
      .maybeSingle();
    invoiceNumber = ov?.invoice_number || null;
    setSaving(false);
    setResult({
      deducted: lines.filter((l) => l.used > 0),
      equipment: [...picked].map((id) => equipment.find((e) => e.id === id)).filter(Boolean),
      activated: planned?.subscriberStatus === "pending",
      invoiceNumber,
      fee: data?.installation_fee ?? job.installation_fee,
    });
  };

  if (result) {
    return (
      <Modal
        title={`${job.installation_number} completed`}
        onClose={onDone}
        footer={
          <button type="button" className="btn btn-primary shadow-md" onClick={onDone}>
            Done
          </button>
        }
      >
        <div className="box p-3 bg-success/10 text-success text-sm flex items-center mb-4">
          <Lucide icon="CheckCircle2" className="w-4 h-4 mr-2" /> Installation for {job.subscriber_name} was completed.
        </div>
        <div className="text-sm space-y-4">
          <div>
            <div className="font-medium mb-1">Stock deducted</div>
            {result.deducted.length === 0 ? (
              <div className="text-slate-500">No materials were used.</div>
            ) : (
              <ul className="list-disc ml-5">
                {result.deducted.map((l) => (
                  <li key={l.item_id}>
                    {l.item?.name}: {qty(l.used)} {l.item?.unit} (now {qty(l.after)})
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div>
            <div className="font-medium mb-1">Equipment assigned to the customer</div>
            {result.equipment.length === 0 ? (
              <div className="text-slate-500">No serial equipment.</div>
            ) : (
              <ul className="list-disc ml-5">
                {result.equipment.map((e) => (
                  <li key={e.id}>{equipLabel(e)}</li>
                ))}
              </ul>
            )}
          </div>
          <div>
            <div className="font-medium mb-1">Customer</div>
            {result.activated ? "The customer was pending and is now Active." : "The customer connection status was left unchanged (already not pending)."}
          </div>
          <div>
            <div className="font-medium mb-1">Installation invoice</div>
            {result.invoiceNumber ? `${result.invoiceNumber} for ${money(result.fee)}` : "No invoice (installation fee is zero)."}
          </div>
          <div className="text-slate-500">Everything is recorded in the customer's inventory history.</div>
        </div>
      </Modal>
    );
  }

  const usedIds = new Set(rows.map((r) => r.item_id));
  const extraOptions = stock.filter((s) => !usedIds.has(s.id));

  return (
    <Modal
      title={`Complete ${job.installation_number}`}
      size="max-w-3xl"
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn btn-outline-secondary" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="btn btn-primary shadow-md"
            disabled={saving || !planned || optLoading || shortLines.length > 0 || badEquip.length > 0}
            onClick={submit}
          >
            {saving ? "Completing..." : "Complete Installation"}
          </button>
        </>
      }
    >
      <ErrorBanner message={loadErr || optErr || error} />
      {!planned && !loadErr ? (
        <div className="text-slate-500 text-sm">Loading...</div>
      ) : (
        planned && (
          <>
            <div className="text-sm text-slate-500 my-3">
              {job.subscriber_name} · {job.address || job.subscriber_address || "no address"} · technician {job.technician_name || "—"}.
              Enter what was really used. Unused planned items can be removed.
            </div>

            <div className="font-medium mb-2">Materials used</div>
            {lines.length === 0 && <div className="text-sm text-slate-500 mb-2">No materials.</div>}
            {lines.map((l, i) => (
              <div key={l.item_id || i} className="mb-3">
                <div className="flex gap-2 items-center">
                  {l.planned !== undefined ? (
                    <div className="flex-1 text-sm">
                      <span className="font-medium">{l.item?.name || "…"}</span>
                      <span className="text-slate-500"> (planned {qty(l.planned)} {l.item?.unit})</span>
                    </div>
                  ) : (
                    <select className="form-select box flex-1" value={l.item_id} onChange={(e) => setRow(i, { item_id: e.target.value })}>
                      <option value="">Select stock item</option>
                      {l.item_id && l.item && <option value={l.item_id}>{l.item.name} ({l.item.unit})</option>}
                      {extraOptions.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name} ({s.unit})
                        </option>
                      ))}
                    </select>
                  )}
                  <input
                    type="number"
                    min="0"
                    step="any"
                    className="form-control box w-28"
                    value={rows[i].used}
                    onChange={(e) => setRow(i, { used: e.target.value })}
                  />
                  <span className="text-xs text-slate-500 w-10">{l.item?.unit}</span>
                  <button type="button" className="text-slate-500 hover:text-danger" aria-label="Remove" onClick={() => setRows((r) => r.filter((_, j) => j !== i))}>
                    <Lucide icon="Trash2" className="w-4 h-4" />
                  </button>
                </div>
                {l.item && (
                  <div className={`text-xs mt-1 ${l.short ? "text-danger font-medium" : "text-slate-500"}`}>
                    {l.item.name}: on hand {qty(l.onHand)} &rarr; after {qty(l.after)} {l.item.unit}
                    {l.short && " (not enough stock - receive stock first or reduce the quantity)"}
                  </div>
                )}
              </div>
            ))}
            <button type="button" className="btn btn-outline-secondary btn-sm" onClick={() => setRows((r) => [...r, { item_id: "", used: "" }])}>
              <Lucide icon="Plus" className="w-4 h-4 mr-1" /> Add extra item
            </button>
            <div className="text-sm text-slate-500 mt-2">Materials cost at current unit cost: {money(totalCost)}</div>

            <div className="font-medium mt-5 mb-2">Equipment installed</div>
            {optLoading ? (
              <div className="text-sm text-slate-500">Loading...</div>
            ) : (
              <EquipmentPicker equipment={equipment} selected={picked} onToggle={toggle} />
            )}
            {badEquip.length > 0 && (
              <div className="text-xs text-danger mt-1">
                A selected unit is no longer available ({badEquip.length}). Untick it or choose another.
              </div>
            )}

            <div className="grid grid-cols-12 gap-4 mt-5">
              <Field label="Technician notes" className="col-span-12">
                <textarea rows={2} className="form-control box w-full" value={notes} onChange={(e) => setNotes(e.target.value)} />
              </Field>
            </div>
            <div className="text-xs text-slate-500 mt-2">
              On confirm: stock is deducted, the units are assigned to the customer, a pending customer becomes active
              {job.installation_fee > 0 ? ` and an invoice of ${money(job.installation_fee)} is raised.` : "."}
              {" "}Status now: {titleCase(job.status)}.
            </div>
          </>
        )
      )}
    </Modal>
  );
}
