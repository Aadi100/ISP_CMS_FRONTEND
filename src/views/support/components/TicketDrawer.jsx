import { Lucide } from "@/base-components";
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { can } from "@/lib/session";
import { friendlyError } from "@/lib/errors";
import { formatDateTime, titleCase } from "@/lib/format";
import { PriorityBadge, TicketStatusBadge, SlaBadge, STATUS_OPTIONS } from "./shared";

const SECTION = "mt-6 border-t border-slate-200/60 dark:border-darkmode-400 pt-4";

function TicketDrawer({ ticketId, session, employees, onClose, onChanged }) {
  const [ticket, setTicket] = useState(null);
  const [notes, setNotes] = useState([]);
  const [events, setEvents] = useState([]);
  const [materials, setMaterials] = useState([]);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const [noteDraft, setNoteDraft] = useState("");
  const [resolution, setResolution] = useState("");
  const [material, setMaterial] = useState({ item_id: "", quantity: "1", notes: "" });

  const canEdit = can(session, "tickets", "edit");
  const canNote = can(session, "tickets", "create") || canEdit;
  const canStock = can(session, "inventory", "edit");

  const load = useCallback(async () => {
    setError("");
    try {
      const [t, n, ev, mat] = await Promise.all([
        supabase.from("v_ticket_overview").select("*").eq("id", ticketId).maybeSingle(),
        supabase
          .from("ticket_notes")
          .select("id, note, created_at, profiles(full_name)")
          .eq("ticket_id", ticketId)
          .order("created_at", { ascending: false }),
        supabase.from("ticket_events").select("id, event, created_at").eq("ticket_id", ticketId).order("created_at"),
        supabase
          .from("v_stock_movements")
          .select("id, item_name, unit, quantity, notes, created_at, created_by_name")
          .eq("ticket_id", ticketId)
          .order("created_at", { ascending: false }),
      ]);
      if (t.error) throw t.error;
      if (n.error) throw n.error;
      if (ev.error) throw ev.error;
      if (mat.error) throw mat.error;
      setTicket(t.data);
      setResolution(t.data?.resolution_notes || "");
      setNotes(n.data || []);
      setEvents(ev.data || []);
      setMaterials(mat.data || []);
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setLoading(false);
    }
  }, [ticketId]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!canStock) return;
    supabase
      .from("stock_items")
      .select("id, name, unit, quantity_on_hand")
      .eq("is_active", true)
      .order("name")
      .then(({ data }) => setItems(data || []));
  }, [canStock]);

  const run = async (fn, after) => {
    setSaving(true);
    setError("");
    try {
      await fn();
      await load();
      onChanged();
      if (after) after();
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setSaving(false);
    }
  };

  const updateTicket = (patch) =>
    run(async () => {
      const { error: err } = await supabase.from("tickets").update(patch).eq("id", ticketId);
      if (err) throw err;
    });

  const addNote = () => {
    if (!noteDraft.trim()) return;
    run(
      async () => {
        const { error: err } = await supabase.from("ticket_notes").insert({ ticket_id: ticketId, note: noteDraft.trim() });
        if (err) throw err;
      },
      () => setNoteDraft("")
    );
  };

  const addMaterial = () => {
    const qty = Number(material.quantity);
    if (!material.item_id || !(qty > 0)) {
      setError("Pick a stock item and a quantity greater than zero.");
      return;
    }
    run(
      async () => {
        const { error: err } = await supabase.rpc("record_stock_movement", {
          p_item_id: material.item_id,
          p_type: "ticket_use",
          p_quantity: qty,
          p_ticket_id: ticketId,
          p_subscriber_id: ticket?.subscriber_id || null,
          p_notes: material.notes.trim() || null,
        });
        if (err) throw err;
        // refresh stock quantities
        const { data } = await supabase
          .from("stock_items")
          .select("id, name, unit, quantity_on_hand")
          .eq("is_active", true)
          .order("name");
        setItems(data || []);
      },
      () => setMaterial({ item_id: "", quantity: "1", notes: "" })
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60" onClick={onClose}></div>
      <div className="relative box w-full max-w-2xl p-6 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center mb-5">
          <h2 className="text-lg font-medium">Ticket Details</h2>
          <button type="button" onClick={onClose} className="ml-auto text-slate-500 hover:text-slate-700" aria-label="Close">
            <Lucide icon="X" className="w-5 h-5" />
          </button>
        </div>

        {error && <div className="mb-4 p-3 rounded-md bg-danger/10 text-danger text-sm">{error}</div>}

        {loading ? (
          <div className="text-slate-500 text-sm">Loading...</div>
        ) : !ticket ? (
          <div className="text-slate-500 text-sm">Ticket not found.</div>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-y-4 gap-x-4 text-sm">
              <div>
                <div className="text-slate-500 text-xs">Ticket Number</div>
                <div className="font-medium">{ticket.ticket_number}</div>
              </div>
              <div>
                <div className="text-slate-500 text-xs">Subscriber</div>
                <div className="font-medium">
                  {ticket.subscriber_name || "Walk-in / prospect"}
                  {ticket.subscriber_code ? ` (${ticket.subscriber_code})` : ""}
                </div>
              </div>
              <div>
                <div className="text-slate-500 text-xs">Phone Number</div>
                <div className="font-medium">{ticket.subscriber_phone || "—"}</div>
              </div>
              <div>
                <div className="text-slate-500 text-xs">Package</div>
                <div className="font-medium">{ticket.package_name || "—"}</div>
              </div>
              <div className="col-span-2">
                <div className="text-slate-500 text-xs">Installation Address</div>
                <div className="font-medium">{ticket.subscriber_address || "—"}</div>
              </div>
              <div>
                <div className="text-slate-500 text-xs">Complaint Category</div>
                <div className="font-medium">{titleCase(ticket.category)}</div>
              </div>
              <div>
                <div className="text-slate-500 text-xs mb-1">Priority</div>
                <PriorityBadge priority={ticket.priority} />
              </div>
              <div>
                <div className="text-slate-500 text-xs">Created</div>
                <div className="font-medium">{formatDateTime(ticket.created_at)}</div>
              </div>
              <div>
                <div className="text-slate-500 text-xs">Last Updated</div>
                <div className="font-medium">{formatDateTime(ticket.updated_at)}</div>
              </div>
              <div>
                <div className="text-slate-500 text-xs">Due</div>
                <div className="font-medium">{formatDateTime(ticket.due_at)}</div>
              </div>
              <div>
                <div className="text-slate-500 text-xs">Resolved / Closed</div>
                <div className="font-medium">
                  {formatDateTime(ticket.closed_at || ticket.resolved_at)}
                </div>
              </div>
              <div>
                <div className="text-slate-500 text-xs">Response Due</div>
                <div className="font-medium">{formatDateTime(ticket.response_due_at)}</div>
              </div>
              <div>
                <div className="text-slate-500 text-xs">Resolution Due</div>
                <div className="font-medium">{formatDateTime(ticket.resolution_due_at)}</div>
              </div>
              <div>
                <div className="text-slate-500 text-xs">First Response</div>
                <div className="font-medium">
                  {ticket.first_response_at ? formatDateTime(ticket.first_response_at) : "Not yet"}
                </div>
              </div>
              <div>
                <div className="text-slate-500 text-xs mb-1">SLA / Escalation Level</div>
                <SlaBadge ticket={ticket} />
                <span className="text-xs text-slate-500 ml-2">Level {Number(ticket.escalation_level || 0)}</span>
              </div>
              <div className="col-span-2">
                <div className="text-slate-500 text-xs">Complaint Description</div>
                <div className="font-medium whitespace-pre-wrap">{ticket.description || "—"}</div>
              </div>
            </div>

            {/* Status + assignment */}
            <div className={SECTION}>
              <div className="grid grid-cols-12 gap-4">
                <div className="col-span-12 sm:col-span-6">
                  <div className="text-slate-500 text-xs mb-1">Status</div>
                  {canEdit ? (
                    <select
                      className="form-select box w-full"
                      value={ticket.status}
                      disabled={saving}
                      onChange={(e) => updateTicket({ status: e.target.value })}
                    >
                      {STATUS_OPTIONS.map((s) => (
                        <option key={s} value={s}>{titleCase(s)}</option>
                      ))}
                    </select>
                  ) : (
                    <TicketStatusBadge status={ticket.status} />
                  )}
                </div>
                <div className="col-span-12 sm:col-span-6">
                  <div className="text-slate-500 text-xs mb-1">Assigned Technician</div>
                  {canEdit ? (
                    <select
                      className="form-select box w-full"
                      value={ticket.assigned_to || ""}
                      disabled={saving}
                      onChange={(e) => updateTicket({ assigned_to: e.target.value || null })}
                    >
                      <option value="">Unassigned</option>
                      {employees.map((e) => (
                        <option key={e.id} value={e.id}>{e.full_name}</option>
                      ))}
                    </select>
                  ) : (
                    <div className="font-medium text-sm">{ticket.technician_name || "Unassigned"}</div>
                  )}
                </div>
              </div>
            </div>

            {/* Resolution notes */}
            <div className={SECTION}>
              <div className="text-sm font-medium mb-2">Resolution Notes</div>
              <textarea
                className="form-control box w-full"
                rows={2}
                placeholder="How was the problem resolved?"
                value={resolution}
                disabled={!canEdit}
                onChange={(e) => setResolution(e.target.value)}
              ></textarea>
              {canEdit && (
                <div className="flex justify-end mt-2">
                  <button
                    type="button"
                    className="btn btn-outline-secondary"
                    disabled={saving || resolution === (ticket.resolution_notes || "")}
                    onClick={() => updateTicket({ resolution_notes: resolution.trim() || null })}
                  >
                    Save Resolution
                  </button>
                </div>
              )}
            </div>

            {/* Materials */}
            <div className={SECTION}>
              <div className="text-sm font-medium mb-2">Used Materials</div>
              {materials.length === 0 ? (
                <div className="text-slate-400 text-xs mb-2">No materials used on this ticket.</div>
              ) : (
                <ul className="space-y-1.5 mb-3">
                  {materials.map((m) => (
                    <li key={m.id} className="text-xs bg-slate-100 dark:bg-darkmode-300 rounded-md px-3 py-2 flex flex-wrap">
                      <span className="font-medium">
                        {m.item_name} x {Math.abs(Number(m.quantity))} {m.unit}
                      </span>
                      <span className="ml-auto text-slate-500">
                        {m.created_by_name || "Staff"} - {formatDateTime(m.created_at)}
                      </span>
                      {m.notes && <div className="w-full text-slate-500 mt-0.5">{m.notes}</div>}
                    </li>
                  ))}
                </ul>
              )}
              {canStock && (
                <div className="grid grid-cols-12 gap-2">
                  <select
                    className="form-select box col-span-12 sm:col-span-6"
                    value={material.item_id}
                    onChange={(e) => setMaterial((p) => ({ ...p, item_id: e.target.value }))}
                  >
                    <option value="">Select stock item</option>
                    {items.map((i) => (
                      <option key={i.id} value={i.id}>
                        {i.name} ({Number(i.quantity_on_hand)} {i.unit} in stock)
                      </option>
                    ))}
                  </select>
                  <input
                    type="number"
                    min="0"
                    step="any"
                    className="form-control box col-span-4 sm:col-span-2"
                    value={material.quantity}
                    onChange={(e) => setMaterial((p) => ({ ...p, quantity: e.target.value }))}
                  />
                  <input
                    type="text"
                    className="form-control box col-span-8 sm:col-span-4"
                    placeholder="Note (optional)"
                    value={material.notes}
                    onChange={(e) => setMaterial((p) => ({ ...p, notes: e.target.value }))}
                  />
                  <div className="col-span-12 flex justify-end">
                    <button type="button" className="btn btn-outline-secondary" disabled={saving} onClick={addMaterial}>
                      <Lucide icon="Package" className="w-4 h-4 mr-2" /> Add Used Material
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Notes */}
            <div className={SECTION}>
              <div className="text-sm font-medium mb-2">Internal Notes</div>
              {notes.length === 0 ? (
                <div className="text-slate-400 text-xs mb-2">No notes yet.</div>
              ) : (
                <ul className="space-y-1.5 mb-3">
                  {notes.map((n) => (
                    <li key={n.id} className="text-xs bg-slate-100 dark:bg-darkmode-300 rounded-md px-3 py-2">
                      <div className="whitespace-pre-wrap">{n.note}</div>
                      <div className="text-slate-500 mt-1">
                        {n.profiles?.full_name || "Staff"} - {formatDateTime(n.created_at)}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
              {canNote && (
                <div className="flex gap-2">
                  <input
                    type="text"
                    className="form-control box w-full"
                    placeholder="Add an internal note"
                    value={noteDraft}
                    onChange={(e) => setNoteDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") addNote();
                    }}
                  />
                  <button type="button" onClick={addNote} disabled={saving} className="btn btn-outline-secondary flex-none">
                    Add
                  </button>
                </div>
              )}
            </div>

            {/* Timeline */}
            <div className={SECTION}>
              <div className="text-sm font-medium mb-2">Timeline</div>
              {events.length === 0 ? (
                <div className="text-slate-400 text-xs">No events recorded.</div>
              ) : (
                <ul className="space-y-2">
                  {events.map((ev) => (
                    <li key={ev.id} className="flex items-start text-xs">
                      <Lucide icon="Clock" className="w-3.5 h-3.5 text-slate-400 mr-2 mt-0.5 flex-none" />
                      <div>
                        <span className="text-slate-500 mr-2">{formatDateTime(ev.created_at)}</span>
                        {ev.event}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </>
        )}

        <div className="flex justify-end gap-2 mt-6">
          <button type="button" onClick={onClose} className="btn btn-outline-secondary">Close</button>
        </div>
      </div>
    </div>
  );
}

export default TicketDrawer;
