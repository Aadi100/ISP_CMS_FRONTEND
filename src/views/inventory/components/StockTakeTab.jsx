import { Lucide, Tippy } from "@/base-components";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { can } from "@/lib/session";
import { friendlyError } from "@/lib/errors";
import { formatDateTime, titleCase } from "@/lib/format";
import StockTakeDetail from "./StockTakeDetail";
import { BranchSelect, Empty, ErrorBanner, Field, Modal, Pager, Spinner, SuccessBanner, nullIfEmpty } from "./shared";

const BADGE = {
  open: "bg-warning/20 text-warning",
  finalized: "bg-success/20 text-success",
  cancelled: "bg-slate-300 text-slate-600 dark:bg-darkmode-400 dark:text-slate-300",
};

export default function StockTakeTab({ ctx }) {
  const { session, branches, isAdmin } = ctx;
  const canEdit = can(session, "inventory", "edit");

  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(10);
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [reloadKey, setReloadKey] = useState(0);

  const [starting, setStarting] = useState(false);
  const [open, setOpen] = useState(null);

  const branchName = (id) => (id ? branches.find((b) => b.id === id)?.name || "Branch" : "All branches");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      let q = supabase
        .from("stock_takes")
        .select("*", { count: "exact" })
        .order("started_at", { ascending: false })
        .range(page * pageSize, page * pageSize + pageSize - 1);
      if (status) q = q.eq("status", status);
      const { data, count, error: err } = await q;
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
  }, [page, pageSize, status, reloadKey]);

  const reload = () => setReloadKey((k) => k + 1);

  return (
    <div className="grid grid-cols-12 gap-6">
      <div className="col-span-12 flex flex-wrap gap-2 items-center">
        <div className="mr-auto">
          <h2 className="text-lg font-medium">Stock-take</h2>
          <div className="text-slate-500 mt-1">Count what is on the shelf and apply the differences as adjustments.</div>
        </div>
        <select
          className="form-select box w-40"
          value={status}
          onChange={(e) => {
            setPage(0);
            setStatus(e.target.value);
          }}
        >
          <option value="">All statuses</option>
          {["open", "finalized", "cancelled"].map((s) => (
            <option key={s} value={s}>
              {titleCase(s)}
            </option>
          ))}
        </select>
        {canEdit && (
          <button type="button" className="btn btn-primary shadow-md" onClick={() => setStarting(true)}>
            <Lucide icon="Plus" className="w-4 h-4 mr-2" /> Start stock-take
          </button>
        )}
      </div>
      <div className="col-span-12">
        <SuccessBanner message={notice} />
        <ErrorBanner message={error} />
      </div>

      <div className="col-span-12">
        {loading ? (
          <Spinner />
        ) : rows.length === 0 ? (
          <Empty text="No stock-takes yet." icon="ClipboardList" />
        ) : (
          <div className="w-full overflow-x-auto">
            <table className="table table-report w-full min-w-[800px]">
              <thead>
                <tr>
                  <th>NUMBER</th>
                  <th>BRANCH</th>
                  <th className="text-center">STATUS</th>
                  <th>STARTED</th>
                  <th>FINALIZED</th>
                  <th>NOTES</th>
                  <th className="text-center">ACTIONS</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="intro-x">
                    <td className="font-medium whitespace-nowrap">{r.take_number}</td>
                    <td>{branchName(r.branch_id)}</td>
                    <td>
                      <div className="flex justify-center">
                        <div className={`py-1 px-2 rounded-full text-xs font-medium whitespace-nowrap ${BADGE[r.status]}`}>{titleCase(r.status)}</div>
                      </div>
                    </td>
                    <td className="whitespace-nowrap">{formatDateTime(r.started_at)}</td>
                    <td className="whitespace-nowrap">{formatDateTime(r.finalized_at)}</td>
                    <td>{r.notes || "—"}</td>
                    <td className="table-report__action">
                      <div className="flex justify-center">
                        <Tippy
                          tag="a"
                          href=""
                          content={r.status === "open" ? "Count" : "View"}
                          onClick={(e) => {
                            e.preventDefault();
                            setOpen(r);
                          }}
                        >
                          <Lucide icon={r.status === "open" ? "Edit" : "Eye"} className="w-4 h-4 text-slate-500 hover:text-primary" />
                        </Tippy>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {!loading && total > 0 && (
          <Pager page={page} pageSize={pageSize} total={total} onPage={setPage} onPageSize={(s) => { setPage(0); setPageSize(s); }} />
        )}
      </div>

      {starting && (
        <StartModal
          branches={branches}
          isAdmin={isAdmin}
          onClose={() => setStarting(false)}
          onStarted={(t) => {
            setStarting(false);
            setNotice(`Stock-take ${t.take_number} started.`);
            reload();
            setOpen(t);
          }}
        />
      )}
      {open && (
        <StockTakeDetail
          take={open}
          branchName={branchName(open.branch_id)}
          canEdit={canEdit}
          onClose={() => {
            setOpen(null);
            reload();
          }}
          onFinalized={(msg) => setNotice(msg)}
        />
      )}
    </div>
  );
}

function StartModal({ branches, isAdmin, onClose, onStarted }) {
  const [branch, setBranch] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const submit = async () => {
    setSaving(true);
    setError("");
    const { data, error: err } = await supabase.rpc("start_stock_take", {
      p_branch: branch || null,
      p_notes: nullIfEmpty(notes),
    });
    setSaving(false);
    if (err) return setError(friendlyError(err));
    onStarted(data);
  };

  return (
    <Modal
      title="Start stock-take"
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn btn-outline-secondary" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="btn btn-primary shadow-md" disabled={saving} onClick={submit}>
            {saving ? "Starting..." : "Start"}
          </button>
        </>
      }
    >
      <ErrorBanner message={error} />
      <div className="text-sm text-slate-500 my-3">The current quantity of every active item is snapshotted as the system quantity.</div>
      <div className="grid grid-cols-12 gap-4">
        {isAdmin && (
          <Field label="Branch" className="col-span-12">
            <BranchSelect branches={branches} value={branch} onChange={setBranch} allLabel="All branches" className="form-select box w-full" />
          </Field>
        )}
        <Field label="Notes" className="col-span-12">
          <textarea rows={2} className="form-control box w-full" value={notes} onChange={(e) => setNotes(e.target.value)} />
        </Field>
      </div>
    </Modal>
  );
}
