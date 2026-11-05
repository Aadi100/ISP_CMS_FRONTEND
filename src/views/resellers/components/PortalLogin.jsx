import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { friendlyError } from "@/lib/errors";
import { titleCase } from "@/lib/format";

function PortalLogin({ reseller, canInvite }) {
  const [logins, setLogins] = useState([]);
  const [roleId, setRoleId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState(reseller.email || "");
  const [name, setName] = useState(reseller.owner_name || reseller.name || "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    const [p, r] = await Promise.all([
      supabase.from("profiles").select("id, full_name, email, status").eq("reseller_id", reseller.id),
      supabase.from("roles").select("id").eq("name", "Reseller").limit(1),
    ]);
    setLogins(p.data || []);
    setRoleId(r.data?.[0]?.id || null);
    setLoading(false);
  }, [reseller.id]);

  useEffect(() => {
    load();
  }, [load]);

  const create = async () => {
    setError("");
    setMsg("");
    if (!email.trim() || !name.trim()) return setError("Name and e-mail are required.");
    if (!roleId) return setError('The "Reseller" role was not found for your ISP.');
    setBusy(true);
    try {
      const { error: err } = await supabase.functions.invoke("invite-employee", {
        body: { email: email.trim(), full_name: name.trim(), role: "isp_staff", role_id: roleId, reseller_id: reseller.id },
      });
      if (err) {
        let detail = err.message;
        try {
          const b = await err.context?.json?.();
          if (b?.error) detail = b.error;
        } catch (_) { /* ignore */ }
        throw new Error(detail);
      }
      setMsg("Portal login created. The reseller will receive an invitation.");
      setOpen(false);
      load();
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mt-5 border border-slate-200/60 dark:border-darkmode-400 rounded-md p-4">
      <div className="font-medium text-sm mb-1">Portal login</div>
      <div className="text-xs text-slate-500 mb-3">
        A portal login lets the reseller sign in and see only this reseller's own wallet and customers, their invoices and payments. It cannot see any other part of your ISP.
      </div>
      {error && <div className="alert alert-danger show mb-2 text-sm">{error}</div>}
      {msg && <div className="text-success text-sm mb-2">{msg}</div>}
      {loading ? (
        <div className="text-slate-500 text-sm">Loading...</div>
      ) : logins.length > 0 ? (
        <ul className="text-sm space-y-1">
          {logins.map((l) => (
            <li key={l.id}>
              <span className="font-medium">{l.full_name || "—"}</span> - {l.email} ({titleCase(l.status)})
            </li>
          ))}
        </ul>
      ) : (
        <div className="text-slate-500 text-sm">No portal login yet.</div>
      )}
      {canInvite && !loading && !open && (
        <button type="button" className="btn btn-outline-secondary btn-sm mt-3" onClick={() => setOpen(true)}>
          Create portal login
        </button>
      )}
      {open && (
        <div className="grid grid-cols-12 gap-3 mt-3">
          <div className="col-span-12 sm:col-span-6">
            <label className="text-xs text-slate-500">Full name</label>
            <input className="form-control box mt-1 w-full" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="col-span-12 sm:col-span-6">
            <label className="text-xs text-slate-500">E-mail</label>
            <input type="email" className="form-control box mt-1 w-full" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div className="col-span-12 flex gap-2">
            <button type="button" className="btn btn-primary btn-sm" disabled={busy} onClick={create}>{busy ? "Creating..." : "Create"}</button>
            <button type="button" className="btn btn-outline-secondary btn-sm" disabled={busy} onClick={() => setOpen(false)}>Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
}

export default PortalLogin;
