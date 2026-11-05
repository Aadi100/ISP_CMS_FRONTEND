import classnames from "classnames";
import { useEffect, useState } from "react";
import { Lucide } from "@/base-components";
import { supabase } from "@/lib/supabase";
import { friendlyError } from "@/lib/errors";
import { formatDateTime, titleCase } from "@/lib/format";

const PAGE = 25;
const TABLE_LABELS = {
  subscribers: "Subscribers", invoices: "Invoices", payments: "Payments", refunds: "Refunds",
  packages: "Packages", resellers: "Resellers", reseller_wallet_transactions: "Wallet transactions",
  tickets: "Tickets", employees: "Employees", employee_compensation: "Salaries", profiles: "Users",
  roles: "Roles", areas: "Areas", branches: "Branches", organization_settings: "Settings",
  organizations: "Company", equipment: "Equipment", stock_items: "Stock items",
  stock_movements: "Stock movements", installations: "Installations", saas_invoices: "Platform bills",
  saas_payments: "Platform payments", notification_templates: "E-mail templates",
};
const label = (t) => TABLE_LABELS[t] || titleCase(t);
const ACTION_BADGE = {
  INSERT: "bg-success/20 text-success",
  UPDATE: "bg-warning/20 text-warning",
  DELETE: "bg-danger/20 text-danger",
};
const show = (v) => (v === null || v === undefined ? "—" : typeof v === "object" ? JSON.stringify(v) : String(v));
const EMPTY = { table: "", action: "", actor: "", from: "", to: "", record: "" };

function DiffDrawer({ row, onClose }) {
  const o = row.old_data || {};
  const n = row.new_data || {};
  const keys = Array.from(new Set([...Object.keys(o), ...Object.keys(n)])).sort();
  const changed = (k) => JSON.stringify(o[k]) !== JSON.stringify(n[k]);
  const list = row.action === "UPDATE" ? keys : keys;
  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/60" onClick={onClose}></div>
      <div className="relative box w-full max-w-3xl h-full overflow-y-auto p-6 rounded-none">
        <div className="flex items-center mb-4">
          <div>
            <h2 className="text-lg font-medium">{row.action} - {label(row.table_name)}</h2>
            <div className="text-xs text-slate-500">
              {formatDateTime(row.created_at)} by {row.actor_name || row.actor_email || "system"} - record {row.record_id}
            </div>
          </div>
          <button type="button" className="ml-auto text-slate-500" onClick={onClose} aria-label="Close">
            <Lucide icon="X" className="w-5 h-5" />
          </button>
        </div>
        <table className="table w-full text-sm">
          <thead>
            <tr><th>FIELD</th><th>BEFORE</th><th>AFTER</th></tr>
          </thead>
          <tbody>
            {list.map((k) => {
              const c = row.action === "UPDATE" && changed(k);
              return (
                <tr key={k} className={classnames(c && "bg-warning/10")}>
                  <td className={classnames("whitespace-nowrap", c && "font-medium")}>{k}</td>
                  <td className={classnames("break-all", c && "text-danger")}>{show(o[k])}</td>
                  <td className={classnames("break-all", c && "text-success font-medium")}>{show(n[k])}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function AuditTab() {
  const [draft, setDraft] = useState(EMPTY);
  const [f, setF] = useState(EMPTY);
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [detail, setDetail] = useState(null);

  useEffect(() => {
    (async () => {
      setLoading(true);
      setError("");
      let q = supabase.from("v_audit_log").select("*", { count: "exact" });
      if (f.table) q = q.eq("table_name", f.table);
      if (f.action) q = q.eq("action", f.action);
      if (f.actor) {
        const s = f.actor.replace(/[,()%]/g, " ").trim();
        if (s) q = q.or(`actor_name.ilike.%${s}%,actor_email.ilike.%${s}%`);
      }
      if (f.from) q = q.gte("created_at", new Date(`${f.from}T00:00:00`).toISOString());
      if (f.to) q = q.lte("created_at", new Date(`${f.to}T23:59:59`).toISOString());
      if (f.record) q = q.eq("record_id", f.record.trim());
      const from = (page - 1) * PAGE;
      const { data, count, error: err } = await q.order("created_at", { ascending: false }).range(from, from + PAGE - 1);
      if (err) setError(friendlyError(err));
      setRows(data || []);
      setTotal(count || 0);
      setLoading(false);
    })();
  }, [f, page]);

  const pages = Math.max(1, Math.ceil(total / PAGE));
  const set = (k, v) => setDraft((d) => ({ ...d, [k]: v }));
  const tables = Object.keys(TABLE_LABELS).sort((a, b) => label(a).localeCompare(label(b)));

  return (
    <div className="intro-y box p-5">
      <div className="text-base font-medium mb-4">Audit log</div>
      <div className="grid grid-cols-12 gap-3 mb-4">
        <div className="col-span-12 sm:col-span-4 lg:col-span-3">
          <label className="text-xs text-slate-500">Record</label>
          <select className="form-select box mt-1 w-full" value={draft.table} onChange={(e) => set("table", e.target.value)}>
            <option value="">All records</option>
            {tables.map((t) => <option key={t} value={t}>{label(t)}</option>)}
          </select>
        </div>
        <div className="col-span-6 sm:col-span-4 lg:col-span-2">
          <label className="text-xs text-slate-500">Action</label>
          <select className="form-select box mt-1 w-full" value={draft.action} onChange={(e) => set("action", e.target.value)}>
            <option value="">All</option>
            <option value="INSERT">Insert</option>
            <option value="UPDATE">Update</option>
            <option value="DELETE">Delete</option>
          </select>
        </div>
        <div className="col-span-6 sm:col-span-4 lg:col-span-3">
          <label className="text-xs text-slate-500">User (name or e-mail)</label>
          <input className="form-control box mt-1 w-full" value={draft.actor} onChange={(e) => set("actor", e.target.value)} />
        </div>
        <div className="col-span-6 lg:col-span-2">
          <label className="text-xs text-slate-500">From</label>
          <input type="date" className="form-control box mt-1 w-full" value={draft.from} onChange={(e) => set("from", e.target.value)} />
        </div>
        <div className="col-span-6 lg:col-span-2">
          <label className="text-xs text-slate-500">To</label>
          <input type="date" className="form-control box mt-1 w-full" value={draft.to} onChange={(e) => set("to", e.target.value)} />
        </div>
        <div className="col-span-12 sm:col-span-6">
          <label className="text-xs text-slate-500">Record ID (exact)</label>
          <input className="form-control box mt-1 w-full" value={draft.record} onChange={(e) => set("record", e.target.value)} />
        </div>
        <div className="col-span-12 sm:col-span-6 flex items-end gap-2">
          <button type="button" className="btn btn-primary" onClick={() => { setPage(1); setF(draft); }}>Search</button>
          <button type="button" className="btn btn-outline-secondary" onClick={() => { setDraft(EMPTY); setPage(1); setF(EMPTY); }}>Reset</button>
        </div>
      </div>

      {error && <div className="alert alert-danger show mb-3 text-sm">{error}</div>}
      {loading ? (
        <div className="text-slate-500 text-sm">Loading audit log...</div>
      ) : rows.length === 0 ? (
        <div className="text-slate-500 text-sm">No audit entries match.</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="table w-full text-sm min-w-[800px]">
            <thead>
              <tr><th>WHEN</th><th>USER</th><th>ACTION</th><th>RECORD</th><th>ID</th><th></th></tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td className="whitespace-nowrap">{formatDateTime(r.created_at)}</td>
                  <td>{r.actor_name || r.actor_email || "System"}</td>
                  <td><span className={classnames("py-1 px-2 rounded-full text-xs font-medium", ACTION_BADGE[r.action])}>{titleCase(r.action)}</span></td>
                  <td>{label(r.table_name)}</td>
                  <td className="text-xs text-slate-500 max-w-[160px] truncate">{r.record_id}</td>
                  <td><button type="button" className="text-primary text-xs" onClick={() => setDetail(r)}>Details</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="flex items-center mt-3 text-sm text-slate-500">
        <span>{total} entr{total === 1 ? "y" : "ies"} - page {page} of {pages}</span>
        <div className="ml-auto flex gap-2">
          <button type="button" className="btn btn-outline-secondary btn-sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>Prev</button>
          <button type="button" className="btn btn-outline-secondary btn-sm" disabled={page >= pages} onClick={() => setPage(page + 1)}>Next</button>
        </div>
      </div>
      {detail && <DiffDrawer row={detail} onClose={() => setDetail(null)} />}
    </div>
  );
}

export default AuditTab;
