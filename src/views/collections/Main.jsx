import { useEffect, useState } from "react";
import classnames from "classnames";
import { supabase } from "@/lib/supabase";
import { getSession, can } from "@/lib/session";
import { friendlyError } from "@/lib/errors";
import { ErrorBanner, useToast } from "@/views/payments/components/shared";
import AgentView from "./components/AgentView";
import CollectorsTab from "./components/CollectorsTab";
import AssignTab from "./components/AssignTab";
import HandoversTab from "./components/HandoversTab";

const TABS = [
  ["collectors", "Collectors"],
  ["assign", "Assign customers"],
  ["handovers", "Handovers"],
];

function Main() {
  const [mode, setMode] = useState("loading"); // loading | agent | office | none
  const [session, setSession] = useState(null);
  const [summary, setSummary] = useState(null);
  const [error, setError] = useState("");
  const [tab, setTab] = useState("collectors");
  const [collectors, setCollectors] = useState([]);
  const [refreshKey, setRefreshKey] = useState(0);
  const toast = useToast();

  useEffect(() => {
    let alive = true;
    (async () => {
      const s = await getSession();
      if (!alive) return;
      setSession(s);
      // A non-collector gets null (or an error): fall through to the office view.
      const { data } = await supabase.rpc("get_my_collection_summary");
      if (!alive) return;
      if (data) {
        setSummary(data);
        setMode("agent");
      } else if (s && can(s, "collections", "view")) {
        setMode("office");
      } else {
        setMode("none");
      }
    })().catch((e) => {
      if (alive) {
        setError(friendlyError(e));
        setMode("none");
      }
    });
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (mode !== "office") return;
    supabase
      .from("v_collector_cash")
      .select("collector_id,full_name,cash_in_hand")
      .order("full_name")
      .then(({ data, error: err }) => {
        if (err) setError(friendlyError(err));
        else setCollectors(data || []);
      });
  }, [mode, refreshKey]);

  const canEdit = session ? can(session, "collections", "edit") : false;
  const bump = () => setRefreshKey((k) => k + 1);

  return (
    <>
      <div className="flex items-center mt-8 mb-4">
        <h2 className="text-lg font-medium mr-auto">{mode === "agent" ? "My collection" : "Field collection"}</h2>
      </div>
      <ErrorBanner message={mode === "agent" || mode === "office" ? "" : error} />
      {mode === "loading" && <div className="box p-8 text-center text-slate-500">Loading...</div>}
      {mode === "none" && (
        <div className="box p-8 text-center text-slate-500">You do not have access to field collection.</div>
      )}
      {mode === "agent" && <AgentView initialSummary={summary} onToast={toast.show} />}
      {mode === "office" && (
        <>
          <ErrorBanner message={error} onClose={() => setError("")} />
          <div className="flex gap-1 mb-4 border-b border-slate-200/60 dark:border-darkmode-400 overflow-x-auto">
            {TABS.map(([k, l]) => (
              <button
                key={k}
                type="button"
                onClick={() => setTab(k)}
                className={classnames(
                  "px-4 py-2 -mb-px border-b-2 whitespace-nowrap",
                  tab === k ? "border-primary text-primary font-medium" : "border-transparent text-slate-500"
                )}
              >
                {l}
              </button>
            ))}
          </div>
          {tab === "collectors" && <CollectorsTab refreshKey={refreshKey} />}
          {tab === "assign" && (
            <AssignTab collectors={collectors} canEdit={canEdit} onToast={toast.show} onChanged={bump} />
          )}
          {tab === "handovers" && (
            <HandoversTab
              collectors={collectors}
              canEdit={canEdit}
              onToast={toast.show}
              onChanged={bump}
              refreshKey={refreshKey}
            />
          )}
        </>
      )}
      {toast.node}
    </>
  );
}

export default Main;
