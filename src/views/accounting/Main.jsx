import { useState } from "react";
import classnames from "classnames";
import { useSession } from "@/views/payments/components/shared";
import { can } from "@/lib/session";
import { useBranches } from "./components/common";
import Overview from "./components/Overview";
import Expenses from "./components/Expenses";
import CashBook from "./components/CashBook";
import ProfitLoss from "./components/ProfitLoss";
import Closings from "./components/Closings";

const TABS = [
  ["overview", "Overview"],
  ["expenses", "Expenses"],
  ["cashbook", "Cash Book"],
  ["pl", "Profit & Loss"],
  ["closings", "Closings History"],
];

function Main() {
  const session = useSession();
  const [tab, setTab] = useState("overview");
  const branches = useBranches(session);

  if (!session) return <div className="p-8 text-slate-500">Loading...</div>;
  if (!can(session, "accounting", "view")) {
    return <div className="box p-8 mt-5 text-center text-slate-500">You do not have access to Accounting.</div>;
  }

  const props = { session, branches };
  return (
    <>
      <div className="intro-y flex items-center mt-8">
        <h2 className="text-lg font-medium mr-auto">Accounting</h2>
      </div>
      <div className="intro-y flex flex-wrap gap-2 mt-4 border-b border-slate-200/60 dark:border-darkmode-400">
        {TABS.map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            className={classnames(
              "px-4 py-2 -mb-px border-b-2 font-medium",
              tab === key ? "border-primary text-primary" : "border-transparent text-slate-500 hover:text-slate-700"
            )}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="mt-5">
        {tab === "overview" && <Overview {...props} />}
        {tab === "expenses" && <Expenses {...props} />}
        {tab === "cashbook" && <CashBook {...props} />}
        {tab === "pl" && <ProfitLoss {...props} />}
        {tab === "closings" && <Closings {...props} />}
      </div>
    </>
  );
}

export default Main;
