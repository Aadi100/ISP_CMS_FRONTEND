import classnames from "classnames";
import { useCallback, useEffect, useState } from "react";
import { Lucide } from "@/base-components";
import { supabase } from "@/lib/supabase";
import { friendlyError } from "@/lib/errors";
import { can } from "@/lib/session";
import { formatDate, formatDateTime, money, titleCase } from "@/lib/format";
import { Pagination, StatCard, fetchAll, useSession } from "@/views/payments/components/shared";
import {
  ErrorBanner,
  LEAD_COLS,
  SOURCES,
  STAGES,
  StageBadge,
  downloadCsv,
  likeSafe,
  useLookups,
} from "./components/common";
import LeadForm from "./components/LeadForm";
import LeadDrawer from "./components/LeadDrawer";
import PipelineBoard from "./components/PipelineBoard";

const EMPTY_FILTERS = { search: "", stage: "", source: "", assigned: "", area: "", overdue: false };

function Main() {
  const session = useSession();
  const lookups = useLookups();
  const [view, setView] = useState("pipeline");
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(10);
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [stats, setStats] = useState(null);
  const [form, setForm] = useState(null); // {lead|null}
  const [openId, setOpenId] = useState(null);
  const [busyId, setBusyId] = useState(null);
  const [exporting, setExporting] = useState(false);

  const canCreate = can(session, "leads", "create");
  const canEdit = can(session, "leads", "edit");
  const canExport = can(session, "leads", "export");

  // debounce search
  useEffect(() => {
    const t = setTimeout(() => {
      setFilters((f) => (f.search === search ? f : { ...f, search }));
      setPage(0);
    }, 350);
    return () => clearTimeout(t);
  }, [search]);

  const applyFilters = useCallback(
    (q) => {
      if (filters.search) {
        const s = likeSafe(filters.search);
        if (s) q = q.or(`full_name.ilike.%${s}%,phone.ilike.%${s}%,lead_code.ilike.%${s}%`);
      }
      if (view === "list" && filters.stage) q = q.eq("stage", filters.stage);
      if (filters.source) q = q.eq("source", filters.source);
      if (filters.assigned) q = q.eq("assigned_to", filters.assigned);
      if (filters.area) q = q.eq("area_id", filters.area);
      if (filters.overdue) q = q.eq("follow_up_overdue", true);
      return q;
    },
    [filters, view]
  );

  const loadStats = useCallback(async () => {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
    const c = () => supabase.from("v_lead_overview").select("id", { count: "exact", head: true });
    const [open, won, lost, wonAll, lostAll, overdue] = await Promise.all([
      c().not("stage", "in", "(won,lost)"),
      c().eq("stage", "won").gte("updated_at", monthStart),
      c().eq("stage", "lost").gte("updated_at", monthStart),
      c().eq("stage", "won"),
      c().eq("stage", "lost"),
      c().eq("follow_up_overdue", true),
    ]);
    const err = [open, won, lost, wonAll, lostAll, overdue].find((r) => r.error);
    if (err) return setError(friendlyError(err.error));
    const w = wonAll.count || 0;
    const l = lostAll.count || 0;
    setStats({
      open: open.count || 0,
      won: won.count || 0,
      lost: lost.count || 0,
      rate: w + l > 0 ? Math.round((w / (w + l)) * 100) : null,
      overdue: overdue.count || 0,
    });
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    let q = supabase.from("v_lead_overview").select(LEAD_COLS, { count: "exact" });
    q = applyFilters(q);
    if (view === "list") {
      q = q.order("created_at", { ascending: false }).range(page * pageSize, page * pageSize + pageSize - 1);
    } else {
      q = q.order("updated_at", { ascending: false }).range(0, 999);
    }
    const { data, count, error: err } = await q;
    if (err) setError(friendlyError(err));
    else setError("");
    setRows(data || []);
    setTotal(count || 0);
    setLoading(false);
  }, [applyFilters, view, page, pageSize]);

  useEffect(() => {
    load();
  }, [load]);
  useEffect(() => {
    loadStats();
  }, [loadStats]);

  const refresh = () => {
    load();
    loadStats();
  };

  const moveLead = async (lead, stage) => {
    if (stage === lead.stage) return;
    if (stage === "won") {
      setError("Use 'Convert to customer' in the lead details to win a lead.");
      return setOpenId(lead.id);
    }
    if (stage === "lost") {
      setError("Open the lead and use 'Mark lost' to record a reason.");
      return setOpenId(lead.id);
    }
    setBusyId(lead.id);
    const patch = { stage };
    if (lead.stage === "lost") patch.lost_reason = null;
    const { error: err } = await supabase.from("leads").update(patch).eq("id", lead.id);
    setBusyId(null);
    if (err) setError(friendlyError(err));
    else refresh();
  };

  const exportCsv = async () => {
    setExporting(true);
    try {
      const all = await fetchAll((from, to) =>
        applyFilters(supabase.from("v_lead_overview").select(LEAD_COLS)).order("created_at", { ascending: false }).range(from, to)
      );
      downloadCsv("leads.csv", [
        ["Code", "Name", "Phone", "Email", "Area", "Package", "Source", "Stage", "Feasibility", "Assigned", "Quoted monthly", "Quoted installation", "Follow-up", "Created"],
        ...all.map((l) => [
          l.lead_code, l.full_name, l.phone, l.email, l.area_name, l.package_name, l.source, l.stage, l.feasibility,
          l.assigned_name, l.quoted_monthly_fee, l.quoted_installation_fee, l.follow_up_at, l.created_at,
        ]),
      ]);
    } catch (e) {
      setError(friendlyError(e));
    }
    setExporting(false);
  };

  const setF = (k, v) => {
    setFilters((f) => ({ ...f, [k]: v }));
    setPage(0);
  };

  return (
    <>
      <div className="flex flex-wrap items-center mt-8 gap-2">
        <h2 className="text-lg font-medium mr-auto">New connections / Leads</h2>
        <div className="flex">
          {["pipeline", "list"].map((v) => (
            <button
              key={v}
              type="button"
              className={classnames("btn", view === v ? "btn-primary" : "btn-outline-secondary", v === "pipeline" ? "rounded-r-none" : "rounded-l-none")}
              onClick={() => {
                setView(v);
                setPage(0);
              }}
            >
              {titleCase(v)}
            </button>
          ))}
        </div>
        {canExport && view === "list" && (
          <button type="button" className="btn btn-outline-secondary" disabled={exporting} onClick={exportCsv}>
            <Lucide icon="Download" className="w-4 h-4 mr-2" /> {exporting ? "Exporting..." : "Export CSV"}
          </button>
        )}
        {canCreate && (
          <button type="button" className="btn btn-primary" onClick={() => setForm({ lead: null })}>
            <Lucide icon="Plus" className="w-4 h-4 mr-2" /> Add lead
          </button>
        )}
      </div>

      <div className="grid grid-cols-12 gap-4 mt-4">
        <div className="col-span-6 lg:col-span-3 xl:col-span-2 xl:col-start-1"><StatCard icon="Users" value={stats?.open ?? "-"} label="Open leads" /></div>
        <div className="col-span-6 lg:col-span-3 xl:col-span-2"><StatCard icon="CheckCircle" tone="text-success" value={stats?.won ?? "-"} label="Won this month" /></div>
        <div className="col-span-6 lg:col-span-3 xl:col-span-2"><StatCard icon="XCircle" tone="text-danger" value={stats?.lost ?? "-"} label="Lost this month" /></div>
        <div className="col-span-6 lg:col-span-3 xl:col-span-3"><StatCard icon="TrendingUp" tone="text-pending" value={stats ? (stats.rate == null ? "-" : `${stats.rate}%`) : "-"} label="Conversion rate" hint="won / (won + lost)" /></div>
        <div className="col-span-12 lg:col-span-3 xl:col-span-3"><StatCard icon="AlertCircle" tone="text-danger" value={stats?.overdue ?? "-"} label="Overdue follow-ups" /></div>
      </div>

      <div className="flex flex-wrap items-center gap-2 mt-5">
        <input className="form-control w-56" placeholder="Search name, phone, code" value={search} onChange={(e) => setSearch(e.target.value)} />
        {view === "list" && (
          <select className="form-select w-40" value={filters.stage} onChange={(e) => setF("stage", e.target.value)}>
            <option value="">All stages</option>
            {STAGES.map((s) => <option key={s} value={s}>{titleCase(s)}</option>)}
          </select>
        )}
        <select className="form-select w-36" value={filters.source} onChange={(e) => setF("source", e.target.value)}>
          <option value="">All sources</option>
          {SOURCES.map((s) => <option key={s} value={s}>{titleCase(s)}</option>)}
        </select>
        <select className="form-select w-44" value={filters.assigned} onChange={(e) => setF("assigned", e.target.value)}>
          <option value="">Anyone assigned</option>
          {lookups.employees.map((e) => <option key={e.id} value={e.id}>{e.full_name}</option>)}
        </select>
        <select className="form-select w-40" value={filters.area} onChange={(e) => setF("area", e.target.value)}>
          <option value="">All areas</option>
          {lookups.areas.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
        <label className="flex items-center text-sm">
          <input type="checkbox" className="form-check-input mr-2" checked={filters.overdue} onChange={(e) => setF("overdue", e.target.checked)} />
          Overdue follow-up
        </label>
      </div>

      <div className="mt-4">
        <ErrorBanner message={error} onClose={() => setError("")} />
        {loading ? (
          <div className="box p-6 text-center text-slate-500">Loading leads...</div>
        ) : rows.length === 0 ? (
          <div className="box p-6 text-center text-slate-500">No leads found.</div>
        ) : view === "pipeline" ? (
          <>
            <PipelineBoard leads={rows} canEdit={canEdit} busyId={busyId} onOpen={setOpenId} onMove={moveLead} />
            {total > rows.length && <div className="text-xs text-slate-500">Showing the latest {rows.length} of {total} leads. Narrow with filters.</div>}
          </>
        ) : (
          <>
            <div className="overflow-auto box">
              <table className="table table-report -mt-2">
                <thead>
                  <tr>
                    <th>Lead</th><th>Phone</th><th>Area</th><th>Package</th><th>Source</th><th>Stage</th>
                    <th>Assigned</th><th>Quoted</th><th>Follow-up</th><th>Created</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((l) => (
                    <tr key={l.id} className="intro-x cursor-pointer" onClick={() => setOpenId(l.id)}>
                      <td>
                        <div className="font-medium whitespace-nowrap">{l.full_name}</div>
                        <div className="text-slate-500 text-xs">{l.lead_code}</div>
                      </td>
                      <td className="whitespace-nowrap">{l.phone}</td>
                      <td>{l.area_name || "-"}</td>
                      <td>{l.package_name || "-"}</td>
                      <td>{titleCase(l.source)}</td>
                      <td><StageBadge stage={l.stage} /></td>
                      <td>{l.assigned_name || "-"}</td>
                      <td className="whitespace-nowrap">{l.quoted_monthly_fee != null ? money(l.quoted_monthly_fee) : "-"}</td>
                      <td className={classnames("whitespace-nowrap", l.follow_up_overdue && "text-danger font-medium")}>{formatDateTime(l.follow_up_at)}</td>
                      <td className="whitespace-nowrap">{formatDate(l.created_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination page={page} pageSize={pageSize} total={total} onPage={setPage} onPageSize={(n) => { setPageSize(n); setPage(0); }} />
          </>
        )}
      </div>

      {form && (
        <LeadForm
          lead={form.lead}
          lookups={lookups}
          onClose={() => setForm(null)}
          onSaved={() => {
            setForm(null);
            refresh();
          }}
        />
      )}
      {openId && (
        <LeadDrawer
          leadId={openId}
          session={session}
          lookups={lookups}
          onClose={() => setOpenId(null)}
          onChanged={refresh}
          onEdit={(lead) => setForm({ lead })}
        />
      )}
    </>
  );
}

export default Main;
