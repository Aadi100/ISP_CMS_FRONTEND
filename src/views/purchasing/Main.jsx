import { useCallback, useEffect, useState } from "react";
import classnames from "classnames";
import { supabase } from "@/lib/supabase";
import { can } from "@/lib/session";
import { useSession, useToast, loadBranches } from "./components/common";
import Summary from "./components/Summary";
import OrdersTab from "./components/OrdersTab";
import SuppliersTab from "./components/SuppliersTab";
import OrderDetail from "./components/OrderDetail";

function Main() {
  const session = useSession();
  const [tab, setTab] = useState("orders");
  const [branches, setBranches] = useState([]);
  const [refreshKey, setRefreshKey] = useState(0);
  const [openPo, setOpenPo] = useState(null);
  const toast = useToast();

  useEffect(() => {
    if (session) loadBranches(supabase, session).then(setBranches).catch(() => {});
  }, [session]);

  const refresh = useCallback(() => setRefreshKey((k) => k + 1), []);

  if (!session) return <div className="intro-y mt-10 text-slate-500">Loading…</div>;

  const perms = {
    create: can(session, "purchasing", "create"),
    edit: can(session, "purchasing", "edit"),
    del: can(session, "purchasing", "delete"),
  };

  if (!can(session, "purchasing", "view")) {
    return <div className="intro-y box p-5 mt-5 text-slate-500">You do not have access to Purchasing.</div>;
  }

  return (
    <>
      <div className="intro-y flex items-center mt-8 mb-5">
        <h2 className="text-lg font-medium mr-auto">Purchasing</h2>
      </div>
      <Summary refreshKey={refreshKey} />
      <div className="intro-y flex border-b border-slate-200/60 dark:border-darkmode-400 mb-5">
        {[
          ["orders", "Purchase orders"],
          ["suppliers", "Suppliers"],
        ].map(([k, label]) => (
          <button
            key={k}
            type="button"
            onClick={() => setTab(k)}
            className={classnames(
              "px-5 py-3 -mb-px border-b-2 font-medium",
              tab === k ? "border-primary text-primary" : "border-transparent text-slate-500"
            )}
          >
            {label}
          </button>
        ))}
      </div>
      {tab === "orders" ? (
        <OrdersTab
          session={session}
          perms={perms}
          branches={branches}
          refreshKey={refreshKey}
          onOpen={setOpenPo}
          toast={toast}
        />
      ) : (
        <SuppliersTab perms={perms} refreshKey={refreshKey} onChanged={refresh} onOpen={setOpenPo} toast={toast} />
      )}
      {openPo && (
        <OrderDetail
          poId={openPo}
          perms={perms}
          onClose={() => setOpenPo(null)}
          onChanged={refresh}
          toast={toast}
        />
      )}
      {toast.node}
    </>
  );
}

export default Main;
