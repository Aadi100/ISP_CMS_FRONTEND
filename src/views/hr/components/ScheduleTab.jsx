import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { friendlyError } from "@/lib/errors";
import { formatDate, titleCase } from "@/lib/format";
import { ErrorBanner, StatusBadge, Empty, Loading, EmployeeSelect } from "./common";

const timeOf = (ts) => (ts ? new Date(ts).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }) : "");
const dayOf = (ts) => (ts ? ts.slice(0, 10) : "");

export default function ScheduleTab({ employees }) {
  const [techId, setTechId] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [group, setGroup] = useState("technician");
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      let q = supabase.from("v_technician_schedule").select("*").order("scheduled_at", { ascending: true, nullsFirst: false }).limit(1000);
      if (techId) q = q.eq("technician_id", techId);
      if (from) q = q.gte("scheduled_at", new Date(`${from}T00:00:00`).toISOString());
      if (to) q = q.lte("scheduled_at", new Date(`${to}T23:59:59`).toISOString());
      const { data, error: err } = await q;
      if (!alive) return;
      setError(err ? friendlyError(err) : "");
      setRows(data || []);
      setLoading(false);
    })();
    return () => {
      alive = false;
    };
  }, [techId, from, to]);

  const groups = useMemo(() => {
    const map = new Map();
    rows.forEach((r) => {
      const key = group === "technician" ? r.technician_name || "Unassigned" : dayOf(r.scheduled_at) || "Not scheduled";
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(r);
    });
    return [...map.entries()];
  }, [rows, group]);

  return (
    <div>
      <div className="box p-5 flex flex-wrap items-end gap-3">
        <div>
          <label className="form-label">Technician</label>
          <EmployeeSelect className="form-select w-52" employees={employees} value={techId} onChange={setTechId} allLabel="All technicians" />
        </div>
        <div>
          <label className="form-label">From</label>
          <input type="date" className="form-control" value={from} onChange={(e) => setFrom(e.target.value)} />
        </div>
        <div>
          <label className="form-label">To</label>
          <input type="date" className="form-control" value={to} onChange={(e) => setTo(e.target.value)} />
        </div>
        <div className="ml-auto">
          <label className="form-label">Group by</label>
          <select className="form-select w-40" value={group} onChange={(e) => setGroup(e.target.value)}>
            <option value="technician">Technician</option>
            <option value="day">Day</option>
          </select>
        </div>
      </div>
      <div className="mt-4">
        <ErrorBanner message={error} onClose={() => setError("")} />
        {loading ? (
          <Loading />
        ) : groups.length === 0 ? (
          <div className="box"><Empty>No open installations or assigned tickets for this selection.</Empty></div>
        ) : (
          groups.map(([key, items]) => (
            <div key={key} className="box p-5 mb-4">
              <h3 className="font-medium mb-3">
                {group === "day" && key !== "Not scheduled" ? formatDate(key) : key}
                <span className="text-slate-500 text-xs font-normal ml-2">{items.length} job(s)</span>
              </h3>
              <div className="overflow-x-auto">
                <table className="table table-report -mt-2">
                  <thead>
                    <tr>
                      <th>Type</th><th>Ref</th><th>Job</th>
                      <th>{group === "technician" ? "When" : "Technician"}</th>
                      <th>Status</th><th>Address</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((r) => (
                      <tr key={`${r.kind}-${r.ref_id}`} className="intro-x">
                        <td>{titleCase(r.kind)}</td>
                        <td className="font-medium whitespace-nowrap">{r.ref_number}</td>
                        <td>{r.title}</td>
                        <td className="whitespace-nowrap">
                          {group === "technician"
                            ? r.scheduled_at ? `${formatDate(r.scheduled_at)} ${timeOf(r.scheduled_at)}` : "Not scheduled"
                            : `${r.technician_name || "Unassigned"}${r.scheduled_at ? ` - ${timeOf(r.scheduled_at)}` : ""}`}
                        </td>
                        <td><StatusBadge status={r.status} /></td>
                        <td className="text-xs text-slate-500 max-w-xs">{r.address}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
