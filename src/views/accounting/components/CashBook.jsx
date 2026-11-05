import { useCallback, useEffect, useState } from "react";
import { Lucide } from "@/base-components";
import { supabase } from "@/lib/supabase";
import { can } from "@/lib/session";
import { friendlyError } from "@/lib/errors";
import { money, formatDate } from "@/lib/format";
import {
  ErrorBanner,
  Loading,
  Empty,
  BranchSelect,
  DateRange,
  thisMonth,
  todayISO,
  downloadCsv,
  useToast,
} from "./common";
import CloseDayModal from "./CloseDayModal";

export default function CashBook({ session, branches }) {
  const canClose = can(session, "accounting", "edit") || can(session, "accounting", "create");
  const canExport = can(session, "accounting", "export");
  const toast = useToast();
  const init = thisMonth();
  const [from, setFrom] = useState(init.from);
  const [to, setTo] = useState(init.to);
  const [branch, setBranch] = useState("");
  const [book, setBook] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [closing, setClosing] = useState(null);
  const today = todayISO();

  const load = useCallback(async () => {
    if (!from || !to) return;
    setLoading(true);
    setError("");
    try {
      const { data, error: err } = await supabase.rpc("get_cash_book", {
        p_from: from,
        p_to: to,
        p_branch: branch || null,
      });
      if (err) throw err;
      setBook(data);
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setLoading(false);
    }
  }, [from, to, branch]);
  useEffect(() => {
    load();
  }, [load]);

  const rows = book?.rows || [];
  const sum = (k) => rows.reduce((s, r) => s + Number(r[k] || 0), 0);

  const exportCsv = () =>
    downloadCsv(
      `cash-book-${from}-${to}.csv`,
      ["Date", "Opening", "Cash in", "Cash out", "Closing", "Bank in", "Bank out", "Closed"],
      rows.map((r) => [r.date, r.opening, r.cash_in, r.cash_out, r.closing, r.bank_in, r.bank_out, r.closed ? "Yes" : "No"])
    );

  return (
    <div>
      {toast.node}
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <DateRange from={from} to={to} onFrom={setFrom} onTo={setTo} />
        <BranchSelect branches={branches} value={branch} onChange={setBranch} />
        {canExport && (
          <button type="button" className="btn btn-outline-secondary ml-auto" disabled={!rows.length} onClick={exportCsv}>
            <Lucide icon="Download" className="w-4 h-4 mr-2" /> Export CSV
          </button>
        )}
      </div>
      <ErrorBanner message={error} onClose={() => setError("")} />
      {loading ? (
        <Loading />
      ) : rows.length === 0 ? (
        <div className="box">
          <Empty text="No days in this range." />
        </div>
      ) : (
        <div className="box overflow-x-auto">
          <table className="table table-report -mt-2">
            <thead>
              <tr>
                <th>Date</th>
                <th className="text-right">Opening</th>
                <th className="text-right">Cash in</th>
                <th className="text-right">Cash out</th>
                <th className="text-right">Closing</th>
                <th className="text-right">Bank in</th>
                <th className="text-right">Bank out</th>
                <th className="text-center">Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.date} className="intro-x">
                  <td className="whitespace-nowrap">{formatDate(r.date)}</td>
                  <td className="text-right">{money(r.opening)}</td>
                  <td className="text-right text-success">{money(r.cash_in)}</td>
                  <td className="text-right text-danger">{money(r.cash_out)}</td>
                  <td className="text-right font-medium">{money(r.closing)}</td>
                  <td className="text-right">{money(r.bank_in)}</td>
                  <td className="text-right">{money(r.bank_out)}</td>
                  <td className="text-center whitespace-nowrap">
                    {r.closed ? (
                      <span className="py-1 px-2 rounded-full text-xs bg-success/20 text-success">Closed</span>
                    ) : canClose && r.date <= today ? (
                      <button type="button" className="btn btn-outline-primary btn-sm" onClick={() => setClosing(r)}>
                        Close day
                      </button>
                    ) : (
                      <span className="text-slate-400 text-xs">Open</span>
                    )}
                  </td>
                </tr>
              ))}
              <tr className="font-medium bg-slate-50 dark:bg-darkmode-400">
                <td>Totals</td>
                <td className="text-right">{money(rows[0]?.opening ?? 0)}</td>
                <td className="text-right">{money(book?.total_cash_in ?? sum("cash_in"))}</td>
                <td className="text-right">{money(book?.total_cash_out ?? sum("cash_out"))}</td>
                <td className="text-right">{money(book?.closing_balance ?? rows[rows.length - 1]?.closing ?? 0)}</td>
                <td className="text-right">{money(sum("bank_in"))}</td>
                <td className="text-right">{money(sum("bank_out"))}</td>
                <td></td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
      {closing && (
        <CloseDayModal
          day={closing}
          branch={branch}
          onClose={() => setClosing(null)}
          onDone={(msg) => {
            setClosing(null);
            toast.show(msg);
            load();
          }}
        />
      )}
    </div>
  );
}
