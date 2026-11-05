import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { friendlyError } from "@/lib/errors";
import { titleCase } from "@/lib/format";

const PLACEHOLDERS = [
  "name", "company", "company_phone", "invoice_number", "amount", "due_date",
  "payment_amount", "receipt_number", "message",
];
// Preview-only sample values (never stored).
const SAMPLE = {
  name: "Ali Khan",
  company: "Your ISP",
  company_phone: "021-1234567",
  invoice_number: "INV-2026-1001",
  amount: "Rs 2,500",
  due_date: "15 Dec 2026",
  payment_amount: "Rs 2,500",
  receipt_number: "RCT-1001",
  message: "Planned maintenance tonight 1-3 AM.",
};
const render = (t) => String(t || "").replace(/\{\{\s*(\w+)\s*\}\}/g, (m, k) => SAMPLE[k] ?? m);

function TemplatesEditor({ canEdit }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");
  const [sel, setSel] = useState(null);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    const { data, error: err } = await supabase.from("notification_templates").select("*").order("kind");
    if (err) setError(friendlyError(err));
    setRows(data || []);
    setSel((cur) => cur || (data && data[0]?.id) || null);
    setLoading(false);
  };
  useEffect(() => {
    load();
  }, []);

  const cur = rows.find((r) => r.id === sel);
  const edit = (k, v) => setRows((rs) => rs.map((r) => (r.id === sel ? { ...r, [k]: v } : r)));

  const save = async () => {
    setSaving(true);
    setError("");
    setMsg("");
    const { data, error: err } = await supabase
      .from("notification_templates")
      .update({ subject: cur.subject, body: cur.body, is_active: cur.is_active })
      .eq("id", cur.id)
      .select();
    setSaving(false);
    if (err) return setError(friendlyError(err));
    if (!data?.length) return setError("You do not have permission to change templates.");
    setMsg("Template saved.");
  };

  return (
    <div className="intro-y box p-5">
      <div className="text-base font-medium mb-1">E-mail templates</div>
      <div className="text-xs text-slate-500 mb-4">
        Placeholders: {PLACEHOLDERS.map((p) => (
          <code key={p} className="mr-2">{`{{${p}}}`}</code>
        ))}
      </div>
      {error && <div className="alert alert-danger show mb-3 text-sm">{error}</div>}
      {msg && <div className="mb-3 text-sm text-success">{msg}</div>}
      {loading ? (
        <div className="text-slate-500 text-sm">Loading templates...</div>
      ) : rows.length === 0 ? (
        <div className="text-slate-500 text-sm">No templates found for your ISP.</div>
      ) : (
        <div className="grid grid-cols-12 gap-4">
          <div className="col-span-12 lg:col-span-3 flex lg:flex-col gap-1 flex-wrap">
            {rows.map((r) => (
              <button
                key={r.id}
                type="button"
                onClick={() => { setSel(r.id); setMsg(""); }}
                className={`text-left py-2 px-3 rounded-md text-sm ${sel === r.id ? "bg-primary text-white" : "bg-slate-100 dark:bg-darkmode-400"}`}
              >
                {titleCase(r.kind)}
                {!r.is_active && <span className="ml-1 text-xs opacity-70">(off)</span>}
              </button>
            ))}
          </div>
          {cur && (
            <div className="col-span-12 lg:col-span-9 grid grid-cols-12 gap-4">
              <div className="col-span-12 sm:col-span-7">
                <label className="text-xs text-slate-500">Subject</label>
                <input className="form-control box mt-1 w-full" disabled={!canEdit} value={cur.subject} onChange={(e) => edit("subject", e.target.value)} />
                <label className="text-xs text-slate-500 mt-3 block">Body</label>
                <textarea className="form-control box mt-1 w-full" rows={9} disabled={!canEdit} value={cur.body} onChange={(e) => edit("body", e.target.value)}></textarea>
                <label className="flex items-center mt-3 select-none">
                  <input type="checkbox" className="form-check-input" disabled={!canEdit} checked={cur.is_active} onChange={(e) => edit("is_active", e.target.checked)} />
                  <span className="ml-2 text-sm">Send this kind of e-mail</span>
                </label>
                {canEdit && (
                  <button type="button" className="btn btn-primary shadow-md mt-4" disabled={saving} onClick={save}>
                    {saving ? "Saving..." : "Save template"}
                  </button>
                )}
              </div>
              <div className="col-span-12 sm:col-span-5">
                <div className="text-xs text-slate-500 mb-1">Preview (sample values)</div>
                <div className="border border-slate-200/60 dark:border-darkmode-400 rounded-md p-3 text-sm">
                  <div className="font-medium mb-2">{render(cur.subject)}</div>
                  <div className="whitespace-pre-wrap">{render(cur.body)}</div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default TemplatesEditor;
