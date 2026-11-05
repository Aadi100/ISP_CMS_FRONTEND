import { useCallback, useEffect, useState } from "react";
import { Lucide } from "@/base-components";
import { supabase } from "@/lib/supabase";
import { friendlyError } from "@/lib/errors";
import { can } from "@/lib/session";
import { money, formatDateTime, titleCase } from "@/lib/format";
import { Modal } from "@/views/payments/components/shared";
import { ErrorBanner, StageBadge, FEASIBILITY, toLocalInput, fromLocalInput } from "./common";
import ConvertDialog from "./ConvertDialog";

export default function LeadDrawer({ leadId, session, lookups, onClose, onChanged, onEdit }) {
  const [lead, setLead] = useState(null);
  const [acts, setActs] = useState([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [kind, setKind] = useState("note");
  const [note, setNote] = useState("");
  const [follow, setFollow] = useState("");
  const [lostOpen, setLostOpen] = useState(false);
  const [lostReason, setLostReason] = useState("");
  const [convertOpen, setConvertOpen] = useState(false);

  const canEdit = can(session, "leads", "edit");
  const canAdd = can(session, "leads", "create");

  const load = useCallback(async () => {
    const [l, a] = await Promise.all([
      supabase.from("v_lead_overview").select("*").eq("id", leadId).maybeSingle(),
      supabase.from("lead_activities").select("id,kind,note,created_at,profiles(full_name)").eq("lead_id", leadId).order("created_at", { ascending: false }).limit(200),
    ]);
    if (l.error || a.error) setError(friendlyError(l.error || a.error));
    setLead(l.data);
    setActs(a.data || []);
    setFollow(toLocalInput(l.data?.follow_up_at));
  }, [leadId]);

  useEffect(() => {
    load();
  }, [load]);

  const run = async (fn) => {
    setBusy(true);
    setError("");
    const { error: err } = await fn();
    setBusy(false);
    if (err) return setError(friendlyError(err));
    await load();
    onChanged();
  };

  const update = (patch) => run(() => supabase.from("leads").update(patch).eq("id", leadId));

  const addActivity = (e) => {
    e.preventDefault();
    if (!note.trim()) return;
    run(async () => {
      const r = await supabase.from("lead_activities").insert({ lead_id: leadId, kind, note: note.trim() });
      if (!r.error) setNote("");
      return r;
    });
  };

  const markLost = () => {
    if (!lostReason.trim()) return setError("Please enter a reason.");
    setLostOpen(false);
    update({ stage: "lost", lost_reason: lostReason.trim() });
    setLostReason("");
  };

  const canConvert =
    lead &&
    !["won", "lost"].includes(lead.stage) &&
    lead.feasibility !== "not_feasible" &&
    canEdit &&
    can(session, "subscribers", "create");

  return (
    <div className="fixed inset-0 z-40 flex justify-end">
      <div className="absolute inset-0 bg-black/50" onClick={onClose}></div>
      <div className="relative bg-white dark:bg-darkmode-600 w-full max-w-xl h-full overflow-y-auto p-5 shadow-xl">
        <div className="flex items-center mb-3">
          <h2 className="text-lg font-medium">{lead ? `${lead.lead_code} - ${lead.full_name}` : "Lead"}</h2>
          <button type="button" className="ml-auto text-slate-500" onClick={onClose} aria-label="Close">
            <Lucide icon="X" className="w-5 h-5" />
          </button>
        </div>
        <ErrorBanner message={error} onClose={() => setError("")} />
        {!lead ? (
          <div className="text-slate-500 text-sm">Loading...</div>
        ) : (
          <>
            <div className="flex items-center gap-2 mb-3">
              <StageBadge stage={lead.stage} />
              <span className="text-xs text-slate-500">Feasibility: {titleCase(lead.feasibility)}</span>
              {canEdit && (
                <button type="button" className="btn btn-outline-secondary btn-sm ml-auto" onClick={() => onEdit(lead)}>
                  <Lucide icon="Pencil" className="w-3 h-3 mr-1" /> Edit
                </button>
              )}
            </div>
            <div className="grid grid-cols-2 gap-3 text-sm mb-4">
              <Info label="Phone">{lead.phone}</Info>
              <Info label="Email">{lead.email || "-"}</Info>
              <Info label="Area">{lead.area_name || "-"}</Info>
              <Info label="Package">{lead.package_name || "-"}</Info>
              <Info label="Source">{titleCase(lead.source)}</Info>
              <Info label="Assigned to">{lead.assigned_name || "-"}</Info>
              <Info label="Quoted monthly">{lead.quoted_monthly_fee != null ? money(lead.quoted_monthly_fee) : "-"}</Info>
              <Info label="Quoted installation">{lead.quoted_installation_fee != null ? money(lead.quoted_installation_fee) : "-"}</Info>
              <Info label="Follow-up">
                <span className={lead.follow_up_overdue ? "text-danger" : ""}>{formatDateTime(lead.follow_up_at)}</span>
              </Info>
              <Info label="Customer">{lead.converted_code || "-"}</Info>
              <div className="col-span-2"><Info label="Address">{lead.address || "-"}</Info></div>
              {lead.notes && <div className="col-span-2"><Info label="Notes">{lead.notes}</Info></div>}
              {lead.lost_reason && <div className="col-span-2"><Info label="Lost reason">{lead.lost_reason}</Info></div>}
            </div>

            {canEdit && (
              <div className="box p-3 mb-4 space-y-3">
                <div className="font-medium text-sm">Quick actions</div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs text-slate-500">Feasibility</span>
                  {FEASIBILITY.map((f) => (
                    <button
                      key={f}
                      type="button"
                      disabled={busy || lead.feasibility === f}
                      className={`btn btn-sm ${lead.feasibility === f ? "btn-primary" : "btn-outline-secondary"}`}
                      onClick={() => update({ feasibility: f })}
                    >
                      {titleCase(f)}
                    </button>
                  ))}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs text-slate-500">Follow-up</span>
                  <input type="datetime-local" className="form-control w-56" value={follow} onChange={(e) => setFollow(e.target.value)} />
                  <button type="button" className="btn btn-outline-secondary btn-sm" disabled={busy} onClick={() => update({ follow_up_at: fromLocalInput(follow) })}>
                    Schedule
                  </button>
                </div>
                <div className="flex flex-wrap gap-2">
                  {canConvert && (
                    <button type="button" className="btn btn-success btn-sm" disabled={busy} onClick={() => setConvertOpen(true)}>
                      Convert to customer
                    </button>
                  )}
                  {lead.stage !== "lost" && lead.stage !== "won" && (
                    <button type="button" className="btn btn-outline-danger btn-sm" disabled={busy} onClick={() => setLostOpen(true)}>
                      Mark lost
                    </button>
                  )}
                  {lead.stage === "lost" && (
                    <button type="button" className="btn btn-outline-primary btn-sm" disabled={busy} onClick={() => update({ stage: "new", lost_reason: null })}>
                      Reopen
                    </button>
                  )}
                </div>
              </div>
            )}

            <div className="font-medium text-sm mb-2">Activity</div>
            {canAdd && (
              <form onSubmit={addActivity} className="flex gap-2 mb-3">
                <select className="form-select w-28" value={kind} onChange={(e) => setKind(e.target.value)}>
                  <option value="note">Note</option>
                  <option value="call">Call</option>
                  <option value="visit">Visit</option>
                </select>
                <input className="form-control" placeholder="What happened?" value={note} onChange={(e) => setNote(e.target.value)} />
                <button type="submit" className="btn btn-primary" disabled={busy || !note.trim()}>Add</button>
              </form>
            )}
            {acts.length === 0 ? (
              <div className="text-slate-500 text-sm">No activity yet.</div>
            ) : (
              <ul className="border-l border-slate-200 dark:border-darkmode-400 ml-2">
                {acts.map((a) => (
                  <li key={a.id} className="pl-4 pb-3 relative">
                    <span className="absolute -left-1.5 top-1.5 w-3 h-3 rounded-full bg-primary"></span>
                    <div className="text-xs text-slate-500">
                      {titleCase(a.kind)} - {formatDateTime(a.created_at)}
                      {a.profiles?.full_name ? ` - ${a.profiles.full_name}` : ""}
                    </div>
                    <div className="text-sm">{a.note}</div>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </div>

      {lostOpen && (
        <Modal
          title="Mark lead as lost"
          onClose={() => setLostOpen(false)}
          footer={
            <>
              <button type="button" className="btn btn-outline-secondary" onClick={() => setLostOpen(false)}>Cancel</button>
              <button type="button" className="btn btn-danger" onClick={markLost}>Mark lost</button>
            </>
          }
        >
          <label className="form-label">Reason</label>
          <textarea rows={3} className="form-control" value={lostReason} onChange={(e) => setLostReason(e.target.value)} />
        </Modal>
      )}
      {convertOpen && lead && (
        <ConvertDialog
          lead={lead}
          lookups={lookups}
          onClose={() => setConvertOpen(false)}
          onDone={() => {
            setConvertOpen(false);
            load();
            onChanged();
          }}
        />
      )}
    </div>
  );
}

function Info({ label, children }) {
  return (
    <div>
      <div className="text-xs text-slate-500">{label}</div>
      <div className="font-medium break-words">{children}</div>
    </div>
  );
}
