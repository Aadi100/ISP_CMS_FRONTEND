import { useEffect, useMemo, useState } from "react";
import classnames from "classnames";
import { Lucide } from "@/base-components";
import { supabase } from "@/lib/supabase";
import { getSession, can } from "@/lib/session";
import Collections from "./sections/Collections";
import Revenue from "./sections/Revenue";
import Outstanding from "./sections/Outstanding";
import Advances from "./sections/Advances";
import Subscribers from "./sections/Subscribers";
import Tickets from "./sections/Tickets";
import Inventory from "./sections/Inventory";
import Resellers from "./sections/Resellers";

// which filters each report understands
const TABS = [
  { key: "collections", label: "Collections", icon: "Download", Comp: Collections, f: { date: true, area: true } },
  { key: "revenue", label: "Revenue / Billing", icon: "Wallet", Comp: Revenue, f: { date: true, area: true, branch: true } },
  { key: "outstanding", label: "Outstanding & Overdue", icon: "AlertCircle", Comp: Outstanding, f: { date: true, area: true, branch: true, dateLabel: "Due date" } },
  { key: "advances", label: "Advance Balances", icon: "PiggyBank", Comp: Advances, f: { area: true, branch: true } },
  { key: "subscribers", label: "Subscribers", icon: "Users", Comp: Subscribers, f: { date: true, area: true, branch: true } },
  { key: "tickets", label: "Tickets", icon: "LifeBuoy", Comp: Tickets, f: { date: true, branch: true } },
  { key: "inventory", label: "Inventory", icon: "Package", Comp: Inventory, f: { date: true, branch: true } },
  { key: "resellers", label: "Resellers", icon: "Users", Comp: Resellers, f: { date: true, area: true, branch: true } },
];

function defaultRange() {
  const pad = (n) => String(n).padStart(2, "0");
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth() - 5, 1);
  return {
    from: `${start.getFullYear()}-${pad(start.getMonth() + 1)}-01`,
    to: `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`,
  };
}

function Main() {
  const [session, setSession] = useState(null);
  const [ready, setReady] = useState(false);
  const [tab, setTab] = useState("collections");
  const [areas, setAreas] = useState([]);
  const [branches, setBranches] = useState([]);

  const initial = useMemo(() => ({ ...defaultRange(), areaId: "", branchId: "" }), []);
  const [draft, setDraft] = useState(initial);
  const [applied, setApplied] = useState(initial);

  useEffect(() => {
    (async () => {
      const s = await getSession();
      setSession(s);
      setReady(true);
      if (!s) return;
      const [a, b] = await Promise.all([
        supabase.from("areas").select("id,name").order("name"),
        s.branchId ? Promise.resolve({ data: [] }) : supabase.from("branches").select("id,name").order("name"),
      ]);
      setAreas(a.data || []);
      setBranches(b.data || []);
    })();
  }, []);

  if (!ready) return <div className="box p-10 text-center text-slate-500">Loading...</div>;
  if (!can(session, "reports", "view")) {
    return (
      <div className="box p-10 text-center text-slate-500">
        You do not have permission to view reports.
      </div>
    );
  }

  const canExport = can(session, "reports", "export");
  const active = TABS.find((t) => t.key === tab);
  const Comp = active.Comp;
  const f = active.f;

  const filters = {
    from: applied.from,
    to: applied.to,
    areaId: applied.areaId,
    areaName: areas.find((a) => a.id === applied.areaId)?.name || "",
    branchId: session.branchId || applied.branchId,
  };

  const invalidRange = draft.from && draft.to && draft.from > draft.to;

  return (
    <div className="grid grid-cols-12 gap-6">
      <div className="col-span-12 intro-y">
        <h2 className="text-lg font-medium">Reports</h2>
        <div className="text-slate-500 mt-1">Live business, billing and operational reports.</div>
      </div>

      <div className="col-span-12 intro-y">
        <div className="box p-4 flex flex-wrap gap-2">
          {TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              className={classnames(
                "py-2 px-4 rounded-full text-sm font-medium inline-flex items-center whitespace-nowrap",
                tab === t.key
                  ? "bg-primary text-white"
                  : "bg-slate-100 text-slate-600 dark:bg-darkmode-400 dark:text-slate-300"
              )}
            >
              <Lucide icon={t.icon} className="w-4 h-4 mr-2" />
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div className="col-span-12 intro-y">
        <div className="box p-5">
          <div className="grid grid-cols-12 gap-3 items-end">
            {f.date && (
              <>
                <div className="col-span-6 sm:col-span-3 lg:col-span-2">
                  <label className="text-xs text-slate-500">{f.dateLabel ? `${f.dateLabel} from` : "Date from"}</label>
                  <input type="date" className="form-control box mt-1 w-full" value={draft.from} onChange={(e) => setDraft({ ...draft, from: e.target.value })} />
                </div>
                <div className="col-span-6 sm:col-span-3 lg:col-span-2">
                  <label className="text-xs text-slate-500">{f.dateLabel ? `${f.dateLabel} to` : "Date to"}</label>
                  <input type="date" className="form-control box mt-1 w-full" value={draft.to} onChange={(e) => setDraft({ ...draft, to: e.target.value })} />
                </div>
              </>
            )}
            {f.branch && !session.branchId && branches.length > 0 && (
              <div className="col-span-12 sm:col-span-6 lg:col-span-3">
                <label className="text-xs text-slate-500">Branch</label>
                <select className="form-select box mt-1 w-full" value={draft.branchId} onChange={(e) => setDraft({ ...draft, branchId: e.target.value })}>
                  <option value="">All branches</option>
                  {branches.map((b) => (
                    <option key={b.id} value={b.id}>{b.name}</option>
                  ))}
                </select>
              </div>
            )}
            {f.area && (
              <div className="col-span-12 sm:col-span-6 lg:col-span-3">
                <label className="text-xs text-slate-500">Area</label>
                <select className="form-select box mt-1 w-full" value={draft.areaId} onChange={(e) => setDraft({ ...draft, areaId: e.target.value })}>
                  <option value="">All areas</option>
                  {areas.map((a) => (
                    <option key={a.id} value={a.id}>{a.name}</option>
                  ))}
                </select>
              </div>
            )}
            <div className="col-span-12 sm:col-span-6 lg:col-span-2 flex gap-2">
              <button type="button" className="btn btn-primary" disabled={invalidRange} onClick={() => setApplied(draft)}>
                Apply
              </button>
              <button
                type="button"
                className="btn btn-outline-secondary"
                onClick={() => {
                  setDraft(initial);
                  setApplied(initial);
                }}
              >
                Reset
              </button>
            </div>
          </div>
          {invalidRange && <div className="text-danger text-xs mt-2">The start date must not be after the end date.</div>}
        </div>
      </div>

      <div className="col-span-12">
        <Comp key={tab} filters={filters} canExport={canExport} />
      </div>
    </div>
  );
}

export default Main;
