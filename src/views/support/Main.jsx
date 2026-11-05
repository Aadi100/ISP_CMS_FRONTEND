import { Lucide, Tippy } from "@/base-components";
import classnames from "classnames";
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { getSession, can } from "@/lib/session";
import { friendlyError } from "@/lib/errors";
import { formatDate, formatDateTime, titleCase } from "@/lib/format";
import TicketDrawer from "./components/TicketDrawer";
import NewTicketModal from "./components/NewTicketModal";
import useCategories from "./components/useCategories";
import {
  SlaBadge,
  PRIORITY_OPTIONS,
  STATUS_OPTIONS,
  PriorityBadge,
  TicketStatusBadge,
} from "./components/shared";

const PAGE_SIZE = 10;

const EMPTY_FILTERS = {
  search: "",
  status: "",
  priority: "",
  technician: "",
  category: "",
  branch: "",
  sla: "",
  dateFrom: "",
  dateTo: "",
};

const cleanTerm = (s) => s.replace(/[,()%*\\]/g, " ").trim();

function startOfTodayISO() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

function Main() {
  const [session, setSession] = useState(null);
  const [tickets, setTickets] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [banner, setBanner] = useState(null);
  const [busyId, setBusyId] = useState(null);

  const categories = useCategories();
  const [employees, setEmployees] = useState([]);
  const [branches, setBranches] = useState([]);

  const [draft, setDraft] = useState(EMPTY_FILTERS);
  const [filters, setFilters] = useState(EMPTY_FILTERS);

  const [stats, setStats] = useState({
    open: 0,
    critical: 0,
    resolvedToday: 0,
    avgAgeDays: null,
    breached: 0,
    dueSoon: 0,
  });

  const [isNewOpen, setIsNewOpen] = useState(false);
  const [detailsId, setDetailsId] = useState(null);
  const [assignTicket, setAssignTicket] = useState(null);
  const [assignValue, setAssignValue] = useState("");

  const canCreate = can(session, "tickets", "create");
  const canEdit = can(session, "tickets", "edit");

  const showBanner = (message) => {
    setBanner(message);
    window.clearTimeout(showBanner._t);
    showBanner._t = window.setTimeout(() => setBanner(null), 3500);
  };

  // Session + lookup lists
  useEffect(() => {
    (async () => {
      const s = await getSession();
      setSession(s);
      const [emp, br] = await Promise.all([
        supabase.from("employees").select("id, full_name").order("full_name"),
        s && !s.branchId
          ? supabase.from("branches").select("id, name").order("name")
          : Promise.resolve({ data: [] }),
      ]);
      setEmployees(emp.data || []);
      setBranches(br.data || []);
    })();
  }, []);

  const loadTickets = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      let q = supabase
        .from("v_ticket_overview")
        .select("*", { count: "exact" })
        .order("created_at", { ascending: false })
        .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);

      const term = cleanTerm(filters.search);
      if (term) {
        q = q.or(
          [
            `ticket_number.ilike.%${term}%`,
            `subscriber_name.ilike.%${term}%`,
            `subscriber_phone.ilike.%${term}%`,
            `subscriber_code.ilike.%${term}%`,
            `category.ilike.%${term}%`,
          ].join(",")
        );
      }
      if (filters.status) q = q.eq("status", filters.status);
      if (filters.priority) q = q.eq("priority", filters.priority);
      if (filters.technician === "unassigned") q = q.is("assigned_to", null);
      else if (filters.technician) q = q.eq("assigned_to", filters.technician);
      if (filters.category) q = q.eq("category", filters.category);
      if (filters.branch) q = q.eq("branch_id", filters.branch);
      if (filters.sla === "breached") q = q.or("resolution_breached.eq.true,sla_breached_at.not.is.null");
      if (filters.dateFrom) q = q.gte("created_at", new Date(`${filters.dateFrom}T00:00:00`).toISOString());
      if (filters.dateTo) q = q.lte("created_at", new Date(`${filters.dateTo}T23:59:59`).toISOString());

      const { data, error: err, count } = await q;
      if (err) throw err;
      setTickets(data || []);
      setTotal(count || 0);
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setLoading(false);
    }
  }, [filters, page]);

  const loadStats = useCallback(async () => {
    try {
      const nowISO = new Date().toISOString();
      const hourISO = new Date(Date.now() + 3600000).toISOString();
      const [open, critical, resolved, active, breached, dueSoon] = await Promise.all([
        supabase.from("tickets").select("id", { count: "exact", head: true }).eq("status", "open"),
        supabase
          .from("tickets")
          .select("id", { count: "exact", head: true })
          .eq("priority", "critical")
          .not("status", "in", "(resolved,closed)"),
        supabase
          .from("tickets")
          .select("id", { count: "exact", head: true })
          .eq("status", "resolved")
          .gte("resolved_at", startOfTodayISO()),
        supabase
          .from("tickets")
          .select("created_at")
          .not("status", "in", "(resolved,closed)")
          .limit(1000),
        supabase
          .from("v_ticket_overview")
          .select("id", { count: "exact", head: true })
          .not("status", "in", "(resolved,closed)")
          .or("resolution_breached.eq.true,sla_breached_at.not.is.null"),
        supabase
          .from("v_ticket_overview")
          .select("id", { count: "exact", head: true })
          .not("status", "in", "(resolved,closed)")
          .is("sla_breached_at", null)
          .gte("resolution_due_at", nowISO)
          .lte("resolution_due_at", hourISO),
      ]);
      const ages = (active.data || []).map((t) => Date.now() - new Date(t.created_at).getTime());
      const avg = ages.length ? ages.reduce((a, b) => a + b, 0) / ages.length / 86400000 : null;
      setStats({
        open: open.count || 0,
        critical: critical.count || 0,
        resolvedToday: resolved.count || 0,
        avgAgeDays: avg,
        breached: breached.count || 0,
        dueSoon: dueSoon.count || 0,
      });
    } catch (e) {
      // stats are non-critical; the list shows its own error
    }
  }, []);

  useEffect(() => {
    loadTickets();
  }, [loadTickets]);

  useEffect(() => {
    loadStats();
  }, [loadStats]);

  const refreshAll = () => {
    loadTickets();
    loadStats();
  };

  const applyFilters = () => {
    setPage(1);
    setFilters({ ...draft, search: draft.search.trim() });
  };
  const resetFilters = () => {
    setDraft(EMPTY_FILTERS);
    setPage(1);
    setFilters(EMPTY_FILTERS);
  };

  const setDraftField = (k) => (e) => setDraft((p) => ({ ...p, [k]: e.target.value }));

  const closeTicket = async (t) => {
    setBusyId(t.id);
    setError("");
    try {
      const { error: err } = await supabase.from("tickets").update({ status: "closed" }).eq("id", t.id);
      if (err) throw err;
      showBanner(`${t.ticket_number} closed.`);
      refreshAll();
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setBusyId(null);
    }
  };

  const saveAssign = async () => {
    if (!assignTicket) return;
    setBusyId(assignTicket.id);
    setError("");
    try {
      const { error: err } = await supabase
        .from("tickets")
        .update({ assigned_to: assignValue || null })
        .eq("id", assignTicket.id);
      if (err) throw err;
      showBanner(`${assignTicket.ticket_number} ${assignValue ? "assigned" : "unassigned"}.`);
      setAssignTicket(null);
      refreshAll();
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setBusyId(null);
    }
  };

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const hasFilters = Object.values(filters).some(Boolean);

  const selectCls = "form-select box mt-1 w-full";

  return (
    <>
      <div className="grid grid-cols-12 gap-6">
        <div className="col-span-12 intro-y flex flex-col lg:flex-row lg:items-center">
          <div>
            <h2 className="text-lg font-medium">Support Tickets</h2>
            <div className="text-slate-500 mt-1">
              Manage customer complaints and technician assignments.
            </div>
          </div>
          <div className="flex flex-wrap gap-2 lg:ml-auto mt-4 lg:mt-0">
            {canCreate && (
              <button type="button" onClick={() => setIsNewOpen(true)} className="btn btn-primary shadow-md">
                <Lucide icon="Plus" className="w-4 h-4 mr-2" /> New Ticket
              </button>
            )}
          </div>
        </div>

        {error && (
          <div className="col-span-12 intro-y">
            <div className="box p-3 px-4 bg-danger/10 text-danger text-sm flex items-center">
              <Lucide icon="AlertCircle" className="w-4 h-4 mr-2 flex-none" />
              {error}
            </div>
          </div>
        )}
        {banner && (
          <div className="col-span-12 intro-y">
            <div className="box p-3 px-4 bg-success/10 text-success text-sm flex items-center">
              <Lucide icon="CheckCircle2" className="w-4 h-4 mr-2 flex-none" />
              {banner}
            </div>
          </div>
        )}

        {/* Search + filters */}
        <div className="col-span-12 intro-y">
          <div className="box p-5">
            <div className="relative text-slate-500">
              <Lucide icon="Search" className="w-5 h-5 z-10 absolute my-auto inset-y-0 ml-4 left-0" />
              <input
                type="text"
                value={draft.search}
                onChange={setDraftField("search")}
                onKeyDown={(e) => {
                  if (e.key === "Enter") applyFilters();
                }}
                className="form-control w-full box pl-12 py-3 text-base"
                placeholder="Search by Ticket Number, Subscriber, Phone or Category"
              />
            </div>

            <div className="grid grid-cols-12 gap-3 mt-4">
              <div className="col-span-12 sm:col-span-6 lg:col-span-4">
                <label className="text-xs text-slate-500">Status</label>
                <select className={selectCls} value={draft.status} onChange={setDraftField("status")}>
                  <option value="">All Statuses</option>
                  {STATUS_OPTIONS.map((s) => (
                    <option key={s} value={s}>{titleCase(s)}</option>
                  ))}
                </select>
              </div>
              <div className="col-span-12 sm:col-span-6 lg:col-span-4">
                <label className="text-xs text-slate-500">Priority</label>
                <select className={selectCls} value={draft.priority} onChange={setDraftField("priority")}>
                  <option value="">All Priorities</option>
                  {PRIORITY_OPTIONS.map((s) => (
                    <option key={s} value={s}>{titleCase(s)}</option>
                  ))}
                </select>
              </div>
              <div className="col-span-12 sm:col-span-6 lg:col-span-4">
                <label className="text-xs text-slate-500">Assigned Technician</label>
                <select className={selectCls} value={draft.technician} onChange={setDraftField("technician")}>
                  <option value="">All Technicians</option>
                  <option value="unassigned">Unassigned</option>
                  {employees.map((e) => (
                    <option key={e.id} value={e.id}>{e.full_name}</option>
                  ))}
                </select>
              </div>
              <div className="col-span-12 sm:col-span-6 lg:col-span-4">
                <label className="text-xs text-slate-500">Complaint Category</label>
                <select className={selectCls} value={draft.category} onChange={setDraftField("category")}>
                  <option value="">All Categories</option>
                  {categories.map(({ name: c }) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>
              <div className="col-span-12 sm:col-span-6 lg:col-span-4">
                <label className="text-xs text-slate-500">SLA</label>
                <select className={selectCls} value={draft.sla} onChange={setDraftField("sla")}>
                  <option value="">All</option>
                  <option value="breached">SLA breached</option>
                </select>
              </div>
              {branches.length > 0 && (
                <div className="col-span-12 sm:col-span-6 lg:col-span-4">
                  <label className="text-xs text-slate-500">Branch</label>
                  <select className={selectCls} value={draft.branch} onChange={setDraftField("branch")}>
                    <option value="">All Branches</option>
                    {branches.map((b) => (
                      <option key={b.id} value={b.id}>{b.name}</option>
                    ))}
                  </select>
                </div>
              )}
              <div className="col-span-12 sm:col-span-6 lg:col-span-2">
                <label className="text-xs text-slate-500">Date From</label>
                <input type="date" className="form-control box mt-1 w-full" value={draft.dateFrom} onChange={setDraftField("dateFrom")} />
              </div>
              <div className="col-span-12 sm:col-span-6 lg:col-span-2">
                <label className="text-xs text-slate-500">Date To</label>
                <input type="date" className="form-control box mt-1 w-full" value={draft.dateTo} onChange={setDraftField("dateTo")} />
              </div>
              <div className="col-span-12 flex gap-2">
                <button type="button" onClick={applyFilters} className="btn btn-primary w-full sm:w-40">Search</button>
                <button type="button" onClick={resetFilters} className="btn btn-outline-secondary w-full sm:w-40">Reset</button>
              </div>
            </div>
          </div>
        </div>

        {/* Summary cards */}
        <div className="col-span-12 sm:col-span-6 xl:col-span-2 intro-y">
          <div className="box p-5 flex items-center">
            <Lucide icon="Clock" className="w-8 h-8 mr-4 flex-none text-pending" />
            <div>
              <div className="text-xl font-medium">{stats.open}</div>
              <div className="text-slate-500 text-xs mt-0.5">Open Tickets</div>
            </div>
          </div>
        </div>
        <div className="col-span-12 sm:col-span-6 xl:col-span-2 intro-y">
          <div className="box p-5 flex items-center">
            <Lucide icon="AlertCircle" className="w-8 h-8 mr-4 flex-none text-danger" />
            <div>
              <div className="text-xl font-medium">{stats.critical}</div>
              <div className="text-slate-500 text-xs mt-0.5">Critical (unresolved)</div>
            </div>
          </div>
        </div>
        <div className="col-span-12 sm:col-span-6 xl:col-span-2 intro-y">
          <div className="box p-5 flex items-center">
            <Lucide icon="CheckCircle2" className="w-8 h-8 mr-4 flex-none text-success" />
            <div>
              <div className="text-xl font-medium">{stats.resolvedToday}</div>
              <div className="text-slate-500 text-xs mt-0.5">Resolved Today</div>
            </div>
          </div>
        </div>
        <div className="col-span-12 sm:col-span-6 xl:col-span-2 intro-y">
          <div className="box p-5 flex items-center">
            <Lucide icon="AlertTriangle" className="w-8 h-8 mr-4 flex-none text-warning" />
            <div>
              <div className="text-xl font-medium">
                {stats.avgAgeDays === null ? "—" : `${stats.avgAgeDays.toFixed(1)} days`}
              </div>
              <div className="text-slate-500 text-xs mt-0.5">Average Age (unresolved)</div>
            </div>
          </div>
        </div>

        <div className="col-span-12 sm:col-span-6 xl:col-span-2 intro-y">
          <div className="box p-5 flex items-center">
            <Lucide icon="AlertCircle" className="w-8 h-8 mr-4 flex-none text-danger" />
            <div>
              <div className="text-xl font-medium">{stats.breached}</div>
              <div className="text-slate-500 text-xs mt-0.5">SLA Breached</div>
            </div>
          </div>
        </div>
        <div className="col-span-12 sm:col-span-6 xl:col-span-2 intro-y">
          <div className="box p-5 flex items-center">
            <Lucide icon="Clock" className="w-8 h-8 mr-4 flex-none text-warning" />
            <div>
              <div className="text-xl font-medium">{stats.dueSoon}</div>
              <div className="text-slate-500 text-xs mt-0.5">Due within 1 hour</div>
            </div>
          </div>
        </div>

        {/* Table */}
        <div className="col-span-12 mt-2">
          <div className="intro-y flex items-center h-10">
            <h2 className="text-lg font-medium truncate mr-5">Ticket Records</h2>
            <div className="ml-auto text-slate-500 text-sm">
              {total} result{total === 1 ? "" : "s"}
            </div>
          </div>

          {loading ? (
            <div className="intro-y box p-10 mt-5 text-center text-slate-500">Loading tickets...</div>
          ) : tickets.length === 0 ? (
            <div className="intro-y box p-10 mt-5 flex flex-col items-center justify-center text-center">
              <Lucide icon="FileText" className="w-12 h-12 text-slate-300 mb-3" />
              <div className="text-slate-500 mb-5">
                {hasFilters ? "No tickets match your filters." : "No support tickets yet."}
              </div>
              {canCreate && !hasFilters && (
                <button type="button" onClick={() => setIsNewOpen(true)} className="btn btn-primary shadow-md">
                  <Lucide icon="Plus" className="w-4 h-4 mr-2" /> Create New Ticket
                </button>
              )}
            </div>
          ) : (
            <div className="intro-y w-full overflow-x-auto mt-5">
              <table className="table table-report w-full min-w-[1300px]">
                <thead>
                  <tr>
                    <th className="whitespace-nowrap">TICKET</th>
                    <th className="whitespace-nowrap">SUBSCRIBER</th>
                    <th className="whitespace-nowrap">PHONE NUMBER</th>
                    <th className="whitespace-nowrap">COMPLAINT CATEGORY</th>
                    <th className="text-center whitespace-nowrap">PRIORITY</th>
                    <th className="whitespace-nowrap">ASSIGNED TECHNICIAN</th>
                    <th className="whitespace-nowrap">CREATED</th>
                    <th className="whitespace-nowrap">SLA</th>
                    <th className="text-center whitespace-nowrap">STATUS</th>
                    <th className="text-center whitespace-nowrap min-w-[160px]">ACTIONS</th>
                  </tr>
                </thead>
                <tbody>
                  {tickets.map((t) => (
                    <tr key={t.id} className="intro-x">
                      <td className="whitespace-nowrap font-medium">{t.ticket_number}</td>
                      <td className="whitespace-nowrap">
                        {t.subscriber_name || <span className="text-slate-400">Walk-in / prospect</span>}
                        {t.subscriber_code && (
                          <div className="text-slate-500 text-xs">{t.subscriber_code}</div>
                        )}
                      </td>
                      <td className="whitespace-nowrap">{t.subscriber_phone || "—"}</td>
                      <td className="whitespace-nowrap">{titleCase(t.category)}</td>
                      <td className="w-28">
                        <div className="flex justify-center"><PriorityBadge priority={t.priority} /></div>
                      </td>
                      <td className="whitespace-nowrap">{t.technician_name || "Unassigned"}</td>
                      <td className="whitespace-nowrap">{formatDate(t.created_at)}</td>
                      <td className="whitespace-nowrap"><SlaBadge ticket={t} /></td>
                      <td className="w-40">
                        <div className="flex justify-center"><TicketStatusBadge status={t.status} /></div>
                      </td>
                      <td className="table-report__action w-auto min-w-[160px] whitespace-nowrap">
                        <div className="flex justify-center items-center gap-3">
                          <Tippy
                            tag="a"
                            href=""
                            content="View Ticket"
                            onClick={(e) => {
                              e.preventDefault();
                              setDetailsId(t.id);
                            }}
                          >
                            <Lucide icon="Eye" className="w-4 h-4 text-slate-500 hover:text-primary" />
                          </Tippy>
                          {canEdit && (
                            <Tippy
                              tag="a"
                              href=""
                              content="Assign Technician"
                              onClick={(e) => {
                                e.preventDefault();
                                setAssignTicket(t);
                                setAssignValue(t.assigned_to || "");
                              }}
                            >
                              <Lucide icon="User" className="w-4 h-4 text-slate-500 hover:text-primary" />
                            </Tippy>
                          )}
                          <Tippy
                            tag="a"
                            href=""
                            content="Notes and Materials"
                            onClick={(e) => {
                              e.preventDefault();
                              setDetailsId(t.id);
                            }}
                          >
                            <Lucide icon="FileText" className="w-4 h-4 text-slate-500 hover:text-primary" />
                          </Tippy>
                          {canEdit && t.status !== "closed" && (
                            <Tippy
                              tag="a"
                              href=""
                              content="Close Ticket"
                              onClick={(e) => {
                                e.preventDefault();
                                if (busyId !== t.id) closeTicket(t);
                              }}
                            >
                              <Lucide icon="X" className="w-4 h-4 text-slate-500 hover:text-primary" />
                            </Tippy>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {total > PAGE_SIZE && (
            <div className="flex items-center justify-between mt-5 intro-y">
              <div className="text-slate-500 text-sm">
                Page {page} of {totalPages}
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  className="btn btn-outline-secondary"
                  disabled={page <= 1 || loading}
                  onClick={() => setPage((p) => p - 1)}
                >
                  Previous
                </button>
                <button
                  type="button"
                  className="btn btn-outline-secondary"
                  disabled={page >= totalPages || loading}
                  onClick={() => setPage((p) => p + 1)}
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {isNewOpen && (
        <NewTicketModal
          employees={employees}
          onClose={() => setIsNewOpen(false)}
          onCreated={(num) => {
            setIsNewOpen(false);
            showBanner(`Ticket ${num} created.`);
            setPage(1);
            refreshAll();
          }}
        />
      )}

      {detailsId && (
        <TicketDrawer
          ticketId={detailsId}
          session={session}
          employees={employees}
          onClose={() => setDetailsId(null)}
          onChanged={refreshAll}
        />
      )}

      {assignTicket && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60" onClick={() => setAssignTicket(null)}></div>
          <div className="relative box w-full max-w-md p-6">
            <div className="flex items-center mb-5">
              <h2 className="text-lg font-medium">Assign Technician</h2>
              <button type="button" onClick={() => setAssignTicket(null)} className="ml-auto text-slate-500 hover:text-slate-700" aria-label="Close">
                <Lucide icon="X" className="w-5 h-5" />
              </button>
            </div>
            <div className="text-sm text-slate-500 mb-3">{assignTicket.ticket_number}</div>
            <label className="text-xs text-slate-500">Technician</label>
            <select className="form-select box mt-1 w-full" value={assignValue} onChange={(e) => setAssignValue(e.target.value)}>
              <option value="">Unassigned</option>
              {employees.map((e) => (
                <option key={e.id} value={e.id}>{e.full_name}</option>
              ))}
            </select>
            <div className="flex justify-end gap-2 mt-6">
              <button type="button" onClick={() => setAssignTicket(null)} className="btn btn-outline-secondary">Cancel</button>
              <button type="button" onClick={saveAssign} disabled={busyId === assignTicket.id} className="btn btn-primary shadow-md">
                {busyId === assignTicket.id ? "Saving..." : "Save"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export default Main;
