import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { friendlyError } from "@/lib/errors";
import { formatDateTime, money } from "@/lib/format";
import { SubscriberHistory } from "./HistoryTab";
import { equipLabel } from "./InstallationForm";
import { ErrorBanner, KV, Modal, StatusBadge, qty } from "./shared";

export default function InstallationDetail({ job, onClose }) {
  const [items, setItems] = useState([]);
  const [equip, setEquip] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [i, e] = await Promise.all([
        supabase.from("installation_items").select("*, stock_items(name, unit, item_code)").eq("installation_id", job.id),
        supabase
          .from("installation_equipment")
          .select("*, equipment(equipment_code, equipment_type, brand, model, serial_number, status)")
          .eq("installation_id", job.id),
      ]);
      if (cancelled) return;
      const err = i.error || e.error;
      if (err) setError(friendlyError(err));
      setItems(i.data || []);
      setEquip(e.data || []);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [job.id]);

  const done = job.status === "completed";
  const totalCost = items.reduce((s, x) => s + Number(x.used_qty || 0) * Number(x.unit_cost || 0), 0);

  return (
    <Modal
      title={`Installation ${job.installation_number}`}
      size="max-w-4xl"
      onClose={onClose}
      footer={
        <button type="button" className="btn btn-outline-secondary" onClick={onClose}>
          Close
        </button>
      }
    >
      <ErrorBanner message={error} />
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-y-4 gap-x-4 text-sm mt-3">
        <KV label="Customer">{`${job.subscriber_name} (${job.subscriber_code})`}</KV>
        <KV label="Phone">{job.subscriber_phone}</KV>
        <div>
          <div className="text-slate-500 text-xs mb-1">Status</div>
          <StatusBadge value={job.status} />
        </div>
        <KV label="Technician">{job.technician_name}</KV>
        <KV label="Scheduled">{formatDateTime(job.scheduled_at)}</KV>
        <KV label="Completed">{formatDateTime(job.completed_at)}</KV>
        <KV label="Address">{job.address || job.subscriber_address}</KV>
        <KV label="Installation fee">{money(job.installation_fee)}</KV>
        <KV label="Invoice">{job.invoice_number}</KV>
        <KV label="Notes">{job.notes}</KV>
      </div>

      <div className="mt-6 border-t border-slate-200/60 dark:border-darkmode-400 pt-4">
        <div className="text-sm font-medium mb-2">Materials: planned vs used</div>
        {loading ? (
          <div className="text-sm text-slate-500">Loading...</div>
        ) : items.length === 0 ? (
          <div className="text-sm text-slate-500">No materials on this job.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="table w-full min-w-[520px]">
              <thead>
                <tr>
                  <th>ITEM</th>
                  <th className="text-right">PLANNED</th>
                  <th className="text-right">USED</th>
                  <th className="text-right">UNIT COST</th>
                  <th className="text-right">COST</th>
                </tr>
              </thead>
              <tbody>
                {items.map((x) => (
                  <tr key={x.id}>
                    <td>{x.stock_items?.name}</td>
                    <td className="text-right">
                      {qty(x.planned_qty)} {x.stock_items?.unit}
                    </td>
                    <td className="text-right">
                      {x.used_qty === null ? "—" : `${qty(x.used_qty)} ${x.stock_items?.unit}`}
                    </td>
                    <td className="text-right">{done ? money(x.unit_cost) : "—"}</td>
                    <td className="text-right">{done ? money(Number(x.used_qty || 0) * Number(x.unit_cost || 0)) : "—"}</td>
                  </tr>
                ))}
              </tbody>
              {done && (
                <tfoot>
                  <tr>
                    <td colSpan={4} className="text-right font-medium">
                      Total materials cost
                    </td>
                    <td className="text-right font-medium">{money(totalCost)}</td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        )}
      </div>

      <div className="mt-6 border-t border-slate-200/60 dark:border-darkmode-400 pt-4">
        <div className="text-sm font-medium mb-2">Equipment</div>
        {equip.length === 0 ? (
          <div className="text-sm text-slate-500">No serial equipment on this job.</div>
        ) : (
          <ul className="list-disc ml-5 text-sm">
            {equip.map((x) => (
              <li key={x.id}>
                {x.equipment ? equipLabel(x.equipment) : x.equipment_id}
                {x.equipment && <span className="ml-2"><StatusBadge value={x.equipment.status} /></span>}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="mt-6 border-t border-slate-200/60 dark:border-darkmode-400 pt-4">
        <div className="text-sm font-medium mb-2">Customer inventory history</div>
        <SubscriberHistory subscriberId={job.subscriber_id} compact />
      </div>
    </Modal>
  );
}
