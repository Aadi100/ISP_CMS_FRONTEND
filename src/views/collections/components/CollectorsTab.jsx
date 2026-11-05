import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { friendlyError } from "@/lib/errors";
import { money } from "@/lib/format";
import { ErrorBanner } from "@/views/payments/components/shared";

export default function CollectorsTab({ refreshKey }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;
    setLoading(true);
    supabase
      .from("v_collector_cash")
      .select("*")
      .order("full_name")
      .then(({ data, error: err }) => {
        if (!alive) return;
        if (err) setError(friendlyError(err));
        else {
          setError("");
          setRows(data || []);
        }
        setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [refreshKey]);

  return (
    <div className="box p-5">
      <ErrorBanner message={error} onClose={() => setError("")} />
      <div className="overflow-x-auto">
        <table className="table table-report">
          <thead>
            <tr>
              <th className="whitespace-nowrap">Collector</th>
              <th className="text-right whitespace-nowrap">Customers</th>
              <th className="text-right whitespace-nowrap">Outstanding assigned</th>
              <th className="text-right whitespace-nowrap">Collected (month)</th>
              <th className="text-right whitespace-nowrap">Total collected</th>
              <th className="text-right whitespace-nowrap">Handed over</th>
              <th className="text-right whitespace-nowrap">Pending handover</th>
              <th className="text-right whitespace-nowrap">Cash in hand</th>
              <th className="text-right whitespace-nowrap">Commission (month)</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={9} className="text-center text-slate-500 py-8">
                  Loading...
                </td>
              </tr>
            )}
            {!loading && rows.length === 0 && (
              <tr>
                <td colSpan={9} className="text-center text-slate-500 py-8">
                  No collectors yet. Mark an employee as a collector in HR to see them here.
                </td>
              </tr>
            )}
            {rows.map((r) => (
              <tr key={r.collector_id}>
                <td>
                  <div className="font-medium whitespace-nowrap">{r.full_name}</div>
                  <div className="text-slate-500 text-xs">
                    {r.employee_code} - {Number(r.commission_percent || 0)}% commission
                  </div>
                </td>
                <td className="text-right">{r.customers_assigned}</td>
                <td className="text-right">{money(r.outstanding_assigned)}</td>
                <td className="text-right">{money(r.collected_month)}</td>
                <td className="text-right">{money(r.collected_total)}</td>
                <td className="text-right">{money(r.handed_over)}</td>
                <td className="text-right">{money(r.pending_handover)}</td>
                <td className="text-right font-medium">{money(r.cash_in_hand)}</td>
                <td className="text-right">{money(r.commission_month)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
