import { Lucide } from "@/base-components";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { friendlyError } from "@/lib/errors";
import { titleCase } from "@/lib/format";
import { PRIORITY_OPTIONS } from "./shared";
import useCategories from "./useCategories";

const cleanTerm = (s) => s.replace(/[,()%*\\]/g, " ").trim();

function NewTicketModal({ employees, onClose, onCreated }) {
  const categories = useCategories();
  const [form, setForm] = useState({
    category: "",
    priority: "medium",
    description: "",
    assigned_to: "",
    due_at: "",
  });
  const [subscriber, setSubscriber] = useState(null);
  const [subSearch, setSubSearch] = useState("");
  const [subResults, setSubResults] = useState([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const term = cleanTerm(subSearch);
    if (term.length < 2) {
      setSubResults([]);
      return undefined;
    }
    const timer = window.setTimeout(async () => {
      const { data } = await supabase
        .from("subscribers")
        .select("id, subscriber_code, full_name, phone")
        .or(`full_name.ilike.%${term}%,phone.ilike.%${term}%,subscriber_code.ilike.%${term}%`)
        .limit(8);
      setSubResults(data || []);
    }, 250);
    return () => window.clearTimeout(timer);
  }, [subSearch]);

  const set = (k) => (e) => setForm((p) => ({ ...p, [k]: e.target.value }));

  const submit = async () => {
    if (!form.description.trim()) {
      setError("Please describe the complaint.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const { data, error: err } = await supabase
        .from("tickets")
        .insert({
          subscriber_id: subscriber?.id || null,
          category: form.category || categories[0]?.name,
          priority: form.priority,
          description: form.description.trim(),
          assigned_to: form.assigned_to || null,
          due_at: form.due_at ? new Date(form.due_at).toISOString() : null,
        })
        .select("ticket_number")
        .single();
      if (err) throw err;
      onCreated(data?.ticket_number || "");
    } catch (e) {
      setError(friendlyError(e));
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60" onClick={onClose}></div>
      <div className="relative box w-full max-w-lg p-6 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center mb-5">
          <h2 className="text-lg font-medium">New Ticket</h2>
          <button type="button" onClick={onClose} className="ml-auto text-slate-500 hover:text-slate-700" aria-label="Close">
            <Lucide icon="X" className="w-5 h-5" />
          </button>
        </div>

        {error && <div className="mb-4 p-3 rounded-md bg-danger/10 text-danger text-sm">{error}</div>}

        <div className="grid grid-cols-12 gap-4">
          <div className="col-span-12">
            <label className="text-xs text-slate-500">Subscriber (optional)</label>
            {subscriber ? (
              <div className="box mt-1 p-2 px-3 flex items-center text-sm">
                <div>
                  <span className="font-medium">{subscriber.full_name}</span>
                  <span className="text-slate-500 ml-2">
                    {subscriber.subscriber_code} {subscriber.phone ? `- ${subscriber.phone}` : ""}
                  </span>
                </div>
                <button type="button" className="ml-auto text-slate-500 hover:text-danger" onClick={() => setSubscriber(null)}>
                  <Lucide icon="X" className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <div className="relative">
                <input
                  type="text"
                  className="form-control box mt-1 w-full"
                  placeholder="Search by name, phone or subscriber ID"
                  value={subSearch}
                  onChange={(e) => setSubSearch(e.target.value)}
                />
                {subResults.length > 0 && (
                  <ul className="absolute z-10 left-0 right-0 box mt-1 max-h-48 overflow-y-auto shadow-lg">
                    {subResults.map((s) => (
                      <li key={s.id}>
                        <button
                          type="button"
                          className="w-full text-left px-3 py-2 text-sm hover:bg-slate-100 dark:hover:bg-darkmode-400"
                          onClick={() => {
                            setSubscriber(s);
                            setSubSearch("");
                            setSubResults([]);
                          }}
                        >
                          <span className="font-medium">{s.full_name}</span>
                          <span className="text-slate-500 ml-2">
                            {s.subscriber_code} {s.phone ? `- ${s.phone}` : ""}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>

          <div className="col-span-6">
            <label className="text-xs text-slate-500">Complaint Category</label>
            <select
              className="form-select box mt-1 w-full"
              value={form.category || categories[0]?.name || ""}
              onChange={(e) => {
                const c = categories.find((x) => x.name === e.target.value);
                setForm((p) => ({
                  ...p,
                  category: e.target.value,
                  priority: c?.default_priority || p.priority,
                }));
              }}
            >
              {categories.map(({ name: c }) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>
          <div className="col-span-6">
            <label className="text-xs text-slate-500">Priority</label>
            <select className="form-select box mt-1 w-full" value={form.priority} onChange={set("priority")}>
              {PRIORITY_OPTIONS.map((p) => (
                <option key={p} value={p}>{titleCase(p)}</option>
              ))}
            </select>
          </div>
          <div className="col-span-6">
            <label className="text-xs text-slate-500">Assign Technician (optional)</label>
            <select className="form-select box mt-1 w-full" value={form.assigned_to} onChange={set("assigned_to")}>
              <option value="">Unassigned</option>
              {employees.map((e) => (
                <option key={e.id} value={e.id}>{e.full_name}</option>
              ))}
            </select>
          </div>
          <div className="col-span-6">
            <label className="text-xs text-slate-500">Due Date (optional)</label>
            <input type="datetime-local" className="form-control box mt-1 w-full" value={form.due_at} onChange={set("due_at")} />
          </div>
          <div className="col-span-12">
            <label className="text-xs text-slate-500">Complaint Description</label>
            <textarea
              className="form-control box mt-1 w-full"
              rows={3}
              placeholder="Describe the customer's complaint"
              value={form.description}
              onChange={set("description")}
            ></textarea>
          </div>
        </div>

        <div className="flex justify-end gap-2 mt-6">
          <button type="button" onClick={onClose} className="btn btn-outline-secondary">Cancel</button>
          <button type="button" onClick={submit} disabled={saving} className="btn btn-primary shadow-md">
            {saving ? "Creating..." : "Create Ticket"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default NewTicketModal;
