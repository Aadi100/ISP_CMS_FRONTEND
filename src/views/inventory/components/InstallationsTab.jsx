import { Lucide, Tippy } from "@/base-components";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { can } from "@/lib/session";
import { friendlyError } from "@/lib/errors";
import { formatDateTime, money, titleCase } from "@/lib/format";
import CompleteInstallation from "./CompleteInstallation";
import InstallationDetail from "./InstallationDetail";
import InstallationForm from "./InstallationForm";
import {
  BranchSelect,
  Empty,
  ErrorBanner,
  Field,
  Modal,
  Pager,
  SearchBox,
  Spinner,
  StatusBadge,
  SuccessBanner,
  TechnicianSelect,
  clean,
  downloadCsv,
  nullIfEmpty,
} from "./shared";

const STATUSES = ["planned", "in_progress", "completed", "cancelled"];

export default function InstallationsTab({ ctx }) {
  const { session, branches, employees, isAdmin } = ctx;
  const canCreate = can(session, "inventory", "create");
  const canEdit = can(session, "inventory", "edit");
  const canExport = can(session, "inventory", "export");

  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(10);
  const [reloadKey, setReloadKey] = useState(0);

  const [searchDraft, setSearchDraft] = useState("");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [technician, setTechnician] = useState("");
  const [branch, setBranch] = useState("");

  const [creating, setCreating] = useState(false);
  const [completing, setCompleting] = useState(null);
  const [cancelling, setCancelling] = useState(null);
  const [detail, setDetail] = useState(null);

  const applyFilters = (q) => {
    if (status) q = q.eq("status", status);
    if (technician) q = q.eq("technician_id", technician);
    if (branch) q = q.eq("branch_id", branch);
    const s = clean(search);
    if (s) q = q.or(`installation_number.ilike.%${s}%,subscriber_name.ilike.%${s}%,subscriber_code.ilike.%${s}%,subscriber_phone.ilike.%${s}%`);
    return q;
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data, count, error: err } = await applyFilters(
        supabase
          .from("v_installation_overview")
          .select("*", { count: "exact" })
          .order("created_at", { ascending: false })
          .range(page * pageSize, page * pageSize + pageSize - 1)
      );
      if (cancelled) return;
      if (err) setError(friendlyError(err));
      else {
        setError("");
        setRows(data || []);
        setTotal(count || 0);
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, pageSize, search, status, technician, branch, reloadKey]);

  const reload = () => setReloadKey((k) => k + 1);
  const resetPage = (fn) => (v) => {
    setPage(0);
    fn(v);
  };
  const submitSearch = () => {
    setPage(0);
    setSearch(searchDraft);
  };
  const reset = () => {
    setSearchDraft("");
    setSearch("");
    setStatus("");
    setTechnician("");
    setBranch("");
    setPage(0);
  };

  const exportCsv = async () => {
    const { data, error: err } = await applyFilters(
      supabase.from("v_installation_overview").select("*").order("created_at", { ascending: false }).limit(5000)
    );
    if (err) return setError(friendlyError(err));
    downloadCsv(
      "installations.csv",
      [
        { label: "Job", get: (r) => r.installation_number },
        { label: "Customer", get: (r) => r.subscriber_name },
        { label: "Technician", get: (r) => r.technician_name },
        { label: "Status", get: (r) => r.status },
        { label: "Scheduled", get: (r) => r.scheduled_at },
        { label: "Completed", get: (r) => r.completed_at },
        { label: "Fee", get: (r) => r.installation_fee },
        { label: "Materials cost", get: (r) => r.materials_cost },
        { label: "Invoice", get: (r) => r.invoice_number },
      ],
      data || []
    );
  };

  const icon = (name, tip, fn, cls = "text-slate-500 hover:text-primary") => (
    <Tippy
      tag="a"
      href=""
      content={tip}
      onClick={(e) => {
        e.preventDefault();
        fn();
      }}
    >
      <Lucide icon={name} className={`w-4 h-4 ${cls}`} />
    </Tippy>
  );

  return (
    <div className="grid grid-cols-12 gap-6">
      <div className="col-span-12 flex flex-wrap gap-2 items-center">
        <h2 className="text-lg font-medium mr-auto">Installations</h2>
        {canCreate && (
          <button type="button" className="btn btn-primary shadow-md" onClick={() => setCreating(true)}>
            <Lucide icon="Plus" className="w-4 h-4 mr-2" /> New Installation
          </button>
        )}
        {canExport && (
          <button type="button" className="btn btn-outline-secondary" onClick={exportCsv}>
            <Lucide icon="Download" className="w-4 h-4 mr-2" /> Export
          </button>
        )}
      </div>
      <div className="col-span-12">
        <SuccessBanner message={notice} />
        <ErrorBanner message={error} />
      </div>

      <div className="col-span-12">
        <div className="box p-5">
          <SearchBox value={searchDraft} onChange={setSearchDraft} onSubmit={submitSearch} placeholder="Search by customer name, ID, phone or INS- number" />
          <div className="grid grid-cols-12 gap-3 mt-4">
            <div className="col-span-12 sm:col-span-6 lg:col-span-3">
              <label className="text-xs text-slate-500">Status</label>
              <select className="form-select box mt-1 w-full" value={status} onChange={(e) => resetPage(setStatus)(e.target.value)}>
                <option value="">All Statuses</option>
                {STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {titleCase(s)}
                  </option>
                ))}
              </select>
            </div>
            <div className="col-span-12 sm:col-span-6 lg:col-span-3">
              <label className="text-xs text-slate-500">Technician</label>
              <div className="mt-1">
                <TechnicianSelect employees={employees} value={technician} onChange={resetPage(setTechnician)} allLabel="All Technicians" />
              </div>
            </div>
            {isAdmin && (
              <div className="col-span-12 sm:col-span-6 lg:col-span-3">
                <label className="text-xs text-slate-500">Branch</label>
                <BranchSelect branches={branches} value={branch} onChange={resetPage(setBranch)} />
              </div>
            )}
            <div className="col-span-12 flex gap-2">
              <button type="button" className="btn btn-primary" onClick={submitSearch}>
                Search
              </button>
              <button type="button" className="btn btn-outline-secondary" onClick={reset}>
                Reset
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="col-span-12">
        {loading ? (
          <Spinner />
        ) : rows.length === 0 ? (
          <Empty text="No installations found." icon="Wrench">
            {canCreate && (
              <button type="button" className="btn btn-primary shadow-md" onClick={() => setCreating(true)}>
                <Lucide icon="Plus" className="w-4 h-4 mr-2" /> New Installation
              </button>
            )}
          </Empty>
        ) : (
          <div className="w-full overflow-x-auto">
            <table className="table table-report w-full min-w-[1100px]">
              <thead>
                <tr>
                  <th>JOB</th>
                  <th>CUSTOMER</th>
                  <th>TECHNICIAN</th>
                  <th>SCHEDULED</th>
                  <th className="text-center">STATUS</th>
                  <th className="text-right">FEE</th>
                  <th className="text-right">MATERIALS</th>
                  <th>INVOICE</th>
                  <th className="text-center min-w-[130px]">ACTIONS</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const open = r.status === "planned" || r.status === "in_progress";
                  return (
                    <tr key={r.id} className="intro-x">
                      <td className="font-medium whitespace-nowrap">{r.installation_number}</td>
                      <td className="whitespace-nowrap">
                        {r.subscriber_name}
                        <div className="text-xs text-slate-500">{r.subscriber_code}</div>
                      </td>
                      <td className="whitespace-nowrap">{r.technician_name || "—"}</td>
                      <td className="whitespace-nowrap">{formatDateTime(r.scheduled_at)}</td>
                      <td>
                        <div className="flex justify-center">
                          <StatusBadge value={r.status} />
                        </div>
                      </td>
                      <td className="text-right whitespace-nowrap">{money(r.installation_fee)}</td>
                      <td className="text-right whitespace-nowrap">
                        {r.materials_count} item{Number(r.materials_count) === 1 ? "" : "s"}
                        {r.status === "completed" && <div className="text-xs text-slate-500">{money(r.materials_cost)}</div>}
                      </td>
                      <td className="whitespace-nowrap">{r.invoice_number || "—"}</td>
                      <td className="table-report__action">
                        <div className="flex justify-center items-center gap-3">
                          {icon("Eye", "Details", () => setDetail(r))}
                          {canEdit && open && icon("CheckCircle2", "Complete installation", () => setCompleting(r), "text-success")}
                          {canEdit && open && icon("XCircle", "Cancel installation", () => setCancelling(r), "text-danger")}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {!loading && total > 0 && (
          <Pager page={page} pageSize={pageSize} total={total} onPage={setPage} onPageSize={(s) => { setPage(0); setPageSize(s); }} />
        )}
      </div>

      {creating && (
        <InstallationForm
          ctx={ctx}
          onClose={() => setCreating(false)}
          onCreated={() => {
            setCreating(false);
            setNotice("Installation created.");
            reload();
          }}
        />
      )}
      {completing && (
        <CompleteInstallation
          job={completing}
          onClose={() => setCompleting(null)}
          onDone={() => {
            setNotice(`${completing.installation_number} completed.`);
            setCompleting(null);
            reload();
          }}
        />
      )}
      {cancelling && (
        <CancelModal
          job={cancelling}
          onClose={() => setCancelling(null)}
          onDone={() => {
            setNotice(`${cancelling.installation_number} cancelled.`);
            setCancelling(null);
            reload();
          }}
        />
      )}
      {detail && <InstallationDetail job={detail} onClose={() => setDetail(null)} />}
    </div>
  );
}

function CancelModal({ job, onClose, onDone }) {
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const submit = async () => {
    setSaving(true);
    const { error: err } = await supabase.rpc("cancel_installation", {
      p_installation_id: job.id,
      p_reason: nullIfEmpty(reason),
    });
    setSaving(false);
    if (err) return setError(friendlyError(err));
    onDone();
  };
  return (
    <Modal
      title={`Cancel ${job.installation_number}`}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn btn-outline-secondary" onClick={onClose}>
            Keep installation
          </button>
          <button type="button" className="btn btn-danger" disabled={saving} onClick={submit}>
            {saving ? "Cancelling..." : "Cancel installation"}
          </button>
        </>
      }
    >
      <ErrorBanner message={error} />
      <div className="text-sm text-slate-500 my-3">
        The job for {job.subscriber_name} will be cancelled. No stock is deducted.
      </div>
      <Field label="Reason" className="col-span-12">
        <textarea rows={2} className="form-control box w-full" value={reason} onChange={(e) => setReason(e.target.value)} />
      </Field>
    </Modal>
  );
}
