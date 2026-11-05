import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { friendlyError } from "@/lib/errors";
import { titleCase } from "@/lib/format";

const ORDER = ["critical", "high", "medium", "low"];
const PRIORITIES = ["low", "medium", "high", "critical"];

const human = (m) => {
  const n = Number(m) || 0;
  const h = Math.floor(n / 60);
  const mm = n % 60;
  return h ? `${h} h${mm ? ` ${mm} min` : ""}` : `${mm} min`;
};

function SlaPolicies({ canEdit }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      const { data, error: err } = await supabase.from("sla_policies").select("*");
      if (err) setError(friendlyError(err));
      setRows((data || []).sort((a, b) => ORDER.indexOf(a.priority) - ORDER.indexOf(b.priority)));
      setLoading(false);
    })();
  }, []);

  const edit = (id, k, v) => setRows((rs) => rs.map((r) => (r.id === id ? { ...r, [k]: v === "" ? "" : Number(v) } : r)));

  const save = async () => {
    setError("");
    setMsg("");
    for (const r of rows) {
      if (!(r.response_minutes > 0) || !(r.resolution_minutes > 0)) return setError("Minutes must be greater than 0.");
      if (r.resolution_minutes < r.response_minutes) return setError(`${titleCase(r.priority)}: resolution time cannot be shorter than response time.`);
    }
    setSaving(true);
    try {
      for (const r of rows) {
        const { error: err } = await supabase
          .from("sla_policies")
          .update({ response_minutes: r.response_minutes, resolution_minutes: r.resolution_minutes })
          .eq("id", r.id);
        if (err) throw err;
      }
      setMsg("SLA policies saved.");
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="intro-y box p-5">
      <div className="text-base font-medium mb-1">SLA policies</div>
      <div className="text-xs text-slate-500 mb-4">
        Each ticket priority has a target response time and resolution time. When a ticket is breached it is escalated one priority level automatically and the ticket timeline records it.
      </div>
      {error && <div className="alert alert-danger show mb-3 text-sm">{error}</div>}
      {msg && <div className="text-success text-sm mb-3">{msg}</div>}
      {loading ? (
        <div className="text-slate-500 text-sm">Loading...</div>
      ) : rows.length === 0 ? (
        <div className="text-slate-500 text-sm">No SLA policies found.</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="table w-full text-sm min-w-[600px]">
            <thead>
              <tr><th>PRIORITY</th><th>FIRST RESPONSE (MINUTES)</th><th>RESOLUTION (MINUTES)</th></tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td className="font-medium">{titleCase(r.priority)}</td>
                  <td>
                    <input type="number" min="1" className="form-control box w-40 inline-block" disabled={!canEdit} value={r.response_minutes} onChange={(e) => edit(r.id, "response_minutes", e.target.value)} />
                    <span className="ml-2 text-xs text-slate-500">{human(r.response_minutes)}</span>
                  </td>
                  <td>
                    <input type="number" min="1" className="form-control box w-40 inline-block" disabled={!canEdit} value={r.resolution_minutes} onChange={(e) => edit(r.id, "resolution_minutes", e.target.value)} />
                    <span className="ml-2 text-xs text-slate-500">{human(r.resolution_minutes)}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {canEdit && rows.length > 0 && (
        <div className="flex justify-end mt-4">
          <button type="button" className="btn btn-primary shadow-md" disabled={saving} onClick={save}>{saving ? "Saving..." : "Save SLA policies"}</button>
        </div>
      )}
    </div>
  );
}

function Categories({ canEdit }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [name, setName] = useState("");
  const [prio, setPrio] = useState("medium");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const { data, error: err } = await supabase.from("ticket_categories").select("*").order("name");
    if (err) setError(friendlyError(err));
    setRows(data || []);
    setLoading(false);
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  const patch = async (id, values) => {
    setError("");
    const { error: err } = await supabase.from("ticket_categories").update(values).eq("id", id);
    if (err) return setError(friendlyError(err));
    load();
  };

  const rename = (c) => {
    const n = window.prompt("Category name", c.name);
    if (n && n.trim() && n.trim() !== c.name) patch(c.id, { name: n.trim() });
  };

  const add = async () => {
    if (!name.trim()) return setError("Enter a category name.");
    setBusy(true);
    setError("");
    const { error: err } = await supabase.from("ticket_categories").insert({ name: name.trim(), default_priority: prio });
    setBusy(false);
    if (err) return setError(friendlyError(err));
    setName("");
    load();
  };

  const remove = async (c) => {
    if (!window.confirm(`Delete category "${c.name}"?`)) return;
    setError("");
    const { error: err } = await supabase.from("ticket_categories").delete().eq("id", c.id);
    if (err) setError(friendlyError(err));
    load();
  };

  return (
    <div className="intro-y box p-5">
      <div className="text-base font-medium mb-4">Ticket categories</div>
      {error && <div className="alert alert-danger show mb-3 text-sm">{error}</div>}
      {canEdit && (
        <div className="flex flex-wrap gap-2 mb-4">
          <input className="form-control box w-60" placeholder="New category name" value={name} onChange={(e) => setName(e.target.value)} />
          <select className="form-select box w-40" value={prio} onChange={(e) => setPrio(e.target.value)}>
            {PRIORITIES.map((p) => <option key={p} value={p}>{titleCase(p)}</option>)}
          </select>
          <button type="button" className="btn btn-primary" disabled={busy} onClick={add}>Add</button>
        </div>
      )}
      {loading ? (
        <div className="text-slate-500 text-sm">Loading...</div>
      ) : rows.length === 0 ? (
        <div className="text-slate-500 text-sm">No categories yet.</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="table w-full text-sm">
            <thead>
              <tr><th>CATEGORY</th><th>DEFAULT PRIORITY</th><th>ACTIVE</th>{canEdit && <th className="text-center">ACTIONS</th>}</tr>
            </thead>
            <tbody>
              {rows.map((c) => (
                <tr key={c.id}>
                  <td className="font-medium">{c.name}</td>
                  <td>
                    <select className="form-select box w-36" disabled={!canEdit} value={c.default_priority} onChange={(e) => patch(c.id, { default_priority: e.target.value })}>
                      {PRIORITIES.map((p) => <option key={p} value={p}>{titleCase(p)}</option>)}
                    </select>
                  </td>
                  <td>
                    <input type="checkbox" className="form-check-input" disabled={!canEdit} checked={c.is_active} onChange={(e) => patch(c.id, { is_active: e.target.checked })} />
                  </td>
                  {canEdit && (
                    <td className="text-center whitespace-nowrap">
                      <button type="button" className="text-primary text-xs mr-3" onClick={() => rename(c)}>Rename</button>
                      <button type="button" className="text-danger text-xs" onClick={() => remove(c)}>Delete</button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function SupportTab({ canEdit }) {
  return (
    <div className="space-y-6">
      <SlaPolicies canEdit={canEdit} />
      <Categories canEdit={canEdit} />
    </div>
  );
}

export default SupportTab;
