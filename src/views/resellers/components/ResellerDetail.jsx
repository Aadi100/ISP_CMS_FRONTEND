import { Lucide } from "@/base-components";
import classnames from "classnames";
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { friendlyError } from "@/lib/errors";
import PortalLogin from "./PortalLogin";
import { money, formatDate, formatDateTime, titleCase } from "@/lib/format";

const TXN_BADGE = {
  recharge: "bg-success/20 text-success",
  commission: "bg-success/20 text-success",
  invoice_payment: "bg-danger/20 text-danger",
  refund: "bg-success/20 text-success",
  deduction: "bg-danger/20 text-danger",
  adjustment: "bg-warning/20 text-warning",
};

function Loading() {
  return <div className="p-6 text-center text-slate-500 text-sm">Loading...</div>;
}

function Empty({ text }) {
  return <div className="p-6 text-center text-slate-500 text-sm">{text}</div>;
}

// Right-hand drawer: profile + subscribers / collections this month / wallet ledger.
// `refreshKey` changes whenever a wallet transaction was posted so the ledger reloads.
function ResellerDetail({ reseller, refreshKey, canEdit, canInvite, onClose, onWallet }) {
  const [tab, setTab] = useState("ledger");
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    setRows([]);
    try {
      let q;
      if (tab === "ledger") {
        q = supabase
          .from("reseller_wallet_transactions")
          .select("id, txn_type, amount, balance_after, reference, notes, created_at")
          .eq("reseller_id", reseller.id)
          .order("created_at", { ascending: false })
          .limit(200);
      } else if (tab === "subscribers") {
        q = supabase
          .from("subscribers")
          .select("id, subscriber_code, full_name, phone, connection_status, monthly_fee")
          .eq("reseller_id", reseller.id)
          .order("full_name")
          .limit(200);
      } else {
        const start = new Date();
        start.setDate(1);
        start.setHours(0, 0, 0, 0);
        q = supabase
          .from("payments")
          .select("id, receipt_number, amount, method, paid_at, subscribers(full_name)")
          .eq("reseller_id", reseller.id)
          .eq("status", "confirmed")
          .gte("paid_at", start.toISOString())
          .order("paid_at", { ascending: false })
          .limit(200);
      }
      const { data, error: err } = await q;
      if (err) throw err;
      setRows(data || []);
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setLoading(false);
    }
  }, [tab, reseller.id]);

  useEffect(() => {
    load();
  }, [load, refreshKey]);

  const tabs = [
    ["ledger", "Wallet ledger"],
    ["subscribers", `Subscribers (${reseller.subscribers_count ?? 0})`],
    ["collections", "Collections this month"],
  ];

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/60" onClick={onClose}></div>
      <div className="relative box w-full max-w-2xl h-full overflow-y-auto p-6 rounded-none">
        <div className="flex items-center mb-4">
          <div>
            <h2 className="text-lg font-medium">{reseller.name}</h2>
            <div className="text-slate-500 text-xs">{reseller.reseller_code}</div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="ml-auto text-slate-500 hover:text-slate-700"
            aria-label="Close"
          >
            <Lucide icon="X" className="w-5 h-5" />
          </button>
        </div>

        <div className="grid grid-cols-2 gap-y-3 gap-x-4 text-sm">
          {[
            ["Company", reseller.company_name],
            ["Owner", reseller.owner_name],
            ["CNIC", reseller.cnic],
            ["Phone", reseller.phone],
            ["Email", reseller.email],
            ["Area", reseller.area_name],
            ["Wholesale package", reseller.package_name],
            ["Status", titleCase(reseller.status)],
            ["Subscribers", reseller.subscribers_count],
            ["Collections this month", money(reseller.monthly_collections)],
            ["Last recharge", formatDateTime(reseller.last_recharge_at)],
            ["Low-wallet threshold", money(reseller.low_wallet_threshold)],
            ["Commission", `${Number(reseller.commission_percent || 0)}%`],
          ].map(([k, v]) => (
            <div key={k}>
              <div className="text-slate-500 text-xs">{k}</div>
              <div className="font-medium break-words">{v || v === 0 ? v : "—"}</div>
            </div>
          ))}
          {reseller.notes && (
            <div className="col-span-2">
              <div className="text-slate-500 text-xs">Notes</div>
              <div className="font-medium">{reseller.notes}</div>
            </div>
          )}
        </div>

        <div className="box p-4 mt-5 flex items-center bg-slate-50 dark:bg-darkmode-600">
          <div>
            <div className="text-slate-500 text-xs">Wallet balance</div>
            <div
              className={classnames(
                "text-xl font-medium",
                reseller.is_low_wallet ? "text-danger" : "text-success"
              )}
            >
              {money(reseller.wallet_balance)}
            </div>
          </div>
          {canEdit && (
            <div className="ml-auto flex flex-wrap gap-2">
              <button type="button" className="btn btn-primary btn-sm" onClick={() => onWallet("recharge")}>
                Recharge
              </button>
              <button type="button" className="btn btn-outline-secondary btn-sm" onClick={() => onWallet("deduction")}>
                Deduct
              </button>
              <button type="button" className="btn btn-outline-secondary btn-sm" onClick={() => onWallet("adjustment")}>
                Adjust (+/-)
              </button>
            </div>
          )}
        </div>

        <PortalLogin reseller={reseller} canInvite={canInvite} />

        <div className="flex flex-wrap gap-2 mt-5">
          {tabs.map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setTab(key)}
              className={classnames(
                "py-1.5 px-3 rounded-full text-xs font-medium",
                tab === key
                  ? "bg-primary text-white"
                  : "bg-slate-100 text-slate-600 dark:bg-darkmode-400 dark:text-slate-300"
              )}
            >
              {label}
            </button>
          ))}
        </div>

        {error && <div className="alert alert-danger show mt-3 text-sm">{error}</div>}

        <div className="overflow-x-auto mt-3">
          {loading ? (
            <Loading />
          ) : tab === "ledger" ? (
            rows.length === 0 ? (
              <Empty text="No wallet transactions yet." />
            ) : (
              <table className="table w-full text-sm">
                <thead>
                  <tr>
                    <th className="whitespace-nowrap">DATE</th>
                    <th>TYPE</th>
                    <th className="text-right">AMOUNT</th>
                    <th className="text-right whitespace-nowrap">BALANCE AFTER</th>
                    <th>REFERENCE / NOTES</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((t) => (
                    <tr key={t.id}>
                      <td className="whitespace-nowrap">{formatDateTime(t.created_at)}</td>
                      <td>
                        <span className={classnames("py-1 px-2 rounded-full text-xs font-medium", TXN_BADGE[t.txn_type])}>
                          {titleCase(t.txn_type)}
                        </span>
                      </td>
                      <td className={classnames("text-right whitespace-nowrap", Number(t.amount) < 0 ? "text-danger" : "text-success")}>
                        {Number(t.amount) > 0 ? "+" : ""}
                        {money(t.amount)}
                      </td>
                      <td className="text-right whitespace-nowrap">{money(t.balance_after)}</td>
                      <td>
                        {[t.reference, t.notes].filter(Boolean).join(" - ") || "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )
          ) : tab === "subscribers" ? (
            rows.length === 0 ? (
              <Empty text="No subscribers are linked to this reseller." />
            ) : (
              <table className="table w-full text-sm">
                <thead>
                  <tr>
                    <th>CODE</th>
                    <th>NAME</th>
                    <th>PHONE</th>
                    <th>STATUS</th>
                    <th className="text-right">MONTHLY FEE</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((s) => (
                    <tr key={s.id}>
                      <td className="whitespace-nowrap">{s.subscriber_code}</td>
                      <td>{s.full_name}</td>
                      <td className="whitespace-nowrap">{s.phone}</td>
                      <td>{titleCase(s.connection_status)}</td>
                      <td className="text-right whitespace-nowrap">{money(s.monthly_fee)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )
          ) : rows.length === 0 ? (
            <Empty text="No confirmed collections this month." />
          ) : (
            <table className="table w-full text-sm">
              <thead>
                <tr>
                  <th>DATE</th>
                  <th>RECEIPT</th>
                  <th>SUBSCRIBER</th>
                  <th>METHOD</th>
                  <th className="text-right">AMOUNT</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((p) => (
                  <tr key={p.id}>
                    <td className="whitespace-nowrap">{formatDate(p.paid_at)}</td>
                    <td className="whitespace-nowrap">{p.receipt_number}</td>
                    <td>{p.subscribers?.full_name || "—"}</td>
                    <td>{titleCase(p.method)}</td>
                    <td className="text-right whitespace-nowrap">{money(p.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}

export default ResellerDetail;
