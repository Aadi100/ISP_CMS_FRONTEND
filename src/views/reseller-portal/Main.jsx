import { useCallback, useEffect, useState } from "react";
import classnames from "classnames";
import { supabase } from "@/lib/supabase";
import { friendlyError } from "@/lib/errors";
import { ErrorBanner } from "@/views/payments/components/shared";
import Dashboard from "./components/Dashboard";
import Customers from "./components/Customers";
import Invoices from "./components/Invoices";
import Wallet from "./components/Wallet";
import Commission from "./components/Commission";
import Support from "./components/Support";

const TABS = [
  ["dashboard", "Dashboard"],
  ["customers", "My customers"],
  ["invoices", "Invoices"],
  ["wallet", "Wallet"],
  ["commission", "Commission"],
  ["support", "Support"],
];

function Main() {
  const [summary, setSummary] = useState(undefined); // undefined = loading, null = not a reseller
  const [error, setError] = useState("");
  const [tab, setTab] = useState("dashboard");
  const [invoiceSearch, setInvoiceSearch] = useState("");
  const [invoiceKey, setInvoiceKey] = useState(0);

  const loadSummary = useCallback(async () => {
    const { data, error: err } = await supabase.rpc("get_my_reseller_summary");
    if (err) {
      setError(friendlyError(err));
      setSummary((s) => (s === undefined ? null : s));
    } else {
      setError("");
      setSummary(data || null);
    }
  }, []);

  useEffect(() => {
    loadSummary();
  }, [loadSummary]);

  const openInvoices = (code) => {
    setInvoiceSearch(code || "");
    setInvoiceKey((k) => k + 1);
    setTab("invoices");
  };

  return (
    <>
      <div className="intro-y flex items-center mt-8">
        <h2 className="text-lg font-medium mr-auto">Reseller Portal</h2>
        {summary && <div className="text-slate-500 text-sm">{summary.name}</div>}
      </div>
      <div className="mt-4">
        <ErrorBanner message={error} onClose={() => setError("")} />
        {summary === undefined && <div className="box p-6 text-slate-500">Loading...</div>}
        {summary === null && !error && (
          <div className="box p-6 text-center text-slate-500">This page is for reseller accounts.</div>
        )}
        {summary && (
          <>
            <div className="flex overflow-x-auto gap-1 border-b border-slate-200/60 dark:border-darkmode-400 mb-5">
              {TABS.map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setTab(key)}
                  className={classnames(
                    "px-4 py-2 text-sm whitespace-nowrap border-b-2 -mb-px",
                    tab === key ? "border-primary text-primary font-medium" : "border-transparent text-slate-500"
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
            {tab === "dashboard" && <Dashboard summary={summary} />}
            {tab === "customers" && <Customers onInvoices={openInvoices} />}
            {tab === "invoices" && (
              <Invoices
                key={invoiceKey}
                initialSearch={invoiceSearch}
                walletBalance={summary.wallet_balance}
                onChanged={loadSummary}
              />
            )}
            {tab === "wallet" && <Wallet summary={summary} onChanged={loadSummary} />}
            {tab === "commission" && <Commission summary={summary} />}
            {tab === "support" && <Support />}
          </>
        )}
      </div>
    </>
  );
}

export default Main;
