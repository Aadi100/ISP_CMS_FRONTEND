import { useState } from "react";
import { supabase } from "@/lib/supabase";
import { friendlyError } from "@/lib/errors";
import { Modal, ErrorBanner } from "./common";

export default function ReceiveDialog({ po, items, onClose, onDone }) {
  const open = items.filter((i) => Number(i.qty_ordered) > Number(i.qty_received));
  const [qty, setQty] = useState({});
  const [serials, setSerials] = useState({}); // { itemId: [..] }
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);

  const nQty = (id) => {
    const n = Number(qty[id] || 0);
    return Number.isFinite(n) && n > 0 ? n : 0;
  };

  const setSerial = (id, idx, value) => {
    const arr = [...(serials[id] || [])];
    arr[idx] = value;
    setSerials({ ...serials, [id]: arr });
  };

  const submit = async () => {
    setError("");
    const lines = [];
    const seen = new Set();
    for (const i of open) {
      const n = nQty(i.id);
      if (!n) continue;
      const pending = Number(i.qty_ordered) - Number(i.qty_received);
      if (n > pending) return setError(`"${i.description}": only ${pending} pending.`);
      const line = { po_item_id: i.id, qty: n };
      if (i.item_type === "equipment") {
        if (!Number.isInteger(n)) return setError(`"${i.description}": equipment quantity must be a whole number.`);
        const list = Array.from({ length: n }, (_, k) => (serials[i.id]?.[k] || "").trim());
        if (list.some((s) => !s)) return setError(`"${i.description}": enter all ${n} serial number(s).`);
        for (const s of list) {
          const key = s.toLowerCase();
          if (seen.has(key)) return setError(`Serial number "${s}" is entered more than once.`);
          seen.add(key);
        }
        line.serials = list;
      }
      lines.push(line);
    }
    if (!lines.length) return setError("Enter a quantity to receive for at least one line.");
    setSaving(true);
    const { data, error: e } = await supabase.rpc("receive_purchase", {
      p_po: po.id,
      p_lines: lines,
      p_notes: notes.trim() || null,
    });
    setSaving(false);
    if (e) return setError(friendlyError(e));
    const grn = Array.isArray(data) ? data[0] : data;
    const stockAdded = lines.filter((l) => open.find((i) => i.id === l.po_item_id)?.item_type === "stock");
    const units = lines.filter((l) => l.serials);
    setResult({
      grn: grn?.grn_number,
      stock: stockAdded.map((l) => {
        const it = open.find((i) => i.id === l.po_item_id);
        return `${l.qty} x ${it.description}`;
      }),
      units: units.reduce((s, l) => s + l.serials.length, 0),
    });
  };

  if (result) {
    return (
      <Modal
        title="Goods received"
        onClose={() => onDone()}
        footer={
          <button type="button" className="btn btn-primary" onClick={() => onDone()}>
            Done
          </button>
        }
      >
        <div className="text-success font-medium mb-3">Goods receipt {result.grn || ""} recorded.</div>
        {result.stock.length > 0 && (
          <div className="mb-2">
            <div className="text-slate-500 text-xs">Stock added</div>
            <ul className="list-disc ml-5 text-sm">
              {result.stock.map((s, k) => (
                <li key={k}>{s}</li>
              ))}
            </ul>
          </div>
        )}
        {result.units > 0 && (
          <div className="text-sm">
            {result.units} equipment unit(s) created as <b>In Stock</b> with the entered serial numbers.
          </div>
        )}
      </Modal>
    );
  }

  return (
    <Modal
      wide
      title={`Receive goods - ${po.po_number}`}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn btn-outline-secondary" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="btn btn-primary" disabled={saving} onClick={submit}>
            {saving ? "Receiving…" : "Receive"}
          </button>
        </>
      }
    >
      <ErrorBanner message={error} onClose={() => setError("")} />
      {open.length === 0 && <div className="text-slate-500">Everything on this order has been received.</div>}
      <div className="space-y-4">
        {open.map((i) => {
          const pending = Number(i.qty_ordered) - Number(i.qty_received);
          const n = nQty(i.id);
          return (
            <div key={i.id} className="border border-slate-200/60 dark:border-darkmode-400 rounded-md p-3">
              <div className="flex flex-wrap items-center gap-3">
                <div className="flex-1 min-w-[180px]">
                  <div className="font-medium">{i.description}</div>
                  <div className="text-xs text-slate-500">
                    Ordered {Number(i.qty_ordered)} | Received {Number(i.qty_received)} | Pending {pending}
                    {i.item_type === "equipment" ? ` | Equipment (${i.equipment_type})` : ""}
                  </div>
                </div>
                <div className="w-32">
                  <label className="form-label text-xs">Receive now</label>
                  <input
                    type="number"
                    min="0"
                    max={pending}
                    step={i.item_type === "equipment" ? 1 : "any"}
                    className="form-control"
                    value={qty[i.id] ?? ""}
                    onChange={(e) => setQty({ ...qty, [i.id]: e.target.value })}
                  />
                </div>
              </div>
              {i.item_type === "equipment" && n > 0 && Number.isInteger(n) && n <= pending && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-3">
                  {Array.from({ length: n }, (_, k) => (
                    <input
                      key={k}
                      className="form-control"
                      placeholder={`Serial number ${k + 1}`}
                      value={serials[i.id]?.[k] || ""}
                      onChange={(e) => setSerial(i.id, k, e.target.value)}
                    />
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
      <div className="mt-4">
        <label className="form-label">Notes</label>
        <input className="form-control" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Delivery note number, remarks…" />
      </div>
    </Modal>
  );
}
