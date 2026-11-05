import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { friendlyError } from "@/lib/errors";
import { formatDateTime, titleCase } from "@/lib/format";
import { ErrorBanner, Pagination } from "../shared";
import AuditDiffDrawer from "./AuditDiffDrawer";

const PAGE_SIZE = 25;

export default function AuditLogTab() {
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [orgs, setOrgs] = useState([]);
  const [orgFilter, setOrgFilter] = useState("all");
  const [action, setAction] = useState("all");
  const [table, setTable] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState(null);

  useEffect(() => {
    supabase
      .from("organizations")
      .select("id, name")
      .order("name")
      .then(({ data }) => setOrgs(data || []));
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      let q = supabase
        .from("v_audit_log")
        .select("*", { count: "exact" })
        .order("created_at", { ascending: false })
        .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1);
      if (orgFilter === "platform") q = q.is("organization_id", null);
      else if (orgFilter !== "all") q = q.eq("organization_id", orgFilter);
      if (action !== "all") q = q.eq("action", action);
      if (table.trim()) q = q.ilike("table_name", `%${table.trim().replace(/[%*]/g, "")}%`);
      if (from) q = q.gte("created_at", new Date(`${from}T00:00:00`).toISOString());
      if (to) q = q.lte("created_at", new Date(`${to}T23:59:59`).toISOString());
      const { data, error: err, count } = await q;
      if (err) throw err;
      setRows(data || []);
      setTotal(count || 0);
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setLoading(false);
    }
  }, [page, orgFilter, action, table, from, to]);

  useEffect(() => {
    load();
  }, [load]);

  const reset = (setter) => (e) => {
    setter(e.target.value);
    setPage(0);
  };

  return (
    <div className="intro-y box p-5">
      <h3 className="text-base font-medium mb-1">Audit log</h3>
      <div className="text-slate-500 text-sm mb-4">Every change made on the platform and in every ISP. Click a row to see what changed.</div>
      <ErrorBanner message={error} onClose={() => setError("")} />

      <div className="grid grid-cols-1 sm:grid-cols-5 gap-3 mb-5">
        <select className="form-select" value={orgFilter} onChange={reset(setOrgFilter)}>
          <option value="all">All ISPs</option>
          <option value="platform">Platform only</option>
          {orgs.map((o) => (
            <option key={o.id} value={o.id}>{o.name}</option>
          ))}
        </select>
        <select className="form-select" value={action} onChange={reset(setAction)}>
          <option value="all">All actions</option>
          <option value="INSERT">Insert</option>
          <option value="UPDATE">Update</option>
          <option value="DELETE">Delete</option>
        </select>
        <input className="form-control" placeholder="Table (e.g. invoices)" value={table} onChange={reset(setTable)} />
        <input type="date" className="form-control" value={from} onChange={reset(setFrom)} title="From" />
        <input type="date" className="form-control" value={to} onChange={reset(setTo)} title="To" />
      </div>

      <div className="overflow-x-auto">
        <table className="table table-report">
          <thead>
            <tr><th>WHEN</th><th>ISP</th><th>WHO</th><th>ACTION</th><th>TABLE</th><th></th></tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan="6" className="text-center">Loading audit log...</td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan="6" className="text-center">No audit events match.</td></tr>
            ) : (
              rows.map((r) => (
                <tr key={r.id} className="cursor-pointer" onClick={() => setSelected(r)}>
                  <td>{formatDateTime(r.created_at)}</td>
                  <td>{r.organization_name || "Platform"}</td>
                  <td>{r.actor_name || r.actor_email || "System"}</td>
                  <td>{r.action}</td>
                  <td>{titleCase(r.table_name)}</td>
                  <td><button className="btn btn-sm btn-outline-secondary" onClick={() => setSelected(r)}>Diff</button></td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      <Pagination page={page} pageSize={PAGE_SIZE} total={total} onPage={setPage} />
      {selected && <AuditDiffDrawer entry={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}
