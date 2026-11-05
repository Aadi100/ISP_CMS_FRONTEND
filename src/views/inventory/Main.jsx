import { Lucide } from "@/base-components";
import classnames from "classnames";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { can, getSession } from "@/lib/session";
import { friendlyError } from "@/lib/errors";
import EquipmentTab from "./components/EquipmentTab";
import HistoryTab from "./components/HistoryTab";
import InstallationsTab from "./components/InstallationsTab";
import OverviewTab from "./components/OverviewTab";
import RmaTab from "./components/RmaTab";
import StockTab from "./components/StockTab";
import StockTakeTab from "./components/StockTakeTab";
import TransfersTab from "./components/TransfersTab";
import { ErrorBanner, Spinner } from "./components/shared";

const TABS = [
  { key: "overview", label: "Overview", icon: "LayoutDashboard" },
  { key: "equipment", label: "Equipment", icon: "Package" },
  { key: "stock", label: "Stock Items", icon: "Layers" },
  { key: "installations", label: "Installations", icon: "Wrench" },
  { key: "transfers", label: "Transfers", icon: "Truck" },
  { key: "stocktake", label: "Stock-take", icon: "ClipboardList" },
  { key: "rma", label: "Warranty Returns", icon: "RotateCcw" },
  { key: "history", label: "Customer History", icon: "Clock" },
];

function Main() {
  const [session, setSession] = useState(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const [tab, setTab] = useState("overview");
  const [branches, setBranches] = useState([]);
  const [employees, setEmployees] = useState([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const s = await getSession();
        if (cancelled) return;
        setSession(s);
        if (s && can(s, "inventory", "view")) {
          const [b, e] = await Promise.all([
            s.branchId ? { data: [] } : supabase.from("branches").select("id, name").order("name"),
            supabase
              .from("employees")
              .select("id, full_name, department, employment_status")
              .eq("employment_status", "active")
              .order("full_name"),
          ]);
          if (cancelled) return;
          if (b.error || e.error) setError(friendlyError(b.error || e.error));
          setBranches(b.data || []);
          setEmployees(e.data || []);
        }
      } catch (err) {
        if (!cancelled) setError(friendlyError(err));
      } finally {
        if (!cancelled) setReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (!ready) return <Spinner />;
  if (!session || !can(session, "inventory", "view")) {
    return (
      <div className="box p-10 text-center text-slate-500">
        {error || "You do not have permission to view inventory."}
      </div>
    );
  }

  const ctx = { session, branches, employees, isAdmin: !session.branchId };

  return (
    <div className="grid grid-cols-12 gap-6">
      <div className="col-span-12 intro-y">
        <h2 className="text-lg font-medium">Inventory</h2>
        <div className="text-slate-500 mt-1">
          Serial equipment, stock items, installation jobs and what was used at each customer.
        </div>
      </div>
      {error && (
        <div className="col-span-12">
          <ErrorBanner message={error} />
        </div>
      )}
      <div className="col-span-12 intro-y">
        <div className="flex flex-wrap gap-2">
          {TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              className={classnames("btn", tab === t.key ? "btn-primary shadow-md" : "btn-outline-secondary")}
            >
              <Lucide icon={t.icon} className="w-4 h-4 mr-2" /> {t.label}
            </button>
          ))}
        </div>
      </div>
      <div className="col-span-12">
        {tab === "overview" && <OverviewTab goTo={setTab} />}
        {tab === "equipment" && <EquipmentTab ctx={ctx} />}
        {tab === "stock" && <StockTab ctx={ctx} />}
        {tab === "installations" && <InstallationsTab ctx={ctx} />}
        {tab === "transfers" && <TransfersTab ctx={ctx} />}
        {tab === "stocktake" && <StockTakeTab ctx={ctx} />}
        {tab === "rma" && <RmaTab ctx={ctx} />}
        {tab === "history" && <HistoryTab />}
      </div>
    </div>
  );
}

export default Main;
