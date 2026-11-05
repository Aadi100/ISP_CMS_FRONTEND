import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { friendlyError } from "@/lib/errors";
import { formatDate, money } from "@/lib/format";
import { ErrorBanner, Modal, Pagination, useToast, todayISO, EmployeeSelect, Empty, Loading } from "./common";

function AdvanceModal({ initial, employees, onClose, onSaved }) {
  const [f, setF] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const submit = async () => {
    if (!f.employee_id) return setError("Choose an employee.");
    if (!(Number(f.amount) > 0)) return setError("Amount must be above zero.");
    setSaving(true);
    const body = { amount: Number(f.amount), given_on: f.given_on, note: f.note?.trim() || null };
    const { error: err } = f.id
      ? await supabase.from("salary_advances").update(body).eq("id", f.id)
      : await supabase.from("salary_advances").insert({ ...body, employee_id: f.employee_id });
    setSaving(false);
    if (err) return setError(friendlyError(err));
    onSaved(Boolean(f.id));
  };
  return (
    <Modal
      title={f.id ? "Edit advance" : "New salary advance"}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn btn-outline-secondary" onClick={onClose}>Cancel</button>
          <button type="button" className="btn btn-primary" disabled={saving} onClick={submit}>{saving ? "Saving..." : "Save"}</button>
        </>
      }
    >
      <ErrorBanner message={error} onClose={() => setError("")} />
      <div className="grid grid-cols-2 gap-4">
        <div className="col-span-2">
          <label className="form-label">Employee</label>
          <EmployeeSelect className="form-select w-full" employees={employees} value={f.employee_id} disabled={Boolean(f.id)} onChange={(v) => setF({ ...f, employee_id: v })} />
        </div>
        <div>
          <label className="form-label">Amount (PKR)</label>
          <input type="number" min="1" className="form-control" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} />
        </div>
        <div>
          <label className="form-label">Date given</label>
          <input type="date" className="form-control" value={f.given_on} onChange={(e) => setF({ ...f, given_on: e.target.value })} />
        </div>
        <div className="col-span-2">
          <label className="form-label">Note</label>
          <textarea className="form-control" rows="2" value={f.note || ""} onChange={(e) => setF({ ...f, note: e.target.value })} />
        </div>
      </div>
      <div className="text-xs text-slate-500 mt-3">Repayments are recorded automatically from the advance deduction when a payroll run is paid.</div>
    </Modal>
  );
}

export default function AdvancesTab({ employees, perms }) {
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(10);
  const [employeeId, setEmployeeId] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [modal, setModal] = useState(null);
  const toast = useToast();

  const load = useCallback(async () => {
    setLoading(true);
    let q = supabase
      .from("salary_advances")
      .select("*, employees(full_name, employee_code)", { count: "exact" })
      .order("given_on", { ascending: false })
      .range(page * pageSize, page * pageSize + pageSize - 1);
    if (employeeId) q = q.eq("employee_id", employeeId);
    const { data, count, error: err } = await q;
    setError(err ? friendlyError(err) : "");
    setRows(data || []);
    setTotal(count || 0);
    setLoading(false);
  }, [page, pageSize, employeeId]);
  useEffect(() => { load(); }, [load]);

  const remove = async (r) => {
    if (!window.confirm("Delete this advance?")) return;
    const { error: err } = await supabase.from("salary_advances").delete().eq("id", r.id);
    if (err) return setError(friendlyError(err));
    toast.show("Advance deleted.");
    load();
  };

  return (
    <div className="box p-5">
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <h3 className="font-medium text-base">Salary advances</h3>
        <div className="flex items-center gap-2 ml-auto">
          <EmployeeSelect className="form-select w-52" employees={employees} value={employeeId} onChange={(v) => { setPage(0); setEmployeeId(v); }} allLabel="All employees" />
          {perms.create && (
            <button type="button" className="btn btn-primary" onClick={() => setModal({ employee_id: "", amount: "", given_on: todayISO(), note: "" })}>
              New advance
            </button>
          )}
        </div>
      </div>
      <ErrorBanner message={error} onClose={() => setError("")} />
      {loading ? (
        <Loading />
      ) : rows.length === 0 ? (
        <Empty>No salary advances recorded.</Empty>
      ) : (
        <div className="overflow-x-auto">
          <table className="table table-report -mt-2">
            <thead>
              <tr><th>Employee</th><th>Date</th><th className="text-right">Amount</th><th className="text-right">Repaid</th><th className="text-right">Outstanding</th><th>Note</th><th></th></tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const out = Number(r.amount) - Number(r.repaid);
                return (
                  <tr key={r.id} className="intro-x">
                    <td className="font-medium whitespace-nowrap">{r.employees?.full_name}</td>
                    <td className="whitespace-nowrap">{formatDate(r.given_on)}</td>
                    <td className="text-right">{money(r.amount)}</td>
                    <td className="text-right">{money(r.repaid)}</td>
                    <td className={out > 0 ? "text-right text-danger font-medium" : "text-right text-success"}>{money(out)}</td>
                    <td className="text-xs text-slate-500">{r.note}</td>
                    <td className="text-right whitespace-nowrap">
                      {perms.edit && <button type="button" className="btn btn-outline-secondary py-1 px-2 mr-2" onClick={() => setModal({ ...r })}>Edit</button>}
                      {perms.delete && <button type="button" className="btn btn-outline-danger py-1 px-2" onClick={() => remove(r)}>Delete</button>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <Pagination page={page} pageSize={pageSize} total={total} onPage={setPage} onPageSize={(n) => { setPageSize(n); setPage(0); }} />
      {modal && (
        <AdvanceModal initial={modal} employees={employees} onClose={() => setModal(null)} onSaved={(edited) => { setModal(null); toast.show(edited ? "Advance updated." : "Advance recorded."); load(); }} />
      )}
      {toast.node}
    </div>
  );
}
