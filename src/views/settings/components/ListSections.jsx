import { Lucide } from "@/base-components";
import classnames from "classnames";
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { friendlyError } from "@/lib/errors";
import { formatDateTime, titleCase } from "@/lib/format";

function Box({ title, children, actions }) {
  return (
    <div className="intro-y box p-5">
      <div className="flex items-center mb-4">
        <div className="text-base font-medium">{title}</div>
        <div className="ml-auto">{actions}</div>
      </div>
      {children}
    </div>
  );
}

function Err({ text, onClose }) {
  if (!text) return null;
  return (
    <div className="alert alert-danger show flex items-center mb-4 text-sm">
      <span>{text}</span>
      <button type="button" className="ml-auto" onClick={onClose}>
        <Lucide icon="X" className="w-4 h-4" />
      </button>
    </div>
  );
}

function SmallModal({ title, onClose, onSave, saving, children }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60" onClick={() => !saving && onClose()}></div>
      <div className="relative box w-full max-w-lg p-6 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center mb-5">
          <h2 className="text-lg font-medium">{title}</h2>
          <button type="button" onClick={onClose} className="ml-auto text-slate-500" aria-label="Close">
            <Lucide icon="X" className="w-5 h-5" />
          </button>
        </div>
        <div className="grid grid-cols-12 gap-4">{children}</div>
        <div className="flex justify-end gap-2 mt-6">
          <button type="button" className="btn btn-outline-secondary" disabled={saving} onClick={onClose}>Cancel</button>
          <button type="button" className="btn btn-primary shadow-md" disabled={saving} onClick={onSave}>
            {saving ? "Saving..." : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}

function Input({ label, span = "col-span-12", value, onChange, type = "text" }) {
  return (
    <div className={span}>
      <label className="text-xs text-slate-500">{label}</label>
      <input type={type} className="form-control box mt-1 w-full" value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}

// ---------------------------------------------------------------------
// Areas
// ---------------------------------------------------------------------
export function AreasSection({ canEdit }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [modal, setModal] = useState(null); // { id?, name, city }
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error: err } = await supabase.from("areas").select("id,name,city").order("name");
    if (err) setError(friendlyError(err));
    setRows(data || []);
    setLoading(false);
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  const save = async () => {
    if (!modal.name.trim()) return setError("Area name is required.");
    setSaving(true);
    setError("");
    const payload = { name: modal.name.trim(), city: modal.city.trim() || null };
    const { error: err } = modal.id
      ? await supabase.from("areas").update(payload).eq("id", modal.id)
      : await supabase.from("areas").insert(payload);
    setSaving(false);
    if (err) return setError(friendlyError(err));
    setModal(null);
    load();
  };

  const remove = async (a) => {
    if (!window.confirm(`Delete area "${a.name}"? Subscribers in it keep working but lose their area.`)) return;
    setError("");
    const { error: err } = await supabase.from("areas").delete().eq("id", a.id);
    if (err) return setError(friendlyError(err));
    load();
  };

  return (
    <Box
      title="Service Areas"
      actions={
        canEdit && (
          <button type="button" className="btn btn-primary shadow-md" onClick={() => setModal({ name: "", city: "" })}>
            <Lucide icon="Plus" className="w-4 h-4 mr-2" /> Add Area
          </button>
        )
      }
    >
      <Err text={error} onClose={() => setError("")} />
      {loading ? (
        <div className="text-slate-500 text-sm">Loading areas...</div>
      ) : rows.length === 0 ? (
        <div className="text-slate-500 text-sm">No areas defined yet.</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="table w-full">
            <thead>
              <tr>
                <th>AREA</th>
                <th>CITY</th>
                {canEdit && <th className="text-center">ACTIONS</th>}
              </tr>
            </thead>
            <tbody>
              {rows.map((a) => (
                <tr key={a.id}>
                  <td className="font-medium">{a.name}</td>
                  <td>{a.city || "—"}</td>
                  {canEdit && (
                    <td className="text-center whitespace-nowrap">
                      <button type="button" className="mr-3 text-slate-500 hover:text-primary" onClick={() => setModal({ id: a.id, name: a.name, city: a.city || "" })}>
                        <Lucide icon="Edit" className="w-4 h-4" />
                      </button>
                      <button type="button" className="text-slate-500 hover:text-danger" onClick={() => remove(a)}>
                        <Lucide icon="Trash2" className="w-4 h-4" />
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {modal && (
        <SmallModal title={modal.id ? "Edit Area" : "Add Area"} onClose={() => setModal(null)} onSave={save} saving={saving}>
          <Input label="Area name" value={modal.name} onChange={(v) => setModal({ ...modal, name: v })} />
          <Input label="City" value={modal.city} onChange={(v) => setModal({ ...modal, city: v })} />
        </SmallModal>
      )}
    </Box>
  );
}

// ---------------------------------------------------------------------
// Branches
// ---------------------------------------------------------------------
const EMPTY_BRANCH = { name: "", address: "", city: "", phone: "", email: "", manager_id: "", status: "active" };

export function BranchesSection({ canEdit }) {
  const [rows, setRows] = useState([]);
  const [counts, setCounts] = useState({});
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [modal, setModal] = useState(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const [b, e] = await Promise.all([
      supabase.from("branches").select("*").order("is_main", { ascending: false }).order("name"),
      supabase.from("employees").select("id,full_name").order("full_name"),
    ]);
    if (b.error) setError(friendlyError(b.error));
    const list = b.data || [];
    setRows(list);
    setEmployees(e.data || []);
    const entries = await Promise.all(
      list.map(async (br) => {
        const { count } = await supabase
          .from("subscribers")
          .select("id", { count: "exact", head: true })
          .eq("branch_id", br.id);
        return [br.id, count || 0];
      })
    );
    setCounts(Object.fromEntries(entries));
    setLoading(false);
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  const save = async () => {
    if (!modal.name.trim()) return setError("Branch name is required.");
    setSaving(true);
    setError("");
    const payload = {
      name: modal.name.trim(),
      address: modal.address.trim() || null,
      city: modal.city.trim() || null,
      phone: modal.phone.trim() || null,
      email: modal.email.trim() || null,
      manager_id: modal.manager_id || null,
      status: modal.is_main ? "active" : modal.status,
    };
    const { error: err } = modal.id
      ? await supabase.from("branches").update(payload).eq("id", modal.id)
      : await supabase.from("branches").insert(payload);
    setSaving(false);
    if (err) return setError(friendlyError(err));
    setModal(null);
    load();
  };

  const toggle = async (b) => {
    setError("");
    const { error: err } = await supabase
      .from("branches")
      .update({ status: b.status === "active" ? "inactive" : "active" })
      .eq("id", b.id);
    if (err) return setError(friendlyError(err));
    load();
  };

  const remove = async (b) => {
    if (!window.confirm(`Delete branch "${b.name}"?`)) return;
    setError("");
    const { error: err } = await supabase.from("branches").delete().eq("id", b.id);
    if (err) return setError(friendlyError(err));
    load();
  };

  const managerName = (id) => employees.find((e) => e.id === id)?.full_name || "—";
  const set = (k, v) => setModal((m) => ({ ...m, [k]: v }));

  return (
    <Box
      title="Branches"
      actions={
        canEdit && (
          <button type="button" className="btn btn-primary shadow-md" onClick={() => setModal({ ...EMPTY_BRANCH })}>
            <Lucide icon="Plus" className="w-4 h-4 mr-2" /> Add Branch
          </button>
        )
      }
    >
      <Err text={error} onClose={() => setError("")} />
      {loading ? (
        <div className="text-slate-500 text-sm">Loading branches...</div>
      ) : rows.length === 0 ? (
        <div className="text-slate-500 text-sm">No branches yet.</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="table w-full min-w-[800px]">
            <thead>
              <tr>
                <th>CODE</th>
                <th>BRANCH</th>
                <th>CITY</th>
                <th>PHONE</th>
                <th>MANAGER</th>
                <th className="text-right">SUBSCRIBERS</th>
                <th className="text-center">STATUS</th>
                {canEdit && <th className="text-center">ACTIONS</th>}
              </tr>
            </thead>
            <tbody>
              {rows.map((b) => (
                <tr key={b.id}>
                  <td className="whitespace-nowrap">{b.branch_code}</td>
                  <td className="font-medium">
                    {b.name}
                    {b.is_main && <span className="ml-2 text-xs text-primary">Main</span>}
                  </td>
                  <td>{b.city || "—"}</td>
                  <td className="whitespace-nowrap">{b.phone || "—"}</td>
                  <td>{managerName(b.manager_id)}</td>
                  <td className="text-right">{counts[b.id] ?? 0}</td>
                  <td className="text-center">
                    <span className={classnames("py-1 px-2 rounded-full text-xs font-medium", b.status === "active" ? "bg-success/20 text-success" : "bg-slate-200 text-slate-500 dark:bg-darkmode-300")}>
                      {titleCase(b.status)}
                    </span>
                  </td>
                  {canEdit && (
                    <td className="text-center whitespace-nowrap">
                      <button type="button" title="Edit" className="mr-3 text-slate-500 hover:text-primary" onClick={() => setModal({ ...EMPTY_BRANCH, ...Object.fromEntries(Object.entries(b).map(([k, v]) => [k, v ?? ""])) })}>
                        <Lucide icon="Edit" className="w-4 h-4" />
                      </button>
                      {!b.is_main && (
                        <>
                          <button type="button" title={b.status === "active" ? "Deactivate" : "Activate"} className="mr-3 text-slate-500 hover:text-primary" onClick={() => toggle(b)}>
                            <Lucide icon="Power" className="w-4 h-4" />
                          </button>
                          <button type="button" title="Delete" className="text-slate-500 hover:text-danger" onClick={() => remove(b)}>
                            <Lucide icon="Trash2" className="w-4 h-4" />
                          </button>
                        </>
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {modal && (
        <SmallModal title={modal.id ? "Edit Branch" : "Add Branch"} onClose={() => setModal(null)} onSave={save} saving={saving}>
          <Input label="Branch name" value={modal.name} onChange={(v) => set("name", v)} />
          <Input label="Address" value={modal.address} onChange={(v) => set("address", v)} />
          <Input label="City" span="col-span-6" value={modal.city} onChange={(v) => set("city", v)} />
          <Input label="Phone" span="col-span-6" value={modal.phone} onChange={(v) => set("phone", v)} />
          <Input label="Email" type="email" value={modal.email} onChange={(v) => set("email", v)} />
          <div className="col-span-12">
            <label className="text-xs text-slate-500">Manager</label>
            <select className="form-select box mt-1 w-full" value={modal.manager_id} onChange={(e) => set("manager_id", e.target.value)}>
              <option value="">No manager</option>
              {employees.map((e) => (
                <option key={e.id} value={e.id}>{e.full_name}</option>
              ))}
            </select>
          </div>
          {!modal.is_main && (
            <div className="col-span-12">
              <label className="text-xs text-slate-500">Status</label>
              <select className="form-select box mt-1 w-full" value={modal.status} onChange={(e) => set("status", e.target.value)}>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
            </div>
          )}
          {modal.is_main && <div className="col-span-12 text-xs text-slate-500">The main branch can be renamed but not deleted or deactivated.</div>}
        </SmallModal>
      )}
    </Box>
  );
}

// ---------------------------------------------------------------------
// Last 20 notification log rows (ISP admin only - RLS enforces it)
// ---------------------------------------------------------------------
export function NotificationLogs({ refreshKey }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    (async () => {
      setLoading(true);
      const { data, error: err } = await supabase
        .from("notification_logs")
        .select("id, channel, recipient, subject, status, error, created_at")
        .order("created_at", { ascending: false })
        .limit(20);
      if (err) setError(friendlyError(err));
      setRows(data || []);
      setLoading(false);
    })();
  }, [refreshKey]);

  return (
    <Box title="Recent e-mail log (last 20)">
      <Err text={error} onClose={() => setError("")} />
      {loading ? (
        <div className="text-slate-500 text-sm">Loading...</div>
      ) : rows.length === 0 ? (
        <div className="text-slate-500 text-sm">No e-mails have been sent yet.</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="table w-full text-sm min-w-[700px]">
            <thead>
              <tr>
                <th>DATE</th>
                <th>TO</th>
                <th>SUBJECT</th>
                <th>STATUS</th>
                <th>ERROR</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((l) => (
                <tr key={l.id}>
                  <td className="whitespace-nowrap">{formatDateTime(l.created_at)}</td>
                  <td>{l.recipient}</td>
                  <td>{l.subject || "—"}</td>
                  <td>
                    <span className={classnames("py-1 px-2 rounded-full text-xs font-medium", l.status === "sent" ? "bg-success/20 text-success" : l.status === "failed" ? "bg-danger/20 text-danger" : "bg-slate-200 text-slate-500")}>
                      {titleCase(l.status)}
                    </span>
                  </td>
                  <td className="text-danger">{l.error || ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Box>
  );
}
