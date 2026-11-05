import { useCallback, useEffect, useState } from "react";
import { Lucide, Tippy } from "@/base-components";
import { Link } from "react-router-dom";
import classnames from "classnames";
import { supabase } from "@/lib/supabase";
import { getSession, can } from "@/lib/session";
import { friendlyError } from "@/lib/errors";
import { money } from "@/lib/format";
import SubscriberForm from "./components/SubscriberForm";
import SubscriberDetail from "./components/SubscriberDetail";
import ImportWizard from "./components/ImportWizard";

const STATUS_LABELS = {
  active: "Active",
  pending: "Pending Installation",
  suspended: "Suspended",
  terminated: "Terminated",
};

const STATUS_BADGE_CLASSES = {
  active: "bg-success/20 text-success",
  pending: "bg-pending/20 text-pending",
  suspended: "bg-warning/20 text-warning",
  terminated: "bg-danger/20 text-danger",
};

const SORTS = [
  { value: "created_at:desc", label: "Newest first" },
  { value: "created_at:asc", label: "Oldest first" },
  { value: "full_name:asc", label: "Name A-Z" },
  { value: "full_name:desc", label: "Name Z-A" },
  { value: "subscriber_code:asc", label: "Subscriber ID" },
  { value: "outstanding_balance:desc", label: "Highest outstanding" },
  { value: "monthly_fee:desc", label: "Highest monthly fee" },
];

const PAGE_SIZES = [10, 25, 50];

const EMPTY_FILTERS = {
  search: "",
  status: "",
  package_id: "",
  area_id: "",
  branch_id: "",
  reseller_id: "",
  collector_id: "",
  sort: "created_at:desc",
};

function StatusBadge({ status }) {
  return (
    <div
      className={classnames(
        "py-1 px-2 rounded-full text-xs font-medium inline-block whitespace-nowrap",
        STATUS_BADGE_CLASSES[status] || "bg-slate-100 text-slate-500"
      )}
    >
      {STATUS_LABELS[status] || status}
    </div>
  );
}

// Strip characters that would break a PostgREST .or() expression.
const cleanTerm = (s) => s.replace(/[,()%*\\]/g, " ").trim();

function applyFilters(query, f) {
  if (f.status) query = query.eq("connection_status", f.status);
  if (f.package_id) query = query.eq("package_id", f.package_id);
  if (f.area_id) query = query.eq("area_id", f.area_id);
  if (f.branch_id) query = query.eq("branch_id", f.branch_id);
  if (f.reseller_id) query = query.eq("reseller_id", f.reseller_id);
  const term = cleanTerm(f.search || "");
  if (term) {
    query = query.or(
      ["full_name", "phone", "subscriber_code", "pppoe_username"]
        .map((c) => `${c}.ilike.%${term}%`)
        .join(",")
    );
  }
  return query;
}

function csvCell(v) {
  const s = v === null || v === undefined ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function Main() {
  const [session, setSession] = useState(null);
  const [lookups, setLookups] = useState({
    packages: [],
    areas: [],
    resellers: [],
    branches: [],
    collectors: [],
  });

  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [counts, setCounts] = useState({
    active: 0,
    pending: 0,
    suspended: 0,
    outstanding: 0,
  });
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(10);

  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState(null);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState("");

  const [draft, setDraft] = useState(EMPTY_FILTERS);
  const [filters, setFilters] = useState(EMPTY_FILTERS);

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [detail, setDetail] = useState(null);
  const [importOpen, setImportOpen] = useState(false);

  const showBranch = session?.role === "isp_admin" && !session?.branchId;

  // ---------------- lookups + session (once) ----------------
  useEffect(() => {
    (async () => {
      try {
        const sess = await getSession();
        setSession(sess);
        const [pk, ar, rs, br, co] = await Promise.all([
          supabase.from("packages").select("id,name,monthly_price,status").order("name"),
          supabase.from("areas").select("id,name").order("name"),
          supabase.from("resellers").select("id,name").order("name"),
          supabase.from("branches").select("id,name").order("name"),
          supabase.from("employees").select("id,full_name").eq("is_collector", true).order("full_name"),
        ]);
        const firstErr = pk.error || ar.error || rs.error || br.error || co.error;
        if (firstErr) throw firstErr;
        setLookups({
          packages: pk.data || [],
          areas: ar.data || [],
          resellers: rs.data || [],
          branches: br.data || [],
          collectors: co.data || [],
        });
      } catch (err) {
        setError(friendlyError(err, "Unable to load filter options."));
      }
    })();
  }, []);

  // ---------------- list ----------------
  const loadRows = useCallback(async () => {
    setLoading(true);
    try {
      const [col, dir] = filters.sort.split(":");
      let q = supabase.from("v_subscriber_overview").select("*", { count: "exact" });
      q = applyFilters(q, filters);
      if (filters.collector_id) {
        // the overview view does not expose collector_id: resolve ids from the table
        const { data: ids, error: iErr } = await supabase
          .from("subscribers")
          .select("id")
          .eq("collector_id", filters.collector_id)
          .limit(500);
        if (iErr) throw iErr;
        q = q.in("id", (ids || []).map((r) => r.id));
      }
      q = q
        .order(col, { ascending: dir === "asc" })
        .order("id", { ascending: true })
        .range(page * pageSize, page * pageSize + pageSize - 1);
      const { data, count, error: err } = await q;
      if (err) throw err;
      setRows(data || []);
      setTotal(count || 0);
      setError("");
    } catch (err) {
      setRows([]);
      setTotal(0);
      setError(friendlyError(err, "Unable to load subscribers."));
    } finally {
      setLoading(false);
    }
  }, [filters, page, pageSize]);

  useEffect(() => {
    loadRows();
  }, [loadRows]);

  // ---------------- summary cards (whole ISP, independent of filters) ----------------
  const loadSummary = useCallback(async () => {
    try {
      const head = (status) =>
        supabase
          .from("v_subscriber_overview")
          .select("id", { count: "exact", head: true })
          .eq("connection_status", status);
      const [a, p, s, o] = await Promise.all([
        head("active"),
        head("pending"),
        head("suspended"),
        supabase
          .from("v_subscriber_overview")
          .select("outstanding_balance")
          .gt("outstanding_balance", 0)
          .limit(5000),
      ]);
      const err = a.error || p.error || s.error || o.error;
      if (err) throw err;
      setCounts({
        active: a.count || 0,
        pending: p.count || 0,
        suspended: s.count || 0,
        outstanding: (o.data || []).reduce((sum, r) => sum + Number(r.outstanding_balance || 0), 0),
      });
    } catch (err) {
      setError(friendlyError(err));
    }
  }, []);

  useEffect(() => {
    loadSummary();
  }, [loadSummary]);

  const refresh = async () => {
    await Promise.all([loadRows(), loadSummary()]);
  };

  // ---------------- filters ----------------
  const handleSearch = () => {
    setPage(0);
    setFilters({ ...draft });
  };
  const handleReset = () => {
    setDraft(EMPTY_FILTERS);
    setPage(0);
    setFilters(EMPTY_FILTERS);
  };
  const setDraftField = (field, value) => setDraft((p) => ({ ...p, [field]: value }));
  const changeSort = (value) => {
    setDraft((p) => ({ ...p, sort: value }));
    setPage(0);
    setFilters((p) => ({ ...p, sort: value }));
  };

  // ---------------- actions ----------------
  const openAdd = () => {
    setEditing(null);
    setFormOpen(true);
  };
  const openEdit = (sub) => {
    setEditing(sub);
    setFormOpen(true);
  };

  const handleSaved = async () => {
    setFormOpen(false);
    setEditing(null);
    setDetail(null);
    await refresh();
  };

  const changeStatus = async (sub, status) => {
    if (status === "terminated") {
      const ok = window.confirm(
        `Terminate ${sub.full_name}? The account is closed but its invoices and history are kept.`
      );
      if (!ok) return;
    }
    setBusyId(sub.id);
    setError("");
    try {
      const { error: err } = await supabase
        .from("subscribers")
        .update({ connection_status: status })
        .eq("id", sub.id);
      if (err) throw err;
      await refresh();
    } catch (err) {
      setError(friendlyError(err, "Unable to update subscriber status."));
    } finally {
      setBusyId(null);
    }
  };

  const hardDelete = async (sub) => {
    setBusyId(sub.id);
    setError("");
    try {
      const { count, error: cErr } = await supabase
        .from("invoices")
        .select("id", { count: "exact", head: true })
        .eq("subscriber_id", sub.id);
      if (cErr) throw cErr;
      if (count > 0) {
        setError(
          `${sub.full_name} has ${count} invoice(s) and cannot be deleted. Use Terminate instead.`
        );
        return;
      }
      if (
        !window.confirm(
          `Permanently delete ${sub.full_name}? This cannot be undone. (Use Terminate to keep history.)`
        )
      )
        return;
      const { error: err } = await supabase.from("subscribers").delete().eq("id", sub.id);
      if (err) {
        if (err.code === "23503") {
          setError(
            `${sub.full_name} has billing or payment records and cannot be deleted. Use Terminate instead.`
          );
          return;
        }
        throw err;
      }
      await refresh();
    } catch (err) {
      setError(friendlyError(err, "Unable to delete subscriber."));
    } finally {
      setBusyId(null);
    }
  };

  // ---------------- export ----------------
  const exportCsv = async () => {
    setExporting(true);
    setError("");
    try {
      const [col, dir] = filters.sort.split(":");
      const all = [];
      for (let from = 0; ; from += 1000) {
        let q = supabase.from("v_subscriber_overview").select("*");
        q = applyFilters(q, filters)
          .order(col, { ascending: dir === "asc" })
          .order("id", { ascending: true })
          .range(from, from + 999);
        const { data, error: err } = await q;
        if (err) throw err;
        all.push(...(data || []));
        if (!data || data.length < 1000) break;
      }
      const cols = [
        ["Subscriber ID", "subscriber_code"],
        ["Name", "full_name"],
        ["Phone", "phone"],
        ["CNIC", "cnic"],
        ["Email", "email"],
        ["Address", "address"],
        ["Area", "area_name"],
        ["Branch", "branch_name"],
        ["Package", "package_name"],
        ["Reseller", "reseller_name"],
        ["Status", "connection_status"],
        ["PPPoE", "pppoe_username"],
        ["Monthly Fee", "monthly_fee"],
        ["Outstanding", "outstanding_balance"],
        ["Advance Credit", "credit_balance"],
        ["Billing Anchor Date", "billing_anchor_date"],
      ];
      const lines = [cols.map((c) => csvCell(c[0])).join(",")];
      all.forEach((r) => lines.push(cols.map((c) => csvCell(r[c[1]])).join(",")));
      const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "subscribers.csv";
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(friendlyError(err, "Unable to export subscribers."));
    } finally {
      setExporting(false);
    }
  };

  const canCreate = can(session, "subscribers", "create");
  const canEdit = can(session, "subscribers", "edit");
  const canDelete = can(session, "subscribers", "delete");
  const canExport = can(session, "subscribers", "export");

  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const fromRow = total === 0 ? 0 : page * pageSize + 1;
  const toRow = Math.min(total, (page + 1) * pageSize);

  const summaryCards = [
    ["Users", "text-primary", counts.active, "Active Subscribers"],
    ["Clock", "text-pending", counts.pending, "Pending Installations"],
    ["UserX", "text-warning", counts.suspended, "Suspended Subscribers"],
    ["CreditCard", "text-danger", money(counts.outstanding), "Outstanding Payments"],
  ];

  return (
    <>
      <div className="grid grid-cols-12 gap-6">
        {/* Header */}
        <div className="col-span-12 intro-y flex flex-col sm:flex-row sm:items-center">
          <div>
            <h2 className="text-lg font-medium">Subscribers</h2>
            <div className="text-slate-500 mt-1">
              Manage all internet subscribers from one place.
            </div>
          </div>
          <div className="flex flex-wrap gap-2 sm:ml-auto mt-4 sm:mt-0">
            {canCreate && (
              <button type="button" className="btn btn-primary shadow-md" onClick={openAdd}>
                <Lucide icon="Plus" className="w-4 h-4 mr-2" />
                Add Subscriber
              </button>
            )}
            {canCreate && (
              <button
                type="button"
                className="btn btn-outline-secondary"
                onClick={() => setImportOpen(true)}
              >
                <Lucide icon="Upload" className="w-4 h-4 mr-2" />
                Import customers
              </button>
            )}
            {canExport && (
              <button
                type="button"
                className="btn btn-outline-secondary"
                onClick={exportCsv}
                disabled={exporting || total === 0}
              >
                <Lucide icon="Download" className="w-4 h-4 mr-2" />
                {exporting ? "Exporting..." : "Export CSV"}
              </button>
            )}
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="col-span-12 intro-y">
            <div className="alert alert-danger show flex items-center">
              <Lucide icon="AlertCircle" className="w-5 h-5 mr-2" />
              <div className="flex-1">{error}</div>
              <button
                type="button"
                className="btn btn-sm btn-outline-danger"
                onClick={() => setError("")}
              >
                Close
              </button>
            </div>
          </div>
        )}

        {/* Search + filters */}
        <div className="col-span-12 intro-y">
          <div className="box p-5">
            <div className="relative text-slate-500">
              <Lucide
                icon="Search"
                className="w-5 h-5 z-10 absolute my-auto inset-y-0 ml-4 left-0"
              />
              <input
                type="text"
                value={draft.search}
                onChange={(e) => setDraftField("search", e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleSearch();
                }}
                className="form-control w-full box pl-12 py-3 text-base"
                placeholder="Search by Name, Phone, Subscriber ID or PPPoE username"
              />
            </div>

            <div className="grid grid-cols-12 gap-3 mt-4">
              <div className="col-span-12 sm:col-span-6 lg:col-span-3">
                <label className="text-xs text-slate-500">Connection Status</label>
                <select
                  className="form-select box mt-1 w-full"
                  value={draft.status}
                  onChange={(e) => setDraftField("status", e.target.value)}
                >
                  <option value="">All Statuses</option>
                  {Object.entries(STATUS_LABELS).map(([v, l]) => (
                    <option key={v} value={v}>
                      {l}
                    </option>
                  ))}
                </select>
              </div>
              <div className="col-span-12 sm:col-span-6 lg:col-span-3">
                <label className="text-xs text-slate-500">Package</label>
                <select
                  className="form-select box mt-1 w-full"
                  value={draft.package_id}
                  onChange={(e) => setDraftField("package_id", e.target.value)}
                >
                  <option value="">All Packages</option>
                  {lookups.packages.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="col-span-12 sm:col-span-6 lg:col-span-3">
                <label className="text-xs text-slate-500">Area</label>
                <select
                  className="form-select box mt-1 w-full"
                  value={draft.area_id}
                  onChange={(e) => setDraftField("area_id", e.target.value)}
                >
                  <option value="">All Areas</option>
                  {lookups.areas.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="col-span-12 sm:col-span-6 lg:col-span-3">
                <label className="text-xs text-slate-500">Reseller</label>
                <select
                  className="form-select box mt-1 w-full"
                  value={draft.reseller_id}
                  onChange={(e) => setDraftField("reseller_id", e.target.value)}
                >
                  <option value="">All Resellers</option>
                  {lookups.resellers.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="col-span-12 sm:col-span-6 lg:col-span-3">
                <label className="text-xs text-slate-500">Collector</label>
                <select
                  className="form-select box mt-1 w-full"
                  value={draft.collector_id}
                  onChange={(e) => setDraftField("collector_id", e.target.value)}
                >
                  <option value="">All Collectors</option>
                  {lookups.collectors.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.full_name}
                    </option>
                  ))}
                </select>
              </div>
              {showBranch && (
                <div className="col-span-12 sm:col-span-6 lg:col-span-3">
                  <label className="text-xs text-slate-500">Branch</label>
                  <select
                    className="form-select box mt-1 w-full"
                    value={draft.branch_id}
                    onChange={(e) => setDraftField("branch_id", e.target.value)}
                  >
                    <option value="">All Branches</option>
                    {lookups.branches.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}
              <div className="col-span-12 sm:col-span-6 lg:col-span-3">
                <label className="text-xs text-slate-500">Sort by</label>
                <select
                  className="form-select box mt-1 w-full"
                  value={draft.sort}
                  onChange={(e) => changeSort(e.target.value)}
                >
                  {SORTS.map((s) => (
                    <option key={s.value} value={s.value}>
                      {s.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="col-span-12 sm:col-span-6 lg:col-span-3 flex items-end gap-2">
                <button type="button" onClick={handleSearch} className="btn btn-primary w-full">
                  Search
                </button>
                <button
                  type="button"
                  onClick={handleReset}
                  className="btn btn-outline-secondary w-full"
                >
                  Reset
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Summary cards */}
        {summaryCards.map(([icon, color, value, text]) => (
          <div key={text} className="col-span-12 sm:col-span-6 lg:col-span-3 intro-y">
            <div className="box p-5 flex items-center">
              <Lucide icon={icon} className={classnames("w-8 h-8 mr-4 flex-none", color)} />
              <div>
                <div className="text-xl font-medium">{value}</div>
                <div className="text-slate-500 text-xs mt-0.5">{text}</div>
              </div>
            </div>
          </div>
        ))}

        {/* Table */}
        <div className="col-span-12 mt-2">
          <div className="intro-y flex items-center h-10">
            <h2 className="text-lg font-medium truncate mr-5">All Subscribers</h2>
            <div className="ml-auto text-slate-500 text-sm">
              {loading ? "Loading..." : `${total} result${total === 1 ? "" : "s"}`}
            </div>
          </div>

          {loading ? (
            <div className="intro-y box p-10 mt-5 flex flex-col items-center justify-center text-center">
              <Lucide icon="Loader" className="w-10 h-10 text-slate-300 mb-3 animate-spin" />
              <div className="text-slate-500">Loading subscribers...</div>
            </div>
          ) : rows.length === 0 ? (
            <div className="intro-y box p-10 mt-5 flex flex-col items-center justify-center text-center">
              <Lucide icon="Users" className="w-12 h-12 text-slate-300 mb-3" />
              <div className="text-slate-500 mb-5">No subscribers found.</div>
              {canCreate && (
                <button type="button" className="btn btn-primary shadow-md" onClick={openAdd}>
                  <Lucide icon="Plus" className="w-4 h-4 mr-2" />
                  Add Subscriber
                </button>
              )}
            </div>
          ) : (
            <div className="intro-y w-full overflow-x-auto mt-5">
              <table className="table table-report w-full min-w-[1280px]">
                <thead>
                  <tr>
                    <th className="whitespace-nowrap">SUBSCRIBER ID</th>
                    <th className="whitespace-nowrap">CUSTOMER NAME</th>
                    <th className="whitespace-nowrap">PHONE</th>
                    <th className="whitespace-nowrap">AREA</th>
                    {showBranch && <th className="whitespace-nowrap">BRANCH</th>}
                    <th className="whitespace-nowrap">PACKAGE</th>
                    <th className="text-center whitespace-nowrap">CONNECTION STATUS</th>
                    <th className="text-right whitespace-nowrap">MONTHLY FEE</th>
                    <th className="text-right whitespace-nowrap">OUTSTANDING</th>
                    <th className="text-right whitespace-nowrap">ADVANCE CREDIT</th>
                    <th className="text-center whitespace-nowrap min-w-[180px]">ACTIONS</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((sub) => {
                    const busy = busyId === sub.id;
                    return (
                      <tr key={sub.id} className="intro-x">
                        <td className="whitespace-nowrap font-medium">{sub.subscriber_code}</td>
                        <td className="whitespace-nowrap">
                          <button
                            type="button"
                            className="font-medium hover:text-primary"
                            onClick={() => setDetail(sub)}
                          >
                            {sub.full_name}
                          </button>
                        </td>
                        <td className="whitespace-nowrap">{sub.phone}</td>
                        <td className="whitespace-nowrap max-w-[200px] truncate">
                          {sub.area_name || sub.address || "-"}
                        </td>
                        {showBranch && (
                          <td className="whitespace-nowrap">{sub.branch_name || "-"}</td>
                        )}
                        <td className="whitespace-nowrap">{sub.package_name || "No Package"}</td>
                        <td className="w-48">
                          <div className="flex justify-center">
                            <StatusBadge status={sub.connection_status} />
                          </div>
                        </td>
                        <td className="text-right whitespace-nowrap">{money(sub.monthly_fee)}</td>
                        <td
                          className={classnames("text-right whitespace-nowrap", {
                            "text-danger font-medium": Number(sub.outstanding_balance) > 0,
                          })}
                        >
                          {money(sub.outstanding_balance)}
                        </td>
                        <td
                          className={classnames("text-right whitespace-nowrap", {
                            "text-success font-medium": Number(sub.credit_balance) > 0,
                          })}
                        >
                          {money(sub.credit_balance)}
                        </td>
                        <td className="table-report__action w-auto min-w-[180px] whitespace-nowrap">
                          <div className="flex justify-center items-center gap-3">
                            <Tippy
                              tag="button"
                              type="button"
                              content="View"
                              onClick={() => setDetail(sub)}
                            >
                              <Lucide
                                icon="Eye"
                                className="w-4 h-4 text-slate-500 hover:text-primary"
                              />
                            </Tippy>
                            <Link to={`/subscribers/${sub.id}`} title="Open full profile">
                              <Lucide
                                icon="ExternalLink"
                                className="w-4 h-4 text-slate-500 hover:text-primary"
                              />
                            </Link>
                            {canEdit && (
                              <Tippy
                                tag="button"
                                type="button"
                                content="Edit"
                                onClick={() => openEdit(sub)}
                              >
                                <Lucide
                                  icon="Pencil"
                                  className="w-4 h-4 text-slate-500 hover:text-primary"
                                />
                              </Tippy>
                            )}
                            {canEdit && sub.connection_status === "active" && (
                              <Tippy
                                tag="button"
                                type="button"
                                content="Suspend"
                                disabled={busy}
                                onClick={() => !busy && changeStatus(sub, "suspended")}
                              >
                                <Lucide
                                  icon="UserX"
                                  className="w-4 h-4 text-slate-500 hover:text-warning"
                                />
                              </Tippy>
                            )}
                            {canEdit && sub.connection_status !== "active" && (
                              <Tippy
                                tag="button"
                                type="button"
                                content="Activate"
                                disabled={busy}
                                onClick={() => !busy && changeStatus(sub, "active")}
                              >
                                <Lucide
                                  icon="UserCheck"
                                  className="w-4 h-4 text-slate-500 hover:text-success"
                                />
                              </Tippy>
                            )}
                            {canEdit && sub.connection_status !== "terminated" && (
                              <Tippy
                                tag="button"
                                type="button"
                                content="Terminate"
                                disabled={busy}
                                onClick={() => !busy && changeStatus(sub, "terminated")}
                              >
                                <Lucide
                                  icon="Power"
                                  className="w-4 h-4 text-slate-500 hover:text-danger"
                                />
                              </Tippy>
                            )}
                            {canDelete && (
                              <Tippy
                                tag="button"
                                type="button"
                                content="Delete permanently (only without invoices)"
                                disabled={busy}
                                onClick={() => !busy && hardDelete(sub)}
                              >
                                <Lucide
                                  icon="Trash2"
                                  className="w-4 h-4 text-slate-500 hover:text-danger"
                                />
                              </Tippy>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* Pagination */}
          {!loading && total > 0 && (
            <div className="intro-y flex flex-wrap items-center gap-3 mt-5">
              <div className="text-slate-500 text-sm">
                Showing {fromRow}-{toRow} of {total}
              </div>
              <div className="flex items-center gap-2 sm:ml-auto">
                <select
                  className="form-select w-20"
                  value={pageSize}
                  onChange={(e) => {
                    setPageSize(Number(e.target.value));
                    setPage(0);
                  }}
                >
                  {PAGE_SIZES.map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  className="btn btn-outline-secondary"
                  disabled={page === 0}
                  onClick={() => setPage((p) => Math.max(0, p - 1))}
                >
                  <Lucide icon="ChevronLeft" className="w-4 h-4" />
                </button>
                <span className="text-sm">
                  Page {page + 1} / {pageCount}
                </span>
                <button
                  type="button"
                  className="btn btn-outline-secondary"
                  disabled={page + 1 >= pageCount}
                  onClick={() => setPage((p) => p + 1)}
                >
                  <Lucide icon="ChevronRight" className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {formOpen && (
        <SubscriberForm
          editing={editing}
          session={session}
          lookups={lookups}
          onClose={() => setFormOpen(false)}
          onSaved={handleSaved}
        />
      )}

      {importOpen && (
        <ImportWizard onClose={() => setImportOpen(false)} onImported={refresh} />
      )}

      {detail && (
        <SubscriberDetail
          subscriber={detail}
          session={session}
          onClose={() => setDetail(null)}
          onChanged={async () => {
            await refresh();
            const { data } = await supabase
              .from("v_subscriber_overview")
              .select("*")
              .eq("id", detail.id)
              .maybeSingle();
            if (data) setDetail(data);
          }}
          onEdit={(s) => {
            setDetail(null);
            openEdit(s);
          }}
        />
      )}
    </>
  );
}

export default Main;
