import { Lucide } from "@/base-components";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { friendlyError } from "@/lib/errors";
import { ErrorBanner, Field, Modal, SubscriberSelect, TechnicianSelect, nullIfEmpty, qty } from "./shared";

/** Hook shared by the new / complete dialogs: active stock items + usable serial units. */
export function useInventoryOptions(extraEquipmentIds = []) {
  const [stock, setStock] = useState([]);
  const [equipment, setEquipment] = useState([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const extraKey = extraEquipmentIds.join(",");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [s, e, x] = await Promise.all([
        supabase
          .from("v_stock_overview")
          .select("id, item_code, name, unit, quantity_on_hand, unit_cost")
          .eq("is_active", true)
          .order("name")
          .limit(1000),
        supabase
          .from("v_equipment_overview")
          .select("id, equipment_code, equipment_type, brand, model, serial_number, status")
          .in("status", ["available", "in_stock"])
          .order("equipment_type")
          .limit(1000),
        extraEquipmentIds.length
          ? supabase
              .from("v_equipment_overview")
              .select("id, equipment_code, equipment_type, brand, model, serial_number, status")
              .in("id", extraEquipmentIds)
          : { data: [] },
      ]);
      if (cancelled) return;
      const err = s.error || e.error || x.error;
      if (err) setError(friendlyError(err));
      const map = new Map();
      [...(x.data || []), ...(e.data || [])].forEach((r) => map.set(r.id, r));
      setStock(s.data || []);
      setEquipment([...map.values()]);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [extraKey]);

  return { stock, equipment, error, loading };
}

export function equipLabel(e) {
  return [e.equipment_code, e.equipment_type, e.brand, e.model, e.serial_number && `SN ${e.serial_number}`]
    .filter(Boolean)
    .join(" · ");
}

export function EquipmentPicker({ equipment, selected, onToggle }) {
  const [filter, setFilter] = useState("");
  const f = filter.trim().toLowerCase();
  const list = equipment.filter((e) => !f || equipLabel(e).toLowerCase().includes(f));
  return (
    <div>
      <input
        className="form-control box w-full mb-2"
        placeholder="Filter units by type, model or serial"
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
      />
      <div className="border border-slate-200/60 dark:border-darkmode-400 rounded-md max-h-44 overflow-y-auto">
        {list.length === 0 && <div className="p-3 text-sm text-slate-500">No equipment available.</div>}
        {list.map((e) => (
          <label key={e.id} className="flex items-center gap-2 px-3 py-1.5 text-sm cursor-pointer hover:bg-slate-100 dark:hover:bg-darkmode-400">
            <input type="checkbox" className="form-check-input" checked={selected.has(e.id)} onChange={() => onToggle(e.id)} />
            <span className="flex-1">{equipLabel(e)}</span>
            {e.status !== "available" && e.status !== "in_stock" && (
              <span className="text-xs text-danger">{e.status}</span>
            )}
          </label>
        ))}
      </div>
      <div className="text-xs text-slate-500 mt-1">{selected.size} selected</div>
    </div>
  );
}

export default function InstallationForm({ ctx, onClose, onCreated }) {
  const { employees } = ctx;
  const { stock, equipment, error: optErr, loading } = useInventoryOptions();
  const [subscriber, setSubscriber] = useState(null);
  const [technician, setTechnician] = useState("");
  const [scheduled, setScheduled] = useState("");
  const [address, setAddress] = useState("");
  const [fee, setFee] = useState("");
  const [notes, setNotes] = useState("");
  const [rows, setRows] = useState([{ item_id: "", qty: "" }]);
  const [picked, setPicked] = useState(new Set());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    supabase
      .from("organization_settings")
      .select("installation_charges")
      .maybeSingle()
      .then(({ data }) => {
        if (data?.installation_charges != null) setFee(String(data.installation_charges));
      });
  }, []);

  const pickSubscriber = (s) => {
    setSubscriber(s);
    setAddress(s ? s.installation_location || s.address || "" : "");
  };

  const stockById = Object.fromEntries(stock.map((s) => [s.id, s]));
  const setRow = (i, patch) => setRows((r) => r.map((x, idx) => (idx === i ? { ...x, ...patch } : x)));
  const toggle = (id) =>
    setPicked((p) => {
      const n = new Set(p);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });

  const submit = async () => {
    if (!subscriber) return setError("Choose the customer.");
    const items = rows
      .filter((r) => r.item_id && Number(r.qty) > 0)
      .map((r) => ({ item_id: r.item_id, qty: Number(r.qty) }));
    setSaving(true);
    setError("");
    const { error: err } = await supabase.rpc("create_installation", {
      p_subscriber_id: subscriber.id,
      p_technician_id: nullIfEmpty(technician),
      p_scheduled_at: scheduled ? new Date(scheduled).toISOString() : null,
      p_address: nullIfEmpty(address),
      p_notes: nullIfEmpty(notes),
      p_fee: fee === "" ? null : Number(fee),
      p_items: items,
      p_equipment_ids: [...picked],
    });
    setSaving(false);
    if (err) return setError(friendlyError(err));
    onCreated();
  };

  return (
    <Modal
      title="New Installation"
      size="max-w-3xl"
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn btn-outline-secondary" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="btn btn-primary shadow-md" disabled={saving || loading} onClick={submit}>
            {saving ? "Saving..." : "Create Installation"}
          </button>
        </>
      }
    >
      <ErrorBanner message={error || optErr} />
      <div className="grid grid-cols-12 gap-4 mt-3">
        <Field label="Customer *" className="col-span-12">
          <SubscriberSelect value={subscriber} onChange={pickSubscriber} />
        </Field>
        <Field label="Technician">
          <TechnicianSelect employees={employees} value={technician} onChange={setTechnician} allLabel="— Unassigned —" />
        </Field>
        <Field label="Scheduled date & time">
          <input type="datetime-local" className="form-control box w-full" value={scheduled} onChange={(e) => setScheduled(e.target.value)} />
        </Field>
        <Field label="Installation address" className="col-span-12 sm:col-span-8">
          <input className="form-control box w-full" value={address} onChange={(e) => setAddress(e.target.value)} />
        </Field>
        <Field label="Installation fee (PKR)" className="col-span-12 sm:col-span-4">
          <input type="number" min="0" className="form-control box w-full" value={fee} onChange={(e) => setFee(e.target.value)} />
        </Field>
        <Field label="Notes" className="col-span-12">
          <textarea rows={2} className="form-control box w-full" value={notes} onChange={(e) => setNotes(e.target.value)} />
        </Field>

        <div className="col-span-12 border-t border-slate-200/60 dark:border-darkmode-400 pt-4">
          <div className="flex items-center mb-2">
            <div className="font-medium">Planned materials</div>
            <button
              type="button"
              className="btn btn-outline-secondary btn-sm ml-auto"
              onClick={() => setRows((r) => [...r, { item_id: "", qty: "" }])}
            >
              <Lucide icon="Plus" className="w-4 h-4 mr-1" /> Add material
            </button>
          </div>
          {rows.map((r, i) => {
            const item = stockById[r.item_id];
            const over = item && Number(r.qty) > Number(item.quantity_on_hand);
            return (
              <div key={i} className="mb-2">
                <div className="flex gap-2 items-center">
                  <select className="form-select box flex-1" value={r.item_id} onChange={(e) => setRow(i, { item_id: e.target.value })}>
                    <option value="">Select stock item</option>
                    {stock.map((s) => (
                      <option key={s.id} value={s.id} disabled={rows.some((x, j) => j !== i && x.item_id === s.id)}>
                        {s.name} ({s.unit})
                      </option>
                    ))}
                  </select>
                  <input
                    type="number"
                    min="0"
                    step="any"
                    className="form-control box w-28"
                    placeholder="Qty"
                    value={r.qty}
                    onChange={(e) => setRow(i, { qty: e.target.value })}
                  />
                  <div className="w-32 text-xs text-slate-500">{item ? `On hand: ${qty(item.quantity_on_hand)} ${item.unit}` : ""}</div>
                  <button type="button" className="text-slate-500 hover:text-danger" onClick={() => setRows((x) => x.filter((_, j) => j !== i))} aria-label="Remove">
                    <Lucide icon="Trash2" className="w-4 h-4" />
                  </button>
                </div>
                {over && (
                  <div className="text-xs text-warning mt-1">
                    Planned quantity is more than the stock on hand. Stock must be received before the job can be completed.
                  </div>
                )}
              </div>
            );
          })}
          {rows.length === 0 && <div className="text-sm text-slate-500">No materials planned.</div>}
        </div>

        <div className="col-span-12 border-t border-slate-200/60 dark:border-darkmode-400 pt-4">
          <div className="font-medium mb-2">Serial equipment to use</div>
          {loading ? (
            <div className="text-sm text-slate-500">Loading...</div>
          ) : (
            <EquipmentPicker equipment={equipment} selected={picked} onToggle={toggle} />
          )}
        </div>
      </div>
    </Modal>
  );
}
