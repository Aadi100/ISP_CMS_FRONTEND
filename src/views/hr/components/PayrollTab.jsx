import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { friendlyError } from "@/lib/errors";
import { formatDate, money } from "@/lib/format";
import { ErrorBanner, Modal, useToast, StatusBadge, Empty, Loading, currentMonth, monthStart, monthLabel } from "./common";
import PayrollRun from "./PayrollRun";

function GenerateModal({ onClose, onDone }) {
  const [month, setMonth] = useState(currentMonth());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const go = async () => {
    setSaving(true);
    const { data, error: err } = await supabase.rpc("generate_payroll", { p_month: monthStart(month) });
    setSaving(false);
    if (err) return setError(friendlyError(err));
    onDone(data);
  };
  return (
    <Modal
      title="Generate payroll"
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn btn-outline-secondary" onClick={onClose}>Cancel</button>
          <button type="button" className="btn btn-primary" disabled={saving} onClick={go}>{saving ? "Generating..." : "Generate"}</button>
        </>
      }
    >
      <ErrorBanner message={error} onClose={() => setError("")} />
      <label className="form-label">Month</label>
      <input type="month" className="form-control" value={month} onChange={(e) => e.target.value && setMonth(e.target.value)} />
      <div className="text-xs text-slate-500 mt-3">
        Creates one payslip for every active employee with a salary, using the attendance and commissions of the month.
        If a draft already exists for this month it is regenerated (manual edits on its payslips are replaced). Approved or paid runs cannot be regenerated.
      </div>
    </Modal>
  );
}

export default function PayrollTab({ perms }) {
  const [runs, setRuns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [gen, setGen] = useState(false);
  const [openId, setOpenId] = useState(null);
  const toast = useToast();

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error: err } = await supabase.from("payroll_runs").select("*").order("month", { ascending: false }).limit(60);
    setError(err ? friendlyError(err) : "");
    setRuns(data || []);
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  if (openId) {
    return <PayrollRun runId={openId} perms={perms} onBack={() => { setOpenId(null); load(); }} />;
  }

  return (
    <div className="box p-5">
      <div className="flex items-center mb-4">
        <h3 className="font-medium text-base">Payroll runs</h3>
        {perms.create && (
          <button type="button" className="btn btn-primary ml-auto" onClick={() => setGen(true)}>Generate payroll</button>
        )}
      </div>
      <ErrorBanner message={error} onClose={() => setError("")} />
      {loading ? (
        <Loading />
      ) : runs.length === 0 ? (
        <Empty>No payroll runs yet. Generate the first one for a month.</Empty>
      ) : (
        <div className="overflow-x-auto">
          <table className="table table-report -mt-2">
            <thead>
              <tr><th>Month</th><th>Status</th><th className="text-right">Total net</th><th>Approved</th><th>Paid</th><th></th></tr>
            </thead>
            <tbody>
              {runs.map((r) => (
                <tr key={r.id} className="intro-x">
                  <td className="font-medium">{monthLabel(r.month)}</td>
                  <td><StatusBadge status={r.status} /></td>
                  <td className="text-right">{money(r.total_net)}</td>
                  <td>{r.approved_at ? formatDate(r.approved_at) : "-"}</td>
                  <td>{r.paid_at ? formatDate(r.paid_at) : "-"}</td>
                  <td className="text-right">
                    <button type="button" className="btn btn-outline-primary py-1 px-2" onClick={() => setOpenId(r.id)}>Open</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {gen && (
        <GenerateModal
          onClose={() => setGen(false)}
          onDone={(run) => { setGen(false); toast.show("Payroll generated."); load(); if (run?.id) setOpenId(run.id); }}
        />
      )}
      {toast.node}
    </div>
  );
}
