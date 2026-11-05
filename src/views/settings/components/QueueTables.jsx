import classnames from "classnames";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { friendlyError } from "@/lib/errors";
import { formatDateTime, titleCase } from "@/lib/format";

const BADGE = {
  sent: "bg-success/20 text-success",
  failed: "bg-danger/20 text-danger",
  pending: "bg-warning/20 text-warning",
  skipped: "bg-slate-200 text-slate-500",
  queued: "bg-warning/20 text-warning",
};
const Badge = ({ s }) => (
  <span className={classnames("py-1 px-2 rounded-full text-xs font-medium", BADGE[s])}>{titleCase(s)}</span>
);

function Pager({ page, setPage, total, size }) {
  const pages = Math.max(1, Math.ceil(total / size));
  return (
    <div className="flex items-center mt-3 text-sm text-slate-500">
      <span>{total} row(s) - page {page} of {pages}</span>
      <div className="ml-auto flex gap-2">
        <button type="button" className="btn btn-outline-secondary btn-sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>Prev</button>
        <button type="button" className="btn btn-outline-secondary btn-sm" disabled={page >= pages} onClick={() => setPage(page + 1)}>Next</button>
      </div>
    </div>
  );
}

function usePaged(table, select, filterFn, deps, size = 10) {
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const key = JSON.stringify(deps);

  useEffect(() => {
    setPage(1);
  }, [key]);

  useEffect(() => {
    (async () => {
      setLoading(true);
      let q = supabase.from(table).select(select, { count: "exact" });
      q = filterFn(q);
      const from = (page - 1) * size;
      const { data, count, error: err } = await q.order("created_at", { ascending: false }).range(from, from + size - 1);
      setError(err ? friendlyError(err) : "");
      setRows(data || []);
      setTotal(count || 0);
      setLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, key]);

  return { rows, total, page, setPage, loading, error };
}

function QueueTables({ refreshKey }) {
  const [qStatus, setQStatus] = useState("");
  const queue = usePaged(
    "notification_queue",
    "id, kind, to_email, subject, status, attempts, error, created_at",
    (q) => (qStatus ? q.eq("status", qStatus) : q),
    [qStatus, refreshKey]
  );
  const logs = usePaged(
    "notification_logs",
    "id, channel, recipient, subject, status, error, created_at",
    (q) => q,
    [refreshKey]
  );

  return (
    <>
      <div className="intro-y box p-5">
        <div className="flex items-center mb-4">
          <div className="text-base font-medium">E-mail queue</div>
          <select className="form-select box w-40 ml-auto" value={qStatus} onChange={(e) => setQStatus(e.target.value)}>
            <option value="">All statuses</option>
            {["pending", "sent", "failed", "skipped"].map((s) => (
              <option key={s} value={s}>{titleCase(s)}</option>
            ))}
          </select>
        </div>
        {queue.error && <div className="alert alert-danger show mb-3 text-sm">{queue.error}</div>}
        {queue.loading ? (
          <div className="text-slate-500 text-sm">Loading queue...</div>
        ) : queue.rows.length === 0 ? (
          <div className="text-slate-500 text-sm">The queue is empty.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="table w-full text-sm min-w-[800px]">
              <thead>
                <tr><th>KIND</th><th>RECIPIENT</th><th>SUBJECT</th><th>STATUS</th><th className="text-right">ATTEMPTS</th><th>ERROR</th><th>CREATED</th></tr>
              </thead>
              <tbody>
                {queue.rows.map((r) => (
                  <tr key={r.id}>
                    <td>{titleCase(r.kind)}</td>
                    <td>{r.to_email}</td>
                    <td>{r.subject}</td>
                    <td><Badge s={r.status} /></td>
                    <td className="text-right">{r.attempts}</td>
                    <td className="text-danger">{r.error || ""}</td>
                    <td className="whitespace-nowrap">{formatDateTime(r.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <Pager page={queue.page} setPage={queue.setPage} total={queue.total} size={10} />
      </div>

      <div className="intro-y box p-5">
        <div className="text-base font-medium mb-4">Sent log</div>
        {logs.error && <div className="alert alert-danger show mb-3 text-sm">{logs.error}</div>}
        {logs.loading ? (
          <div className="text-slate-500 text-sm">Loading log...</div>
        ) : logs.rows.length === 0 ? (
          <div className="text-slate-500 text-sm">Nothing has been sent yet.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="table w-full text-sm min-w-[700px]">
              <thead>
                <tr><th>DATE</th><th>RECIPIENT</th><th>SUBJECT</th><th>STATUS</th><th>ERROR</th></tr>
              </thead>
              <tbody>
                {logs.rows.map((r) => (
                  <tr key={r.id}>
                    <td className="whitespace-nowrap">{formatDateTime(r.created_at)}</td>
                    <td>{r.recipient}</td>
                    <td>{r.subject || "—"}</td>
                    <td><Badge s={r.status} /></td>
                    <td className="text-danger">{r.error || ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <Pager page={logs.page} setPage={logs.setPage} total={logs.total} size={10} />
      </div>
    </>
  );
}

export default QueueTables;
