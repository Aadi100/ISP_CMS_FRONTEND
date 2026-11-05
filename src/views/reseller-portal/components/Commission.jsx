import { useEffect, useState } from "react";
import classnames from "classnames";
import { supabase } from "@/lib/supabase";
import { friendlyError } from "@/lib/errors";
import { formatDate, money, titleCase } from "@/lib/format";
import { ErrorBanner, Pagination, StatCard } from "@/views/payments/components/shared";

const TONE = {
  accrued: "bg-pending/20 text-pending",
  paid: "bg-success/20 text-success",
  cancelled: "bg-slate-200 text-slate-500",
};

export default function Commission({ summary }) {
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(10);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;
    setLoading(true);
    supabase
      .from("reseller_commissions")
      .select("id, base_amount, percent, amount, status, created_at, payments(receipt_number)", { count: "exact" })
      .order("created_at", { ascending: false })
      .range(page * pageSize, page * pageSize + pageSize - 1)
      .then(({ data, count, error: err }) => {
        if (!alive) return;
        if (err) setError(friendlyError(err));
        else {
          setError("");
          setRows(data || []);
          setTotal(count || 0);
        }
        setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [page, pageSize]);

  return (
    <div>
      <div className="grid grid-cols-12 gap-4 mb-4">
        <div className="col-span-12 sm:col-span-6">
          <StatCard icon="Percent" tone="text-pending" value={money(summary.commission_accrued)} label="Total accrued (unpaid)" />
        </div>
        <div className="col-span-12 sm:col-span-6">
          <StatCard icon="CheckCircle" tone="text-success" value={money(summary.commission_paid)} label="Total paid" />
        </div>
      </div>
      <ErrorBanner message={error} onClose={() => setError("")} />
      <div className="box overflow-x-auto">
        <table className="table table-report">
          <thead>
            <tr>
              <th>Date</th>
              <th>Receipt</th>
              <th className="text-right">Base amount</th>
              <th className="text-right">Percent</th>
              <th className="text-right">Commission</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={6} className="text-center text-slate-500 py-6">Loading...</td></tr>}
            {!loading && rows.length === 0 && (
              <tr><td colSpan={6} className="text-center text-slate-500 py-6">No commission yet.</td></tr>
            )}
            {!loading &&
              rows.map((r) => (
                <tr key={r.id}>
                  <td className="whitespace-nowrap">{formatDate(r.created_at)}</td>
                  <td className="whitespace-nowrap">{r.payments?.receipt_number || "-"}</td>
                  <td className="text-right whitespace-nowrap">{money(r.base_amount)}</td>
                  <td className="text-right">{Number(r.percent)}%</td>
                  <td className="text-right whitespace-nowrap font-medium">{money(r.amount)}</td>
                  <td>
                    <span className={classnames("py-1 px-2 rounded-full text-xs font-medium", TONE[r.status])}>
                      {titleCase(r.status)}
                    </span>
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
      <Pagination
        page={page}
        pageSize={pageSize}
        total={total}
        onPage={setPage}
        onPageSize={(n) => {
          setPageSize(n);
          setPage(0);
        }}
      />
    </div>
  );
}
