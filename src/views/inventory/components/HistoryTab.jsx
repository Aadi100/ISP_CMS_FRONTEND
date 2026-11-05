import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { friendlyError } from "@/lib/errors";
import { formatDateTime } from "@/lib/format";
import { Empty, ErrorBanner, Field, Pager, Spinner, SubscriberSelect, qty } from "./shared";

/** Everything installed / used at one customer, newest first. */
export function SubscriberHistory({ subscriberId, compact = false }) {
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(compact ? 10 : 25);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data, count, error: err } = await supabase
        .from("v_subscriber_inventory_history")
        .select("*", { count: "exact" })
        .eq("subscriber_id", subscriberId)
        .order("occurred_at", { ascending: false })
        .range(page * pageSize, page * pageSize + pageSize - 1);
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
  }, [subscriberId, page, pageSize]);

  if (loading) return <div className="text-sm text-slate-500">Loading...</div>;
  return (
    <div>
      <ErrorBanner message={error} />
      {rows.length === 0 ? (
        <div className="text-sm text-slate-500">Nothing has been installed or used at this customer yet.</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="table w-full min-w-[640px]">
            <thead>
              <tr>
                <th>WHEN</th>
                <th>TYPE</th>
                <th>ITEM</th>
                <th className="text-right">QTY</th>
                <th>ACTION</th>
                <th>TECHNICIAN</th>
                <th>REF</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={`${r.occurred_at}-${i}`}>
                  <td className="whitespace-nowrap">{formatDateTime(r.occurred_at)}</td>
                  <td>{r.kind === "material" ? "Material" : "Equipment"}</td>
                  <td>{r.item_name}</td>
                  <td className="text-right whitespace-nowrap">
                    {qty(r.quantity)} {r.unit}
                  </td>
                  <td>{r.action}</td>
                  <td>{r.technician_name || "—"}</td>
                  <td>{r.reference || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {total > pageSize || page > 0 ? (
        <Pager page={page} pageSize={pageSize} total={total} onPage={setPage} onPageSize={(s) => { setPage(0); setPageSize(s); }} />
      ) : null}
    </div>
  );
}

export default function HistoryTab({ initialSubscriber }) {
  const [subscriber, setSubscriber] = useState(initialSubscriber || null);
  return (
    <div className="grid grid-cols-12 gap-6">
      <div className="col-span-12">
        <h2 className="text-lg font-medium">Customer history</h2>
        <div className="text-slate-500 mt-1">Everything installed or used at a customer's premises, newest first.</div>
      </div>
      <div className="col-span-12">
        <div className="box p-5 grid grid-cols-12 gap-4">
          <Field label="Customer" className="col-span-12 lg:col-span-6">
            <SubscriberSelect value={subscriber} onChange={setSubscriber} />
          </Field>
        </div>
      </div>
      <div className="col-span-12">
        {!subscriber ? (
          <Empty text="Choose a customer to see their inventory history." icon="User" />
        ) : (
          <div className="box p-5">
            <SubscriberHistory key={subscriber.id} subscriberId={subscriber.id} />
          </div>
        )}
      </div>
    </div>
  );
}

export { Spinner };
