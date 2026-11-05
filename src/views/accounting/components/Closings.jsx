import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { friendlyError } from "@/lib/errors";
import { money, formatDate } from "@/lib/format";
import { ErrorBanner, Pagination, Loading, Empty, BranchSelect } from "./common";

export default function Closings({ branches }) {
  const [rows, setRows] = useState([]);
  const [names, setNames] = useState({});
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(10);
  const [branch, setBranch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      let q = supabase.from("daily_closings").select("*", { count: "exact" });
      if (branch) q = q.eq("branch_id", branch);
      const { data, error: err, count } = await q
        .order("closing_date", { ascending: false })
        .range(page * pageSize, page * pageSize + pageSize - 1);
      if (err) throw err;
      setRows(data || []);
      setTotal(count || 0);
      const ids = [...new Set((data || []).map((r) => r.closed_by).filter(Boolean))];
      if (ids.length) {
        const { data: ps } = await supabase.from("profiles").select("id,full_name").in("id", ids);
        setNames(Object.fromEntries((ps || []).map((p) => [p.id, p.full_name])));
      }
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setLoading(false);
    }
  }, [branch, page, pageSize]);
  useEffect(() => {
    load();
  }, [load]);

  const branchName = (id) => branches.find((b) => b.id === id)?.name || (id ? "Branch" : "All");

  return (
    <div>
      <div className="flex items-center mb-3">
        <div className="ml-auto">
          <BranchSelect
            branches={branches}
            value={branch}
            onChange={(v) => {
              setBranch(v);
              setPage(0);
            }}
          />
        </div>
      </div>
      <ErrorBanner message={error} onClose={() => setError("")} />
      {loading ? (
        <Loading />
      ) : rows.length === 0 ? (
        <div className="box">
          <Empty text="No days have been closed yet." />
        </div>
      ) : (
        <div className="box overflow-x-auto">
          <table className="table table-report -mt-2">
            <thead>
              <tr>
                <th>Date</th>
                <th>Branch</th>
                <th className="text-right">Opening</th>
                <th className="text-right">In</th>
                <th className="text-right">Out</th>
                <th className="text-right">Expected</th>
                <th className="text-right">Counted</th>
                <th className="text-right">Difference</th>
                <th>Notes</th>
                <th>Closed by</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="intro-x">
                  <td className="whitespace-nowrap">{formatDate(r.closing_date)}</td>
                  <td className="whitespace-nowrap">{branchName(r.branch_id)}</td>
                  <td className="text-right">{money(r.opening_cash)}</td>
                  <td className="text-right">{money(r.cash_in)}</td>
                  <td className="text-right">{money(r.cash_out)}</td>
                  <td className="text-right">{money(r.expected_cash)}</td>
                  <td className="text-right">{money(r.counted_cash)}</td>
                  <td
                    className={`text-right font-medium ${Number(r.difference) === 0 ? "text-success" : Number(r.difference) < 0 ? "text-danger" : "text-warning"}`}
                  >
                    {money(r.difference)}
                  </td>
                  <td className="text-slate-500">{r.notes || "-"}</td>
                  <td className="whitespace-nowrap">{names[r.closed_by] || "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
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
