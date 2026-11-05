import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { friendlyError } from "@/lib/errors";
import { titleCase } from "@/lib/format";
import {
  ErrorBanner,
  useToast,
  todayISO,
  EmployeeSelect,
  Empty,
  Loading,
  currentMonth,
  monthStart,
  monthLabel,
} from "./common";

const STATUSES = ["present", "absent", "late", "half_day", "leave", "holiday"];

const toTime = (ts) => {
  if (!ts) return "";
  const d = new Date(ts);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
};
const toTs = (date, time) => (time ? new Date(`${date}T${time}:00`).toISOString() : null);

function DailyMarking({ employees, perms }) {
  const [date, setDate] = useState(todayISO());
  const [rows, setRows] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const toast = useToast();
  const canWrite = perms.create && perms.edit;

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    const { data, error: err } = await supabase.from("attendance").select("*").eq("work_date", date);
    if (err) setError(friendlyError(err));
    const map = {};
    (data || []).forEach((a) => {
      map[a.employee_id] = {
        status: a.status,
        check_in: toTime(a.check_in),
        check_out: toTime(a.check_out),
        is_unpaid: a.is_unpaid,
        notes: a.notes || "",
        dirty: false,
      };
    });
    setRows(map);
    setLoading(false);
  }, [date]);

  useEffect(() => {
    load();
  }, [load]);

  const patch = (id, p) =>
    setRows((r) => ({
      ...r,
      [id]: { status: "", check_in: "", check_out: "", is_unpaid: false, notes: "", ...r[id], ...p, dirty: true },
    }));

  const markAll = (status) =>
    setRows((r) => {
      const next = { ...r };
      employees.forEach((e) => {
        if (!next[e.id]?.status)
          next[e.id] = { check_in: "", check_out: "", is_unpaid: false, notes: "", ...next[e.id], status, dirty: true };
      });
      return next;
    });

  const save = async () => {
    const payload = Object.entries(rows)
      .filter(([, v]) => v.dirty && v.status)
      .map(([employee_id, v]) => ({
        employee_id,
        work_date: date,
        status: v.status,
        check_in: toTs(date, v.check_in),
        check_out: toTs(date, v.check_out),
        is_unpaid: v.status === "absent" || v.status === "leave" ? Boolean(v.is_unpaid) : false,
        notes: v.notes?.trim() || null,
      }));
    if (!payload.length) {
      toast.show("Nothing to save.", "error");
      return;
    }
    setSaving(true);
    setError("");
    const { error: err } = await supabase.from("attendance").upsert(payload, { onConflict: "employee_id,work_date" });
    setSaving(false);
    if (err) return setError(friendlyError(err));
    toast.show(`Attendance saved for ${payload.length} employee(s).`);
    load();
  };

  return (
    <div className="box p-5">
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <h3 className="font-medium text-base">Daily attendance</h3>
        <input type="date" className="form-control w-44" value={date} onChange={(e) => e.target.value && setDate(e.target.value)} />
        {canWrite && (
          <>
            <button type="button" className="btn btn-outline-secondary" onClick={() => markAll("present")}>
              Mark unmarked as present
            </button>
            <button type="button" className="btn btn-primary ml-auto" disabled={saving} onClick={save}>
              {saving ? "Saving..." : "Save attendance"}
            </button>
          </>
        )}
      </div>
      <ErrorBanner message={error} onClose={() => setError("")} />
      {loading ? (
        <Loading />
      ) : employees.length === 0 ? (
        <Empty>No employees yet. Add employees first.</Empty>
      ) : (
        <div className="overflow-x-auto">
          <table className="table table-report -mt-2">
            <thead>
              <tr>
                <th className="whitespace-nowrap">Employee</th>
                <th>Status</th>
                <th>Check-in</th>
                <th>Check-out</th>
                <th>Unpaid</th>
                <th>Notes</th>
              </tr>
            </thead>
            <tbody>
              {employees.map((e) => {
                const r = rows[e.id] || {};
                return (
                  <tr key={e.id} className="intro-x">
                    <td className="whitespace-nowrap">
                      <div className="font-medium">{e.full_name}</div>
                      <div className="text-slate-500 text-xs">{e.employee_code}</div>
                    </td>
                    <td>
                      <select
                        className="form-select w-32"
                        disabled={!canWrite}
                        value={r.status || ""}
                        onChange={(ev) => patch(e.id, { status: ev.target.value })}
                      >
                        <option value="">Not marked</option>
                        {STATUSES.map((s) => (
                          <option key={s} value={s}>
                            {titleCase(s)}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td>
                      <input type="time" className="form-control w-28" disabled={!canWrite} value={r.check_in || ""} onChange={(ev) => patch(e.id, { check_in: ev.target.value })} />
                    </td>
                    <td>
                      <input type="time" className="form-control w-28" disabled={!canWrite} value={r.check_out || ""} onChange={(ev) => patch(e.id, { check_out: ev.target.value })} />
                    </td>
                    <td>
                      {(r.status === "absent" || r.status === "leave") && (
                        <input type="checkbox" className="form-check-input" disabled={!canWrite} checked={Boolean(r.is_unpaid)} onChange={(ev) => patch(e.id, { is_unpaid: ev.target.checked })} />
                      )}
                    </td>
                    <td>
                      <input type="text" className="form-control w-48" disabled={!canWrite} value={r.notes || ""} onChange={(ev) => patch(e.id, { notes: ev.target.value })} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <div className="text-xs text-slate-500 mt-3">Unpaid days (absent or unpaid leave) are deducted when payroll is generated.</div>
      {toast.node}
    </div>
  );
}

function MonthlySummary({ employees }) {
  const [month, setMonth] = useState(currentMonth());
  const [employeeId, setEmployeeId] = useState("");
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      let q = supabase.from("v_attendance_month").select("*").eq("month", monthStart(month)).order("full_name");
      if (employeeId) q = q.eq("employee_id", employeeId);
      const { data, error: err } = await q;
      if (!alive) return;
      setError(err ? friendlyError(err) : "");
      setRows(data || []);
      setLoading(false);
    })();
    return () => {
      alive = false;
    };
  }, [month, employeeId]);

  return (
    <div className="box p-5 mt-5">
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <h3 className="font-medium text-base">Monthly summary - {monthLabel(monthStart(month))}</h3>
        <input type="month" className="form-control w-44 ml-auto" value={month} onChange={(e) => e.target.value && setMonth(e.target.value)} />
        <EmployeeSelect className="form-select w-56" employees={employees} value={employeeId} onChange={setEmployeeId} allLabel="All employees" />
      </div>
      <ErrorBanner message={error} onClose={() => setError("")} />
      {loading ? (
        <Loading />
      ) : rows.length === 0 ? (
        <Empty>No attendance recorded for this month.</Empty>
      ) : (
        <div className="overflow-x-auto">
          <table className="table table-report -mt-2">
            <thead>
              <tr>
                <th>Employee</th>
                <th className="text-right">Present</th>
                <th className="text-right">Late</th>
                <th className="text-right">Half days</th>
                <th className="text-right">Leave</th>
                <th className="text-right">Absent</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.employee_id} className="intro-x">
                  <td>
                    <div className="font-medium">{r.full_name}</div>
                    <div className="text-slate-500 text-xs">{r.employee_code}</div>
                  </td>
                  <td className="text-right">{r.present_days}</td>
                  <td className="text-right">{r.late_days}</td>
                  <td className="text-right">{r.half_days}</td>
                  <td className="text-right">{r.leave_days}</td>
                  <td className="text-right text-danger">{r.absent_days}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default function AttendanceTab(props) {
  return (
    <>
      <DailyMarking {...props} />
      <MonthlySummary {...props} />
    </>
  );
}
