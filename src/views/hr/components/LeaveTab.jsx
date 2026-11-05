import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { friendlyError } from "@/lib/errors";
import { formatDate } from "@/lib/format";
import {
  ErrorBanner,
  Modal,
  Pagination,
  useToast,
  todayISO,
  EmployeeSelect,
  StatusBadge,
  Empty,
  Loading,
  daysBetween,
} from "./common";

function RequestModal({ employees, types, onClose, onSaved }) {
  const [f, setF] = useState({ employee_id: "", leave_type_id: types[0]?.id || "", from_date: todayISO(), to_date: todayISO(), reason: "" });
  const [days, setDays] = useState(1);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const computed = daysBetween(f.from_date, f.to_date);
  useEffect(() => setDays(computed || 1), [computed]);

  const submit = async () => {
    if (!f.employee_id || !f.leave_type_id) return setError("Choose an employee and a leave type.");
    if (computed < 1) return setError("The end date must not be before the start date.");
    setSaving(true);
    const { error: err } = await supabase.from("leave_requests").insert({
      employee_id: f.employee_id,
      leave_type_id: f.leave_type_id,
      from_date: f.from_date,
      to_date: f.to_date,
      days: Number(days),
      reason: f.reason.trim() || null,
    });
    setSaving(false);
    if (err) return setError(friendlyError(err));
    onSaved();
  };

  return (
    <Modal
      title="New leave request"
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn btn-outline-secondary" onClick={onClose}>Cancel</button>
          <button type="button" className="btn btn-primary" disabled={saving} onClick={submit}>{saving ? "Saving..." : "Submit request"}</button>
        </>
      }
    >
      <ErrorBanner message={error} onClose={() => setError("")} />
      <div className="grid grid-cols-2 gap-4">
        <div className="col-span-2">
          <label className="form-label">Employee</label>
          <EmployeeSelect className="form-select w-full" employees={employees} value={f.employee_id} onChange={(v) => setF({ ...f, employee_id: v })} />
        </div>
        <div className="col-span-2">
          <label className="form-label">Leave type</label>
          <select className="form-select w-full" value={f.leave_type_id} onChange={(e) => setF({ ...f, leave_type_id: e.target.value })}>
            {types.map((t) => (
              <option key={t.id} value={t.id}>{t.name}{t.is_paid ? "" : " (unpaid)"}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="form-label">From</label>
          <input type="date" className="form-control" value={f.from_date} onChange={(e) => setF({ ...f, from_date: e.target.value, to_date: e.target.value > f.to_date ? e.target.value : f.to_date })} />
        </div>
        <div>
          <label className="form-label">To</label>
          <input type="date" className="form-control" value={f.to_date} min={f.from_date} onChange={(e) => setF({ ...f, to_date: e.target.value })} />
        </div>
        <div>
          <label className="form-label">Days</label>
          <input type="number" step="0.5" min="0.5" className="form-control" value={days} onChange={(e) => setDays(e.target.value)} />
          <div className="text-xs text-slate-500 mt-1">Calculated from the dates; use 0.5 for a half day.</div>
        </div>
        <div className="col-span-2">
          <label className="form-label">Reason</label>
          <textarea className="form-control" rows="2" value={f.reason} onChange={(e) => setF({ ...f, reason: e.target.value })} />
        </div>
      </div>
    </Modal>
  );
}

function DecideModal({ row, approve, onClose, onDone }) {
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const go = async () => {
    setSaving(true);
    const { error: err } = await supabase.rpc("decide_leave", { p_id: row.id, p_approve: approve, p_note: note.trim() || null });
    setSaving(false);
    if (err) return setError(friendlyError(err));
    onDone(approve);
  };
  return (
    <Modal
      title={approve ? "Approve leave" : "Reject leave"}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn btn-outline-secondary" onClick={onClose}>Cancel</button>
          <button type="button" className={approve ? "btn btn-success text-white" : "btn btn-danger"} disabled={saving} onClick={go}>
            {saving ? "Saving..." : approve ? "Approve" : "Reject"}
          </button>
        </>
      }
    >
      <ErrorBanner message={error} onClose={() => setError("")} />
      <div className="text-sm mb-3">
        {row.employees?.full_name}: {formatDate(row.from_date)} to {formatDate(row.to_date)} ({row.days} day(s)).
        {approve && " Approving writes attendance rows for these days."}
      </div>
      <label className="form-label">Note (optional)</label>
      <textarea className="form-control" rows="2" value={note} onChange={(e) => setNote(e.target.value)} />
    </Modal>
  );
}

function LeaveTypes({ types, perms, reload }) {
  const [edit, setEdit] = useState(null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!edit.name.trim()) return setError("Name is required.");
    setSaving(true);
    const body = { name: edit.name.trim(), days_per_year: Number(edit.days_per_year) || 0, is_paid: edit.is_paid };
    const { error: err } = edit.id
      ? await supabase.from("leave_types").update(body).eq("id", edit.id)
      : await supabase.from("leave_types").insert(body);
    setSaving(false);
    if (err) return setError(friendlyError(err));
    setEdit(null);
    reload();
  };
  const remove = async (t) => {
    if (!window.confirm(`Delete leave type "${t.name}"?`)) return;
    const { error: err } = await supabase.from("leave_types").delete().eq("id", t.id);
    if (err) return setError(friendlyError(err));
    reload();
  };

  return (
    <div className="box p-5 mt-5">
      <div className="flex items-center mb-3">
        <h3 className="font-medium text-base">Leave types</h3>
        {perms.create && (
          <button type="button" className="btn btn-outline-primary ml-auto" onClick={() => setEdit({ name: "", days_per_year: 0, is_paid: true })}>
            Add leave type
          </button>
        )}
      </div>
      <ErrorBanner message={error} onClose={() => setError("")} />
      {types.length === 0 ? (
        <Empty>No leave types defined.</Empty>
      ) : (
        <table className="table table-report -mt-2">
          <thead>
            <tr><th>Name</th><th>Days / year</th><th>Paid</th><th></th></tr>
          </thead>
          <tbody>
            {types.map((t) => (
              <tr key={t.id} className="intro-x">
                <td className="font-medium">{t.name}</td>
                <td>{t.days_per_year}</td>
                <td>{t.is_paid ? "Paid" : "Unpaid"}</td>
                <td className="text-right whitespace-nowrap">
                  {perms.edit && <button type="button" className="btn btn-outline-secondary py-1 px-2 mr-2" onClick={() => setEdit({ ...t })}>Edit</button>}
                  {perms.delete && <button type="button" className="btn btn-outline-danger py-1 px-2" onClick={() => remove(t)}>Delete</button>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {edit && (
        <Modal
          title={edit.id ? "Edit leave type" : "New leave type"}
          onClose={() => setEdit(null)}
          footer={
            <>
              <button type="button" className="btn btn-outline-secondary" onClick={() => setEdit(null)}>Cancel</button>
              <button type="button" className="btn btn-primary" disabled={saving} onClick={save}>{saving ? "Saving..." : "Save"}</button>
            </>
          }
        >
          <ErrorBanner message={error} onClose={() => setError("")} />
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className="form-label">Name</label>
              <input className="form-control" value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} />
            </div>
            <div>
              <label className="form-label">Days per year</label>
              <input type="number" min="0" className="form-control" value={edit.days_per_year} onChange={(e) => setEdit({ ...edit, days_per_year: e.target.value })} />
            </div>
            <div className="flex items-end">
              <label className="flex items-center"><input type="checkbox" className="form-check-input mr-2" checked={edit.is_paid} onChange={(e) => setEdit({ ...edit, is_paid: e.target.checked })} />Paid leave</label>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

export default function LeaveTab({ employees, perms }) {
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(10);
  const [status, setStatus] = useState("");
  const [employeeId, setEmployeeId] = useState("");
  const [types, setTypes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [modal, setModal] = useState(null);
  const toast = useToast();

  const loadTypes = useCallback(async () => {
    const { data, error: err } = await supabase.from("leave_types").select("*").order("name");
    if (err) setError(friendlyError(err));
    setTypes(data || []);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    let q = supabase
      .from("leave_requests")
      .select("*, employees(full_name, employee_code), leave_types(name, is_paid)", { count: "exact" })
      .order("created_at", { ascending: false })
      .range(page * pageSize, page * pageSize + pageSize - 1);
    if (status) q = q.eq("status", status);
    if (employeeId) q = q.eq("employee_id", employeeId);
    const { data, count, error: err } = await q;
    setError(err ? friendlyError(err) : "");
    setRows(data || []);
    setTotal(count || 0);
    setLoading(false);
  }, [page, pageSize, status, employeeId]);

  useEffect(() => { loadTypes(); }, [loadTypes]);
  useEffect(() => { load(); }, [load]);

  return (
    <>
      <div className="box p-5">
        <div className="flex flex-wrap items-center gap-3 mb-4">
          <h3 className="font-medium text-base">Leave requests</h3>
          <div className="flex flex-wrap items-center gap-2 ml-auto">
            <EmployeeSelect className="form-select w-52" employees={employees} value={employeeId} onChange={(v) => { setPage(0); setEmployeeId(v); }} allLabel="All employees" />
            <select className="form-select w-40" value={status} onChange={(e) => { setPage(0); setStatus(e.target.value); }}>
              <option value="">All statuses</option>
              {["pending", "approved", "rejected", "cancelled"].map((s) => <option key={s} value={s}>{s[0].toUpperCase() + s.slice(1)}</option>)}
            </select>
            {perms.create && (
              <button type="button" className="btn btn-primary" disabled={!types.length} onClick={() => setModal({ kind: "new" })}>
                New request
              </button>
            )}
          </div>
        </div>
        <ErrorBanner message={error} onClose={() => setError("")} />
        {loading ? (
          <Loading />
        ) : rows.length === 0 ? (
          <Empty>No leave requests found.</Empty>
        ) : (
          <div className="overflow-x-auto">
            <table className="table table-report -mt-2">
              <thead>
                <tr><th>Employee</th><th>Type</th><th>Dates</th><th className="text-right">Days</th><th>Status</th><th>Reason / note</th><th></th></tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="intro-x">
                    <td className="font-medium whitespace-nowrap">{r.employees?.full_name}</td>
                    <td>{r.leave_types?.name}</td>
                    <td className="whitespace-nowrap">{formatDate(r.from_date)} - {formatDate(r.to_date)}</td>
                    <td className="text-right">{r.days}</td>
                    <td><StatusBadge status={r.status} /></td>
                    <td className="text-xs text-slate-500 max-w-xs">{r.reason}{r.decision_note ? ` / ${r.decision_note}` : ""}</td>
                    <td className="text-right whitespace-nowrap">
                      {r.status === "pending" && perms.edit && (
                        <>
                          <button type="button" className="btn btn-success text-white py-1 px-2 mr-2" onClick={() => setModal({ kind: "decide", row: r, approve: true })}>Approve</button>
                          <button type="button" className="btn btn-outline-danger py-1 px-2" onClick={() => setModal({ kind: "decide", row: r, approve: false })}>Reject</button>
                        </>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <Pagination page={page} pageSize={pageSize} total={total} onPage={setPage} onPageSize={(n) => { setPageSize(n); setPage(0); }} />
      </div>
      <LeaveTypes types={types} perms={perms} reload={loadTypes} />
      {modal?.kind === "new" && (
        <RequestModal employees={employees} types={types} onClose={() => setModal(null)} onSaved={() => { setModal(null); toast.show("Leave request created."); load(); }} />
      )}
      {modal?.kind === "decide" && (
        <DecideModal row={modal.row} approve={modal.approve} onClose={() => setModal(null)} onDone={(a) => { setModal(null); toast.show(a ? "Leave approved." : "Leave rejected."); load(); }} />
      )}
      {toast.node}
    </>
  );
}
