import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { friendlyError } from "@/lib/errors";
import { titleCase } from "@/lib/format";
import { Modal } from "@/views/payments/components/shared";
import { ErrorBanner, SOURCES, FEASIBILITY, toLocalInput, fromLocalInput } from "./common";

export default function LeadForm({ lead, lookups, onClose, onSaved }) {
  const editing = Boolean(lead);
  const [f, setF] = useState({
    full_name: lead?.full_name || "",
    phone: lead?.phone || "",
    email: lead?.email || "",
    address: lead?.address || "",
    area_id: lead?.area_id || "",
    package_id: lead?.package_id || "",
    source: lead?.source || "walk_in",
    assigned_to: lead?.assigned_to || "",
    quoted_monthly_fee: lead?.quoted_monthly_fee ?? "",
    quoted_installation_fee: lead ? lead.quoted_installation_fee ?? "" : lookups.installCharge || "",
    follow_up_at: toLocalInput(lead?.follow_up_at),
    notes: lead?.notes || "",
    feasibility: lead?.feasibility || "unknown",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [dup, setDup] = useState(null);
  const set = (k, v) => setF((p) => ({ ...p, [k]: v }));

  // installation charge arrives async from settings
  useEffect(() => {
    if (!editing && lookups.installCharge && f.quoted_installation_fee === "") set("quoted_installation_fee", lookups.installCharge);
    // eslint-disable-next-line
  }, [lookups.installCharge]);

  // duplicate phone warning
  useEffect(() => {
    const phone = f.phone.trim();
    if (phone.length < 5) {
      setDup(null);
      return undefined;
    }
    let alive = true;
    const t = setTimeout(async () => {
      let lq = supabase.from("leads").select("lead_code,full_name").eq("phone", phone).limit(3);
      if (editing) lq = lq.neq("id", lead.id);
      const [l, s] = await Promise.all([
        lq,
        supabase.from("subscribers").select("subscriber_code,full_name").eq("phone", phone).limit(3),
      ]);
      if (!alive) return;
      setDup({ leads: l.data || [], subs: s.data || [] });
    }, 400);
    return () => {
      alive = false;
      clearTimeout(t);
    };
    // eslint-disable-next-line
  }, [f.phone]);

  const pickPackage = (id) => {
    set("package_id", id);
    const p = lookups.packages.find((x) => x.id === id);
    if (p && (!editing || f.quoted_monthly_fee === "")) set("quoted_monthly_fee", p.monthly_price);
  };

  const submit = async (e) => {
    e.preventDefault();
    if (!f.full_name.trim() || !f.phone.trim()) return setError("Name and phone are required.");
    setSaving(true);
    setError("");
    const num = (v) => (v === "" || v == null ? null : Number(v));
    const row = {
      full_name: f.full_name.trim(),
      phone: f.phone.trim(),
      email: f.email.trim() || null,
      address: f.address.trim() || null,
      area_id: f.area_id || null,
      package_id: f.package_id || null,
      source: f.source,
      assigned_to: f.assigned_to || null,
      quoted_monthly_fee: num(f.quoted_monthly_fee),
      quoted_installation_fee: num(f.quoted_installation_fee),
      follow_up_at: fromLocalInput(f.follow_up_at),
      notes: f.notes.trim() || null,
      feasibility: f.feasibility,
    };
    const { error: err } = editing
      ? await supabase.from("leads").update(row).eq("id", lead.id)
      : await supabase.from("leads").insert(row);
    setSaving(false);
    if (err) return setError(friendlyError(err));
    onSaved();
  };

  const hasDup = dup && (dup.leads.length > 0 || dup.subs.length > 0);

  return (
    <Modal
      wide
      title={editing ? `Edit ${lead.lead_code || "lead"}` : "Add lead"}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn btn-outline-secondary" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" form="lead-form" className="btn btn-primary" disabled={saving}>
            {saving ? "Saving..." : "Save lead"}
          </button>
        </>
      }
    >
      <ErrorBanner message={error} onClose={() => setError("")} />
      {hasDup && (
        <div className="alert alert-warning mb-3 text-sm" role="alert">
          This phone number already exists:
          {dup.subs.map((s) => (
            <div key={s.subscriber_code}>Customer {s.subscriber_code} - {s.full_name}</div>
          ))}
          {dup.leads.map((l) => (
            <div key={l.lead_code}>Lead {l.lead_code} - {l.full_name}</div>
          ))}
        </div>
      )}
      <form id="lead-form" onSubmit={submit} className="grid grid-cols-12 gap-3">
        <div className="col-span-12 sm:col-span-6">
          <label className="form-label">Name *</label>
          <input className="form-control" value={f.full_name} onChange={(e) => set("full_name", e.target.value)} />
        </div>
        <div className="col-span-12 sm:col-span-6">
          <label className="form-label">Phone *</label>
          <input className="form-control" value={f.phone} onChange={(e) => set("phone", e.target.value)} />
        </div>
        <div className="col-span-12 sm:col-span-6">
          <label className="form-label">Email</label>
          <input type="email" className="form-control" value={f.email} onChange={(e) => set("email", e.target.value)} />
        </div>
        <div className="col-span-12 sm:col-span-6">
          <label className="form-label">Area</label>
          <select className="form-select" value={f.area_id} onChange={(e) => set("area_id", e.target.value)}>
            <option value="">-</option>
            {lookups.areas.map((a) => (
              <option key={a.id} value={a.id}>{a.name}</option>
            ))}
          </select>
        </div>
        <div className="col-span-12">
          <label className="form-label">Address</label>
          <input className="form-control" value={f.address} onChange={(e) => set("address", e.target.value)} />
        </div>
        <div className="col-span-12 sm:col-span-6">
          <label className="form-label">Interested package</label>
          <select className="form-select" value={f.package_id} onChange={(e) => pickPackage(e.target.value)}>
            <option value="">-</option>
            {lookups.packages.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </div>
        <div className="col-span-12 sm:col-span-3">
          <label className="form-label">Source</label>
          <select className="form-select" value={f.source} onChange={(e) => set("source", e.target.value)}>
            {SOURCES.map((s) => (
              <option key={s} value={s}>{titleCase(s)}</option>
            ))}
          </select>
        </div>
        <div className="col-span-12 sm:col-span-3">
          <label className="form-label">Feasibility</label>
          <select className="form-select" value={f.feasibility} onChange={(e) => set("feasibility", e.target.value)}>
            {FEASIBILITY.map((s) => (
              <option key={s} value={s}>{titleCase(s)}</option>
            ))}
          </select>
        </div>
        <div className="col-span-12 sm:col-span-6">
          <label className="form-label">Assigned to</label>
          <select className="form-select" value={f.assigned_to} onChange={(e) => set("assigned_to", e.target.value)}>
            <option value="">Unassigned</option>
            {lookups.employees.map((e) => (
              <option key={e.id} value={e.id}>{e.full_name}</option>
            ))}
          </select>
        </div>
        <div className="col-span-12 sm:col-span-6">
          <label className="form-label">Follow-up</label>
          <input type="datetime-local" className="form-control" value={f.follow_up_at} onChange={(e) => set("follow_up_at", e.target.value)} />
        </div>
        <div className="col-span-12 sm:col-span-6">
          <label className="form-label">Quoted monthly fee (Rs)</label>
          <input type="number" min="0" className="form-control" value={f.quoted_monthly_fee} onChange={(e) => set("quoted_monthly_fee", e.target.value)} />
        </div>
        <div className="col-span-12 sm:col-span-6">
          <label className="form-label">Quoted installation fee (Rs)</label>
          <input type="number" min="0" className="form-control" value={f.quoted_installation_fee} onChange={(e) => set("quoted_installation_fee", e.target.value)} />
        </div>
        <div className="col-span-12">
          <label className="form-label">Notes</label>
          <textarea rows={3} className="form-control" value={f.notes} onChange={(e) => set("notes", e.target.value)} />
        </div>
      </form>
    </Modal>
  );
}
