import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { friendlyError } from "@/lib/errors";
import { formatDate, money, titleCase } from "@/lib/format";
import {
  ErrorBanner,
  Modal,
  useToast,
  todayISO,
  StatusBadge,
  Empty,
  Loading,
  monthLabel,
  useOrganization,
} from "./common";
import { printPayslip } from "./payslipPrint";

const EDITABLE = ["allowances", "bonus", "advance_deduction", "other_deduction"];
const METHODS = ["bank_transfer", "cash", "online", "cheque", "jazzcash", "easypaisa"];
const n = (v) => Number(v) || 0;

function PayModal({ run, total, onClose, onDone }) {
  const [method, setMethod] = useState("bank_transfer");
  const [paidOn, setPaidOn] = useState(todayISO());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const go = async () => {
    setSaving(true);
    const { error: err } = await supabase.rpc("pay_payroll", { p_run: run.id, p_method: method, p_paid_on: paidOn || null });
    setSaving(false);
    if (err) return setError(friendlyError(err));
    onDone();
  };
  return (
    <Modal
      title="Mark payroll as paid"
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn btn-outline-secondary" onClick={onClose}>Cancel</button>
          <button type="button" className="btn btn-primary" disabled={saving} onClick={go}>{saving ? "Saving..." : "Confirm payment"}</button>
        </>
      }
    >
      <ErrorBanner message={error} onClose={() => setError("")} />
      <div className="alert alert-outline-secondary text-sm mb-4">
        This books <b>one Salaries expense of {money(total)}</b> for {monthLabel(run.month)} in Accounting, adds the advance
        deductions to the repaid amount of each advance, and locks all payslips. It cannot be undone.
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="form-label">Payment method</label>
          <select className="form-select" value={method} onChange={(e) => setMethod(e.target.value)}>
            {METHODS.map((m) => <option key={m} value={m}>{titleCase(m)}</option>)}
          </select>
        </div>
        <div>
          <label className="form-label">Paid on</label>
          <input type="date" className="form-control" value={paidOn} onChange={(e) => setPaidOn(e.target.value)} />
        </div>
      </div>
    </Modal>
  );
}

export default function PayrollRun({ runId, perms, onBack }) {
  const [run, setRun] = useState(null);
  const [slips, setSlips] = useState([]);
  const [edits, setEdits] = useState({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [paying, setPaying] = useState(false);
  const toast = useToast();
  const org = useOrganization();

  const load = useCallback(async () => {
    setLoading(true);
    const [r, s] = await Promise.all([
      supabase.from("payroll_runs").select("*").eq("id", runId).maybeSingle(),
      supabase.from("v_payslip").select("*").eq("run_id", runId).order("full_name"),
    ]);
    const err = r.error || s.error;
    setError(err ? friendlyError(err) : "");
    setRun(r.data);
    setSlips(s.data || []);
    setEdits({});
    setLoading(false);
  }, [runId]);
  useEffect(() => { load(); }, [load]);

  if (loading && !run) return <Loading />;
  if (!run) return (<div className="box p-5"><ErrorBanner message={error || "Payroll run not found."} /><button type="button" className="btn btn-outline-secondary" onClick={onBack}>Back</button></div>);

  const draft = run.status === "draft";
  const canEdit = draft && perms.edit;
  const val = (s, k) => (edits[s.id] && k in edits[s.id] ? edits[s.id][k] : s[k] ?? "");
  const setVal = (s, k, v) => setEdits((e) => ({ ...e, [s.id]: { ...e[s.id], [k]: v } }));
  const netOf = (s) =>
    n(s.base_salary) - n(s.absent_deduction) + n(val(s, "allowances")) + n(val(s, "bonus")) + n(s.commission) - n(val(s, "advance_deduction")) - n(val(s, "other_deduction"));
  const total = slips.reduce((t, s) => t + netOf(s), 0);
  const sum = (k) => slips.reduce((t, s) => t + n(EDITABLE.includes(k) ? val(s, k) : s[k]), 0);

  const saveSlip = async (s) => {
    const e = edits[s.id] || {};
    const body = {};
    EDITABLE.forEach((k) => { body[k] = n(k in e ? e[k] : s[k]); });
    body.notes = ("notes" in e ? e.notes : s.notes)?.trim() || null;
    setBusy(s.id);
    const { error: err } = await supabase.from("payslips").update(body).eq("id", s.id);
    setBusy("");
    if (err) return setError(friendlyError(err));
    toast.show(`Payslip saved for ${s.full_name}.`);
    load();
  };

  const approve = async () => {
    if (Object.keys(edits).length && !window.confirm("You have unsaved payslip edits that will be ignored. Approve anyway?")) return;
    setBusy("approve");
    const { error: err } = await supabase.rpc("approve_payroll", { p_run: run.id });
    setBusy("");
    if (err) return setError(friendlyError(err));
    toast.show("Payroll approved.");
    load();
  };

  return (
    <div className="box p-5">
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <button type="button" className="btn btn-outline-secondary" onClick={onBack}>Back</button>
        <h3 className="font-medium text-base">Payroll - {monthLabel(run.month)}</h3>
        <StatusBadge status={run.status} />
        <div className="ml-auto flex gap-2">
          {draft && perms.edit && (
            <button type="button" className="btn btn-primary" disabled={busy === "approve" || slips.length === 0} onClick={approve}>
              {busy === "approve" ? "Approving..." : "Approve"}
            </button>
          )}
          {run.status === "approved" && perms.edit && (
            <button type="button" className="btn btn-success text-white" onClick={() => setPaying(true)}>Mark as paid</button>
          )}
        </div>
      </div>
      {run.status === "paid" && (
        <div className="text-sm text-slate-500 mb-3">Paid on {formatDate(run.paid_at)} by {titleCase(run.pay_method || "")}.</div>
      )}
      <ErrorBanner message={error} onClose={() => setError("")} />
      {slips.length === 0 ? (
        <Empty>This run has no payslips (no active employee has a salary set).</Empty>
      ) : (
        <div className="overflow-x-auto">
          <table className="table table-report -mt-2 text-sm">
            <thead>
              <tr>
                <th>Employee</th>
                <th className="text-right">Base</th>
                <th className="text-right">Absent days</th>
                <th className="text-right">Absence ded.</th>
                <th className="text-right">Allowances</th>
                <th className="text-right">Bonus</th>
                <th className="text-right">Commission</th>
                <th className="text-right">Advance ded.</th>
                <th className="text-right">Other ded.</th>
                <th className="text-right">Net</th>
                <th>Notes</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {slips.map((s) => (
                <tr key={s.id} className="intro-x">
                  <td className="whitespace-nowrap">
                    <div className="font-medium">{s.full_name}</div>
                    <div className="text-slate-500 text-xs">{s.employee_code}</div>
                  </td>
                  <td className="text-right">{money(s.base_salary)}</td>
                  <td className="text-right">{s.absent_days}</td>
                  <td className="text-right">{money(s.absent_deduction)}</td>
                  {EDITABLE.slice(0, 2).map((k) => (
                    <td key={k} className="text-right">
                      {canEdit ? (
                        <input type="number" min="0" className="form-control w-24 text-right" value={val(s, k)} onChange={(e) => setVal(s, k, e.target.value)} />
                      ) : draft ? money(s[k]) : (<span title="Locked">{money(s[k])}</span>)}
                    </td>
                  ))}
                  <td className="text-right">{money(s.commission)}</td>
                  {EDITABLE.slice(2).map((k) => (
                    <td key={k} className="text-right">
                      {canEdit ? (
                        <input type="number" min="0" className="form-control w-24 text-right" value={val(s, k)} onChange={(e) => setVal(s, k, e.target.value)} />
                      ) : money(s[k])}
                    </td>
                  ))}
                  <td className="text-right font-medium whitespace-nowrap">{money(netOf(s))}</td>
                  <td>
                    {canEdit ? (
                      <input type="text" className="form-control w-36" value={val(s, "notes")} onChange={(e) => setVal(s, "notes", e.target.value)} />
                    ) : (
                      <span className="text-xs text-slate-500">{s.notes}</span>
                    )}
                  </td>
                  <td className="text-right whitespace-nowrap">
                    {canEdit && edits[s.id] && (
                      <button type="button" className="btn btn-primary py-1 px-2 mr-2" disabled={busy === s.id} onClick={() => saveSlip(s)}>
                        {busy === s.id ? "..." : "Save"}
                      </button>
                    )}
                    {!draft && <span className="text-xs text-slate-500 mr-2">Locked</span>}
                    <button
                      type="button"
                      className="btn btn-outline-secondary py-1 px-2"
                      title="Print payslip"
                      onClick={() => !printPayslip(org, run, s) && setError("Allow pop-ups to print the payslip.")}
                    >
                      Print
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="font-medium">
                <td>Total</td>
                <td className="text-right">{money(sum("base_salary"))}</td>
                <td className="text-right">{sum("absent_days")}</td>
                <td className="text-right">{money(sum("absent_deduction"))}</td>
                <td className="text-right">{money(sum("allowances"))}</td>
                <td className="text-right">{money(sum("bonus"))}</td>
                <td className="text-right">{money(sum("commission"))}</td>
                <td className="text-right">{money(sum("advance_deduction"))}</td>
                <td className="text-right">{money(sum("other_deduction"))}</td>
                <td className="text-right">{money(total)}</td>
                <td colSpan="2"></td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
      {paying && (
        <PayModal run={run} total={run.total_net} onClose={() => setPaying(false)} onDone={() => { setPaying(false); toast.show("Payroll marked as paid and the Salaries expense was booked."); load(); }} />
      )}
      {toast.node}
    </div>
  );
}
