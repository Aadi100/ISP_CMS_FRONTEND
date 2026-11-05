import { Lucide } from "@/base-components";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { friendlyError } from "@/lib/errors";
import { ErrorBanner, Spinner } from "./components/ui.jsx";
import Home from "./components/Home.jsx";
import Bills from "./components/Bills.jsx";
import Payments from "./components/Payments.jsx";
import Support from "./components/Support.jsx";
import Details from "./components/Details.jsx";

const TABS = [
  ["home", "Home", "Home"],
  ["bills", "Bills", "FileText"],
  ["payments", "Payments", "CreditCard"],
  ["support", "Support", "LifeBuoy"],
  ["details", "My details", "User"],
];

function Main() {
  const [summary, setSummary] = useState(undefined);
  const [subscriberId, setSubscriberId] = useState(null);
  const [error, setError] = useState("");
  const [tab, setTab] = useState("home");

  useEffect(() => {
    let alive = true;
    (async () => {
      const { data, error: e } = await supabase.rpc("get_my_customer_summary");
      if (!alive) return;
      if (e) {
        setError(friendlyError(e));
        setSummary(null);
        return;
      }
      setSummary(data || null);
      const { data: u } = await supabase.auth.getUser();
      if (u?.user) {
        const { data: p } = await supabase.from("profiles").select("subscriber_id").eq("id", u.user.id).maybeSingle();
        if (alive) setSubscriberId(p?.subscriber_id || null);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  if (summary === undefined) return <div className="p-5"><Spinner /></div>;
  if (!summary)
    return (
      <div className="p-5 max-w-xl mx-auto">
        <ErrorBanner message={error} />
        <div className="box p-8 text-center text-slate-500">This page is for customer accounts</div>
      </div>
    );

  const isp = summary.isp || {};
  const sub = summary.subscriber || {};

  return (
    <div className="max-w-5xl mx-auto p-3 sm:p-5">
      <div className="box p-4 sm:p-5 flex items-center mb-4">
        {isp.logo_url ? (
          <img src={isp.logo_url} alt="" className="w-14 h-14 rounded-full object-cover mr-4 flex-none" />
        ) : (
          <div className="w-14 h-14 rounded-full bg-slate-100 dark:bg-darkmode-300 flex items-center justify-center mr-4 flex-none">
            <Lucide icon="Wifi" className="w-7 h-7 text-primary" />
          </div>
        )}
        <div className="min-w-0">
          <div className="text-lg font-semibold truncate">{isp.name || "Internet Service Provider"}</div>
          <div className="text-slate-500 text-sm truncate">
            {sub.name} {sub.code ? `(${sub.code})` : ""}
          </div>
        </div>
      </div>

      <div className="flex gap-2 overflow-x-auto pb-2 mb-3">
        {TABS.map(([key, label, icon]) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            className={`btn flex-none ${tab === key ? "btn-primary" : "btn-outline-secondary bg-white dark:bg-darkmode-600"}`}
          >
            <Lucide icon={icon} className="w-4 h-4 mr-2" />
            {label}
          </button>
        ))}
      </div>

      {tab === "home" && <Home summary={summary} />}
      {tab === "bills" && <Bills isp={isp} />}
      {tab === "payments" && <Payments isp={isp} />}
      {tab === "support" && <Support subscriberId={subscriberId} />}
      {tab === "details" && <Details summary={summary} />}
    </div>
  );
}

export default Main;
