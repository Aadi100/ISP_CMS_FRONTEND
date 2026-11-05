import { useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { friendlyError } from "@/lib/errors";
import { money } from "@/lib/format";
import { Modal } from "@/views/payments/components/shared";
import { ErrorBanner, fromLocalInput } from "./common";

export default function ConvertDialog({ lead, lookups, onClose, onDone }) {
  const [fee, setFee] = useState(lead.quoted_monthly_fee ?? "");
  const [install, setInstall] = useState(true);
  const [tech, setTech] = useState("");
  const [when, setWhen] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);

  const submit = async () => {
    setSaving(true);
    setError("");
    const { data, error: err } = await supabase.rpc("convert_lead", {
      p_lead_id: lead.id,
      p_monthly_fee: fee === "" ? null : Number(fee),
      p_create_installation: install,
      p_technician: install && tech ? tech : null,
      p_scheduled_at: install ? fromLocalInput(when) : null,
    });
    setSaving(false);
    if (err) return setError(friendlyError(err));
    const r = Array.isArray(data) ? data[0] : data;
    let code = "";
    if (r?.subscriber_id) {
      const { data: s } = await supabase.from("subscribers").select("subscriber_code").eq("id", r.subscriber_id).maybeSingle();
      code = s?.subscriber_code || "";
    }
    setResult({ ...r, code });
  };

  if (result) {
    return (
      <Modal
        title="Lead converted"
        onClose={onDone}
        footer={<button type="button" className="btn btn-primary" onClick={onDone}>Done</button>}
      >
        <div className="text-sm space-y-2">
          <div>
            Customer created: <b>{result.code || "(see subscribers)"}</b> (pending activation){" "}
            <Link to="/subscribers" className="text-primary underline">Open subscribers</Link>
          </div>
          {result.installation_number ? (
            <div>
              Installation job: <b>{result.installation_number}</b>{" "}
              <Link to="/inventory" className="text-primary underline">Open inventory</Link>
            </div>
          ) : install ? (
            <div className="text-slate-500">No installation job was created (you may lack the installations permission).</div>
          ) : null}
        </div>
      </Modal>
    );
  }

  return (
    <Modal
      title={`Convert ${lead.full_name} to customer`}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn btn-outline-secondary" onClick={onClose}>Cancel</button>
          <button type="button" className="btn btn-primary" disabled={saving} onClick={submit}>
            {saving ? "Converting..." : "Convert"}
          </button>
        </>
      }
    >
      <ErrorBanner message={error} onClose={() => setError("")} />
      <div className="space-y-3">
        <div>
          <label className="form-label">Monthly fee (Rs)</label>
          <input type="number" min="0" className="form-control" value={fee} onChange={(e) => setFee(e.target.value)} />
          <div className="text-xs text-slate-500 mt-1">
            Package: {lead.package_name || "-"}; installation fee quoted: {money(lead.quoted_installation_fee || 0)}
          </div>
        </div>
        <label className="flex items-center">
          <input type="checkbox" className="form-check-input mr-2" checked={install} onChange={(e) => setInstall(e.target.checked)} />
          Create installation job
        </label>
        {install && (
          <>
            <div>
              <label className="form-label">Technician</label>
              <select className="form-select" value={tech} onChange={(e) => setTech(e.target.value)}>
                <option value="">Unassigned</option>
                {lookups.employees.map((e) => (
                  <option key={e.id} value={e.id}>{e.full_name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="form-label">Scheduled date / time</label>
              <input type="datetime-local" className="form-control" value={when} onChange={(e) => setWhen(e.target.value)} />
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}
