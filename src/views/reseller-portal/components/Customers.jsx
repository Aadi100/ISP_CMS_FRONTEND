import { useEffect, useState } from "react";
import classnames from "classnames";
import { supabase } from "@/lib/supabase";
import { friendlyError } from "@/lib/errors";
import { money, titleCase } from "@/lib/format";
import { ErrorBanner, Pagination, likeSafe } from "@/views/payments/components/shared";

const STATUSES = ["active", "suspended", "pending", "terminated"];
const TONE = {
  active: "bg-success/20 text-success",
  suspended: "bg-warning/20 text-warning",
  terminated: "bg-danger/20 text-danger",
};

export default function Customers({ onInvoices }) {
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(10);
  const [search, setSearch] = useState("");
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const t = setTimeout(() => {
      setQ(search);
      setPage(0);
    }, 300);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    let query = supabase
      .from("v_subscriber_overview")
      .select("id, subscriber_code, full_name, phone, connection_status, package_name, area_name, outstanding_balance", {
        count: "exact",
      })
      .order("full_name")
      .range(page * pageSize, page * pageSize + pageSize - 1);
    if (status) query = query.eq("connection_status", status);
    const s = likeSafe(q);
    if (s) query = query.or(`full_name.ilike.%${s}%,phone.ilike.%${s}%,subscriber_code.ilike.%${s}%`);
    query.then(({ data, count, error: err }) => {
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
  }, [q, status, page, pageSize]);

  return (
    <div>
      <div className="flex flex-col sm:flex-row gap-2 mb-4">
        <input
          className="form-control sm:w-72"
          placeholder="Search name, phone or code"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select
          className="form-select sm:w-48"
          value={status}
          onChange={(e) => {
            setStatus(e.target.value);
            setPage(0);
          }}
        >
          <option value="">All statuses</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {titleCase(s)}
            </option>
          ))}
        </select>
      </div>
      <ErrorBanner message={error} onClose={() => setError("")} />
      <div className="box overflow-x-auto">
        <table className="table table-report">
          <thead>
            <tr>
              <th>Customer</th>
              <th>Phone</th>
              <th>Package</th>
              <th>Status</th>
              <th className="text-right">Outstanding</th>
              <th className="text-center">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={6} className="text-center text-slate-500 py-6">Loading...</td>
              </tr>
            )}
            {!loading && rows.length === 0 && (
              <tr>
                <td colSpan={6} className="text-center text-slate-500 py-6">No customers found.</td>
              </tr>
            )}
            {!loading &&
              rows.map((r) => (
                <tr key={r.id}>
                  <td>
                    <div className="font-medium whitespace-nowrap">{r.full_name}</div>
                    <div className="text-slate-500 text-xs">{r.subscriber_code}{r.area_name ? ` - ${r.area_name}` : ""}</div>
                  </td>
                  <td className="whitespace-nowrap">{r.phone || "-"}</td>
                  <td className="whitespace-nowrap">{r.package_name || "-"}</td>
                  <td>
                    <span className={classnames("py-1 px-2 rounded-full text-xs font-medium whitespace-nowrap", TONE[r.connection_status] || "bg-slate-200 text-slate-500")}>
                      {titleCase(r.connection_status)}
                    </span>
                  </td>
                  <td className={classnames("text-right whitespace-nowrap", Number(r.outstanding_balance) > 0 && "text-danger font-medium")}>
                    {money(r.outstanding_balance)}
                  </td>
                  <td className="text-center">
                    <button type="button" className="btn btn-outline-secondary btn-sm" onClick={() => onInvoices(r.subscriber_code)}>
                      Invoices
                    </button>
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
