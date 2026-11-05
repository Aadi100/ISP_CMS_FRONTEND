import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { friendlyError } from "@/lib/errors";
import { money, titleCase } from "@/lib/format";
import { ErrorBanner, Pagination, likeSafe } from "@/views/payments/components/shared";

export default function AssignTab({ collectors, canEdit, onToast, onChanged }) {
  const [collector, setCollector] = useState("");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [area, setArea] = useState("");
  const [owing, setOwing] = useState(false);
  const [unassigned, setUnassigned] = useState(false);
  const [areas, setAreas] = useState([]);
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(25);
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState(() => new Set());
  const [saving, setSaving] = useState(false);

  const names = {};
  collectors.forEach((c) => (names[c.collector_id] = c.full_name));

  useEffect(() => {
    supabase
      .from("areas")
      .select("id,name")
      .order("name")
      .then(({ data }) => setAreas(data || []));
  }, []);

  const filtered = useCallback(
    (q) => {
      const s = likeSafe(search);
      if (s) q = q.or(`full_name.ilike.%${s}%,phone.ilike.%${s}%,subscriber_code.ilike.%${s}%`);
      if (status) q = q.eq("connection_status", status);
      if (area) q = q.eq("area_id", area);
      if (owing) q = q.gt("outstanding_balance", 0);
      if (unassigned) q = q.is("collector_id", null);
      return q;
    },
    [search, status, area, owing, unassigned]
  );

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data, count, error: err } = await filtered(
        supabase
          .from("v_subscriber_overview")
          .select("id,subscriber_code,full_name,phone,area_name,connection_status,outstanding_balance,collector_id", {
            count: "exact",
          })
      )
        .order("full_name")
        .order("id")
        .range(page * pageSize, page * pageSize + pageSize - 1);
      if (err) throw err;
      setRows(data || []);
      setTotal(count || 0);
      setError("");
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setLoading(false);
    }
  }, [filtered, page, pageSize]);

  useEffect(() => {
    const t = setTimeout(load, 250);
    return () => clearTimeout(t);
  }, [load]);

  useEffect(() => setPage(0), [search, status, area, owing, unassigned, pageSize]);

  const toggle = (id) =>
    setSelected((prev) => {
      const n = new Set(prev);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  const pageAll = rows.length > 0 && rows.every((r) => selected.has(r.id));
  const togglePage = () =>
    setSelected((prev) => {
      const n = new Set(prev);
      rows.forEach((r) => (pageAll ? n.delete(r.id) : n.add(r.id)));
      return n;
    });

  const selectAllMatching = async () => {
    try {
      const { data, error: err } = await filtered(supabase.from("v_subscriber_overview").select("id"))
        .order("id")
        .range(0, 499);
      if (err) throw err;
      setSelected(new Set((data || []).map((r) => r.id)));
      if (total > 500) onToast(`Selected the first 500 of ${total} matching customers.`);
    } catch (e) {
      setError(friendlyError(e));
    }
  };

  const assign = async (target) => {
    if (selected.size === 0) return;
    setSaving(true);
    try {
      const { error: err } = await supabase.rpc("assign_collector", {
        p_subscriber_ids: Array.from(selected),
        p_collector: target,
      });
      if (err) throw err;
      onToast(target ? `${selected.size} customer(s) assigned.` : `${selected.size} customer(s) unassigned.`);
      setSelected(new Set());
      setError("");
      await load();
      onChanged();
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="box p-5">
      <ErrorBanner message={error} onClose={() => setError("")} />
      <div className="flex flex-wrap gap-2 mb-3">
        <input
          className="form-control w-64"
          placeholder="Search name, phone, code"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select className="form-select w-40" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">All statuses</option>
          {["active", "pending", "suspended", "terminated"].map((s) => (
            <option key={s} value={s}>
              {titleCase(s)}
            </option>
          ))}
        </select>
        <select className="form-select w-44" value={area} onChange={(e) => setArea(e.target.value)}>
          <option value="">All areas</option>
          {areas.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" className="form-check-input" checked={owing} onChange={(e) => setOwing(e.target.checked)} />
          Outstanding &gt; 0
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            className="form-check-input"
            checked={unassigned}
            onChange={(e) => setUnassigned(e.target.checked)}
          />
          Unassigned only
        </label>
      </div>

      {canEdit && (
        <div className="flex flex-wrap items-center gap-2 mb-3 p-3 bg-slate-100 dark:bg-darkmode-400 rounded-md">
          <span className="text-sm font-medium">{selected.size} selected</span>
          <button type="button" className="btn btn-outline-secondary btn-sm" onClick={selectAllMatching} disabled={total === 0}>
            Select all matching (max 500)
          </button>
          {selected.size > 0 && (
            <button type="button" className="btn btn-outline-secondary btn-sm" onClick={() => setSelected(new Set())}>
              Clear
            </button>
          )}
          <select className="form-select w-56 ml-auto" value={collector} onChange={(e) => setCollector(e.target.value)}>
            <option value="">Choose collector...</option>
            {collectors.map((c) => (
              <option key={c.collector_id} value={c.collector_id}>
                {c.full_name}
              </option>
            ))}
          </select>
          <button
            type="button"
            className="btn btn-primary"
            disabled={saving || !collector || selected.size === 0}
            onClick={() => assign(collector)}
          >
            {saving ? "Saving..." : "Assign"}
          </button>
          <button
            type="button"
            className="btn btn-outline-danger"
            disabled={saving || selected.size === 0}
            onClick={() => assign(null)}
          >
            Unassign
          </button>
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="table table-report">
          <thead>
            <tr>
              <th className="w-10">
                <input type="checkbox" className="form-check-input" checked={pageAll} onChange={togglePage} />
              </th>
              <th>Customer</th>
              <th>Area</th>
              <th>Status</th>
              <th className="text-right">Outstanding</th>
              <th>Collector</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={6} className="text-center text-slate-500 py-8">
                  Loading...
                </td>
              </tr>
            )}
            {!loading && rows.length === 0 && (
              <tr>
                <td colSpan={6} className="text-center text-slate-500 py-8">
                  No customers match these filters.
                </td>
              </tr>
            )}
            {rows.map((r) => (
              <tr key={r.id}>
                <td>
                  <input type="checkbox" className="form-check-input" checked={selected.has(r.id)} onChange={() => toggle(r.id)} />
                </td>
                <td>
                  <div className="font-medium whitespace-nowrap">{r.full_name}</div>
                  <div className="text-slate-500 text-xs">
                    {r.subscriber_code} - {r.phone}
                  </div>
                </td>
                <td>{r.area_name || "-"}</td>
                <td>{titleCase(r.connection_status)}</td>
                <td className="text-right">{money(r.outstanding_balance)}</td>
                <td>{r.collector_id ? names[r.collector_id] || "Unknown" : <span className="text-slate-400">Unassigned</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Pagination page={page} pageSize={pageSize} total={total} onPage={setPage} onPageSize={setPageSize} />
    </div>
  );
}
