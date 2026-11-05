import { Lucide, Tippy } from "@/base-components";
import classnames from "classnames";
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { getSession, can } from "@/lib/session";
import { friendlyError } from "@/lib/errors";
import { formatDate, titleCase, toDateInput, money } from "@/lib/format";

const DEPARTMENTS = [
  "Administration",
  "Billing",
  "Support",
  "Technical",
  "Sales",
  "Inventory",
  "Management",
];
const EMPLOYMENT_STATUS_OPTIONS = ["active", "on_leave", "suspended", "resigned"];
const PAGE_SIZE = 10;

const EMPLOYMENT_BADGE_CLASSES = {
  active: "bg-success/20 text-success",
  on_leave: "bg-warning/20 text-warning",
  suspended: "bg-danger/20 text-danger",
  resigned: "bg-slate-300 text-slate-600 dark:bg-darkmode-400 dark:text-slate-300",
};

const ACCOUNT_BADGE_CLASSES = {
  enabled: "bg-success/20 text-success",
  disabled: "bg-slate-200 text-slate-500 dark:bg-darkmode-300",
  none: "bg-slate-100 text-slate-400 dark:bg-darkmode-400",
};

const FORM_DEFAULT = {
  full_name: "",
  cnic: "",
  phone: "",
  email: "",
  address: "",
  department: DEPARTMENTS[0],
  role_id: "",
  manager_id: "",
  joining_date: "",
  username: "",
  employment_status: "active",
  remarks: "",
  branch_id: "",
  salary: "",
  is_collector: false,
  commission_percent: "",
};

const EMPTY_FILTERS = {
  search: "",
  department: "",
  role_id: "",
  employment_status: "",
  account_status: "",
  branch_id: "",
  collector: "",
};

function Badge({ cls, children }) {
  return (
    <div
      className={classnames(
        "py-1 px-2 rounded-full text-xs font-medium inline-block whitespace-nowrap",
        cls
      )}
    >
      {children}
    </div>
  );
}

// Account state of an employee row: the login (profile) wins over the employee flag.
function accountState(emp) {
  if (!emp.profile_id) return "none";
  const s = emp.profiles?.status;
  if (s) return s === "active" ? "enabled" : "disabled";
  return emp.account_status || "enabled";
}

const accountLabel = (s) => (s === "none" ? "No login" : titleCase(s));

function Main() {
  const [session, setSession] = useState(null);
  const [employees, setEmployees] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [banner, setBanner] = useState("");
  const [stats, setStats] = useState({ total: 0, active: 0, technicians: 0, support: 0, inactive: 0 });

  const [roles, setRoles] = useState([]);
  const [branches, setBranches] = useState([]);
  const [managers, setManagers] = useState([]);

  const [draft, setDraft] = useState(EMPTY_FILTERS);
  const [filters, setFilters] = useState(EMPTY_FILTERS);

  // add / edit modal
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState(null); // employee row or null
  const [form, setForm] = useState(FORM_DEFAULT);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");

  // details modal
  const [details, setDetails] = useState(null);
  const [detailsExtra, setDetailsExtra] = useState({ tickets: [], installations: [], salary: null, loading: false });

  // create-login modal
  const [loginFor, setLoginFor] = useState(null);
  const [loginForm, setLoginForm] = useState({ email: "", role: "isp_staff", role_id: "", branch_id: "" });
  const [loginBusy, setLoginBusy] = useState(false);
  const [loginMsg, setLoginMsg] = useState(null); // {ok, text}

  const [busyId, setBusyId] = useState(null);

  const isAdmin = session?.role === "isp_admin";
  const canCreate = can(session, "employees", "create");
  const canEdit = can(session, "employees", "edit");
  const canDelete = can(session, "employees", "delete");
  const canExport = can(session, "employees", "export");

  const flash = (msg) => {
    setBanner(msg);
    window.clearTimeout(flash._t);
    flash._t = window.setTimeout(() => setBanner(""), 4000);
  };

  // ---- lookups -------------------------------------------------------
  useEffect(() => {
    (async () => {
      setSession(await getSession());
      const [r, b, m] = await Promise.all([
        supabase.from("roles").select("id,name").order("name"),
        supabase.from("branches").select("id,name").order("name"),
        supabase.from("employees").select("id,full_name,employee_code").order("full_name").limit(500),
      ]);
      setRoles(r.data || []);
      setBranches(b.data || []);
      setManagers(m.data || []);
    })();
  }, []);

  const buildQuery = useCallback(
    (q) => {
      if (filters.search) {
        const s = filters.search.replace(/[,()%]/g, " ").trim();
        if (s) {
          q = q.or(
            `full_name.ilike.%${s}%,employee_code.ilike.%${s}%,phone.ilike.%${s}%,email.ilike.%${s}%,department.ilike.%${s}%`
          );
        }
      }
      if (filters.department) q = q.eq("department", filters.department);
      if (filters.role_id) q = q.eq("role_id", filters.role_id);
      if (filters.employment_status) q = q.eq("employment_status", filters.employment_status);
      if (filters.account_status) q = q.eq("account_status", filters.account_status);
      if (filters.branch_id) q = q.eq("branch_id", filters.branch_id);
      if (filters.collector) q = q.eq("is_collector", filters.collector === "yes");
      return q;
    },
    [filters]
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    const from = page * PAGE_SIZE;
    const { data, error: err, count } = await buildQuery(
      supabase
        .from("employees")
        .select("*, roles(name), branches!employees_branch_fk(name), profiles(status, email)", { count: "exact" })
    )
      .order("employee_code", { ascending: true })
      .range(from, from + PAGE_SIZE - 1);
    if (err) setError(friendlyError(err));
    setEmployees(data || []);
    setTotal(count || 0);
    setLoading(false);
  }, [buildQuery, page]);

  useEffect(() => {
    load();
  }, [load]);

  const loadStats = useCallback(async () => {
    const head = () => supabase.from("employees").select("id", { count: "exact", head: true });
    const roleIds = (name) => roles.filter((r) => r.name.toLowerCase().includes(name)).map((r) => r.id);
    const byRoles = async (ids) =>
      ids.length ? (await head().in("role_id", ids)).count || 0 : 0;
    const [all, active, inactive, tech, sup] = await Promise.all([
      head(),
      head().eq("employment_status", "active"),
      head().in("employment_status", ["suspended", "resigned"]),
      byRoles(roleIds("technician")),
      byRoles(roleIds("support")),
    ]);
    setStats({
      total: all.count || 0,
      active: active.count || 0,
      inactive: inactive.count || 0,
      technicians: tech,
      support: sup,
    });
  }, [roles]);

  useEffect(() => {
    loadStats();
  }, [loadStats, employees.length, total]);

  const applyFilters = () => {
    setPage(0);
    setFilters({ ...draft, search: draft.search.trim() });
  };
  const resetFilters = () => {
    setDraft(EMPTY_FILTERS);
    setPage(0);
    setFilters(EMPTY_FILTERS);
  };

  // ---- add / edit ------------------------------------------------------
  const openAdd = () => {
    setEditing(null);
    setForm({ ...FORM_DEFAULT, branch_id: session?.branchId || "" });
    setFormError("");
    setFormOpen(true);
  };

  const openEdit = async (emp) => {
    setEditing(emp);
    setFormError("");
    setForm({
      full_name: emp.full_name || "",
      cnic: emp.cnic || "",
      phone: emp.phone || "",
      email: emp.email || "",
      address: emp.address || "",
      department: emp.department || DEPARTMENTS[0],
      role_id: emp.role_id || "",
      manager_id: emp.manager_id || "",
      joining_date: toDateInput(emp.joining_date),
      username: emp.username || "",
      employment_status: emp.employment_status,
      remarks: emp.remarks || "",
      branch_id: emp.branch_id || "",
      salary: "",
      is_collector: Boolean(emp.is_collector),
      commission_percent: emp.commission_percent != null ? String(emp.commission_percent) : "",
    });
    if (isAdmin) {
      const { data } = await supabase
        .from("employee_compensation")
        .select("salary")
        .eq("employee_id", emp.id)
        .maybeSingle();
      setForm((f) => ({ ...f, salary: data?.salary != null ? String(data.salary) : "" }));
    }
    setFormOpen(true);
  };

  const handleSave = async () => {
    if (!form.full_name.trim()) {
      setFormError("Full name is required.");
      return;
    }
    setSaving(true);
    setFormError("");
    const payload = {
      full_name: form.full_name.trim(),
      cnic: form.cnic.trim() || null,
      phone: form.phone.trim() || null,
      email: form.email.trim() || null,
      address: form.address.trim() || null,
      department: form.department || null,
      role_id: form.role_id || null,
      manager_id: form.manager_id || null,
      joining_date: form.joining_date || null,
      username: form.username.trim() || null,
      employment_status: form.employment_status,
      remarks: form.remarks.trim() || null,
      is_collector: form.is_collector,
      commission_percent: form.commission_percent === "" ? 0 : Number(form.commission_percent),
    };
    if (Number.isNaN(payload.commission_percent) || payload.commission_percent < 0 || payload.commission_percent > 100) {
      setSaving(false);
      setFormError("Commission % must be between 0 and 100.");
      return;
    }
    if (!session?.branchId) payload.branch_id = form.branch_id || null;

    let employeeId = editing?.id;
    let err;
    if (editing) {
      ({ error: err } = await supabase.from("employees").update(payload).eq("id", editing.id));
    } else {
      const res = await supabase.from("employees").insert(payload).select("id").single();
      err = res.error;
      employeeId = res.data?.id;
    }

    if (!err && isAdmin && form.salary !== "" && employeeId) {
      const salary = Number(form.salary);
      if (Number.isNaN(salary) || salary < 0) {
        err = { message: "Salary must be a positive number. The employee was saved without salary." };
      } else {
        ({ error: err } = await supabase
          .from("employee_compensation")
          .upsert({ employee_id: employeeId, salary }, { onConflict: "employee_id" }));
      }
    }

    setSaving(false);
    if (err) {
      setFormError(friendlyError(err));
      if (!editing && employeeId) {
        // employee exists already; refresh so it is visible
        load();
      }
      return;
    }
    setFormOpen(false);
    flash(editing ? "Employee updated." : "Employee added.");
    load();
    supabase
      .from("employees")
      .select("id,full_name,employee_code")
      .order("full_name")
      .limit(500)
      .then(({ data }) => setManagers(data || []));
  };

  // ---- delete ----------------------------------------------------------
  const handleDelete = async (emp) => {
    if (!window.confirm(`Delete ${emp.full_name}? This cannot be undone.`)) return;
    setBusyId(emp.id);
    setError("");
    const { error: err } = await supabase.from("employees").delete().eq("id", emp.id);
    setBusyId(null);
    if (err) {
      setError(
        err.code === "23503"
          ? `${emp.full_name} is referenced by other records (tickets, installations, equipment ...) and cannot be deleted. Set the employment status to "Resigned" instead.`
          : friendlyError(err)
      );
      return;
    }
    flash("Employee deleted.");
    load();
  };

  // ---- details ---------------------------------------------------------
  const openDetails = async (emp) => {
    setDetails(emp);
    setDetailsExtra({ tickets: [], installations: [], salary: null, loading: true });
    const [t, i, c] = await Promise.all([
      supabase
        .from("tickets")
        .select("id,ticket_number,status")
        .eq("assigned_to", emp.id)
        .not("status", "in", "(resolved,closed)")
        .limit(20),
      supabase
        .from("installations")
        .select("id,installation_number,status")
        .eq("technician_id", emp.id)
        .in("status", ["planned", "in_progress"])
        .limit(20),
      isAdmin
        ? supabase.from("employee_compensation").select("salary").eq("employee_id", emp.id).maybeSingle()
        : Promise.resolve({ data: null }),
    ]);
    setDetailsExtra({
      tickets: t.data || [],
      installations: i.data || [],
      salary: c.data?.salary ?? null,
      loading: false,
    });
  };

  // ---- login (edge functions) ---------------------------------------------
  const edgeError = async (error) => {
    // supabase-js wraps non-2xx in FunctionsHttpError with a Response in .context
    try {
      if (error?.context?.status === 404) {
        return "The login service (edge function) is not deployed yet. Ask your administrator to deploy it.";
      }
      if (error?.context && typeof error.context.json === "function") {
        const body = await error.context.json();
        if (body?.error) return body.error;
      }
    } catch (e) {
      /* ignore */
    }
    if (/Failed to send|Failed to fetch|NetworkError|FunctionsFetchError/i.test(error?.message || error?.name || "")) {
      return "Cannot reach the login service. The edge function may not be deployed yet, or you are offline.";
    }
    return friendlyError(error);
  };

  const openCreateLogin = (emp) => {
    setLoginFor(emp);
    setLoginMsg(null);
    setLoginForm({
      email: emp.email || "",
      role: "isp_staff",
      role_id: emp.role_id || "",
      branch_id: emp.branch_id || "",
    });
  };

  const handleCreateLogin = async () => {
    if (!loginForm.email.trim()) {
      setLoginMsg({ ok: false, text: "An e-mail address is required." });
      return;
    }
    setLoginBusy(true);
    setLoginMsg(null);
    const body = {
      email: loginForm.email.trim(),
      full_name: loginFor.full_name,
      role: loginForm.role,
      role_id: loginForm.role_id || undefined,
      employee_id: loginFor.id,
      branch_id: loginForm.branch_id || undefined,
    };
    const chosenRole = roles.find((r) => r.id === loginForm.role_id);
    if (chosenRole?.name === "Collection Agent" && !loginFor.is_collector) {
      const { error: cErr } = await supabase.from("employees").update({ is_collector: true }).eq("id", loginFor.id);
      if (cErr) {
        setLoginBusy(false);
        setLoginMsg({ ok: false, text: friendlyError(cErr) });
        return;
      }
    }
    const { data, error: err } = await supabase.functions.invoke("invite-employee", { body });
    setLoginBusy(false);
    if (err) {
      setLoginMsg({ ok: false, text: await edgeError(err) });
      return;
    }
    if (data?.error) {
      setLoginMsg({ ok: false, text: data.error });
      return;
    }
    setLoginMsg({ ok: true, text: `Invitation sent to ${data?.email || body.email}. The employee can now set a password and sign in.` });
    load();
  };

  const handleToggleLogin = async (emp) => {
    const state = accountState(emp);
    const next = state === "enabled" ? "disabled" : "active";
    setBusyId(emp.id);
    setError("");
    const { error: err } = await supabase.functions.invoke("set-user-status", {
      body: { user_id: emp.profile_id, status: next },
    });
    setBusyId(null);
    if (err) {
      setError(await edgeError(err));
      return;
    }
    await supabase
      .from("employees")
      .update({ account_status: next === "active" ? "enabled" : "disabled" })
      .eq("id", emp.id);
    flash(`${emp.full_name}'s login is now ${next === "active" ? "enabled" : "disabled"}.`);
    load();
  };

  // ---- export ----------------------------------------------------------
  const handleExport = async () => {
    const { data, error: err } = await buildQuery(
      supabase.from("employees").select("*, roles(name), branches!employees_branch_fk(name)")
    )
      .order("employee_code")
      .range(0, 999);
    if (err) {
      setError(friendlyError(err));
      return;
    }
    const cols = ["Code", "Name", "CNIC", "Phone", "Email", "Department", "Role", "Branch", "Joined", "Status"];
    const esc = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const lines = [cols.map(esc).join(",")].concat(
      (data || []).map((e) =>
        [
          e.employee_code,
          e.full_name,
          e.cnic,
          e.phone,
          e.email,
          e.department,
          e.roles?.name,
          e.branches?.name,
          e.joining_date,
          titleCase(e.employment_status),
        ]
          .map(esc)
          .join(",")
      )
    );
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "employees.csv";
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const managerName = (id) => managers.find((m) => m.id === id)?.full_name || "—";
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const setF = (k) => (e) => setForm((p) => ({ ...p, [k]: e.target.value }));
  const setD = (k) => (e) => setDraft((p) => ({ ...p, [k]: e.target.value }));

  const statCards = [
    { icon: "Users", color: "text-primary", value: stats.total, label: "Total Employees", cls: "xl:col-span-2" },
    { icon: "CheckCircle2", color: "text-success", value: stats.active, label: "Active Employees", cls: "xl:col-span-2" },
    { icon: "User", color: "text-pending", value: stats.technicians, label: "Technicians", cls: "xl:col-span-3" },
    { icon: "Users", color: "text-warning", value: stats.support, label: "Support Staff", cls: "xl:col-span-2" },
    { icon: "AlertCircle", color: "text-danger", value: stats.inactive, label: "Inactive Employees", cls: "xl:col-span-3" },
  ];

  return (
    <>
      <div className="grid grid-cols-12 gap-6">
        {/* Header */}
        <div className="col-span-12 intro-y flex flex-col lg:flex-row lg:items-center">
          <div>
            <h2 className="text-lg font-medium">Employees</h2>
            <div className="text-slate-500 mt-1">Manage staff, departments and employee accounts.</div>
          </div>
          <div className="flex flex-wrap gap-2 lg:ml-auto mt-4 lg:mt-0">
            {canCreate && (
              <button type="button" onClick={openAdd} className="btn btn-primary shadow-md">
                <Lucide icon="Plus" className="w-4 h-4 mr-2" /> Add Employee
              </button>
            )}
            {canExport && (
              <button type="button" onClick={handleExport} className="btn btn-outline-secondary">
                <Lucide icon="Download" className="w-4 h-4 mr-2" /> Export Employees
              </button>
            )}
          </div>
        </div>

        {banner && (
          <div className="col-span-12 intro-y">
            <div className="box p-3 px-4 bg-success/10 text-success text-sm flex items-center">
              <Lucide icon="CheckCircle2" className="w-4 h-4 mr-2 flex-none" />
              {banner}
            </div>
          </div>
        )}
        {error && (
          <div className="col-span-12 intro-y">
            <div className="box p-3 px-4 bg-danger/10 text-danger text-sm flex items-center">
              <Lucide icon="AlertCircle" className="w-4 h-4 mr-2 flex-none" />
              {error}
            </div>
          </div>
        )}

        {/* Search */}
        <div className="col-span-12 intro-y">
          <div className="box p-5">
            <div className="relative text-slate-500">
              <Lucide icon="Search" className="w-5 h-5 z-10 absolute my-auto inset-y-0 ml-4 left-0" />
              <input
                type="text"
                value={draft.search}
                onChange={setD("search")}
                onKeyDown={(e) => e.key === "Enter" && applyFilters()}
                className="form-control w-full box pl-12 py-3 text-base"
                placeholder="Search by Employee ID, Name, Phone Number, Email or Department"
              />
            </div>
            <div className="grid grid-cols-12 gap-3 mt-4">
              <div className="col-span-12 sm:col-span-6 lg:col-span-3">
                <label className="text-xs text-slate-500">Department</label>
                <select className="form-select box mt-1 w-full" value={draft.department} onChange={setD("department")}>
                  <option value="">All Departments</option>
                  {DEPARTMENTS.map((d) => (
                    <option key={d} value={d}>{d}</option>
                  ))}
                </select>
              </div>
              <div className="col-span-12 sm:col-span-6 lg:col-span-3">
                <label className="text-xs text-slate-500">Role</label>
                <select className="form-select box mt-1 w-full" value={draft.role_id} onChange={setD("role_id")}>
                  <option value="">All Roles</option>
                  {roles.map((r) => (
                    <option key={r.id} value={r.id}>{r.name}</option>
                  ))}
                </select>
              </div>
              <div className="col-span-12 sm:col-span-6 lg:col-span-3">
                <label className="text-xs text-slate-500">Employment Status</label>
                <select
                  className="form-select box mt-1 w-full"
                  value={draft.employment_status}
                  onChange={setD("employment_status")}
                >
                  <option value="">All Employment Statuses</option>
                  {EMPLOYMENT_STATUS_OPTIONS.map((s) => (
                    <option key={s} value={s}>{titleCase(s)}</option>
                  ))}
                </select>
              </div>
              <div className="col-span-12 sm:col-span-6 lg:col-span-3">
                <label className="text-xs text-slate-500">Account Status</label>
                <select className="form-select box mt-1 w-full" value={draft.account_status} onChange={setD("account_status")}>
                  <option value="">All Account Statuses</option>
                  <option value="enabled">Enabled</option>
                  <option value="disabled">Disabled</option>
                </select>
              </div>
              {!session?.branchId && branches.length > 0 && (
                <div className="col-span-12 sm:col-span-6 lg:col-span-3">
                  <label className="text-xs text-slate-500">Branch</label>
                  <select className="form-select box mt-1 w-full" value={draft.branch_id} onChange={setD("branch_id")}>
                    <option value="">All Branches</option>
                    {branches.map((b) => (
                      <option key={b.id} value={b.id}>{b.name}</option>
                    ))}
                  </select>
                </div>
              )}
              <div className="col-span-12 sm:col-span-6 lg:col-span-3">
                <label className="text-xs text-slate-500">Field Collection Agent</label>
                <select className="form-select box mt-1 w-full" value={draft.collector} onChange={setD("collector")}>
                  <option value="">All Employees</option>
                  <option value="yes">Collectors only</option>
                  <option value="no">Not collectors</option>
                </select>
              </div>
              <div className="col-span-12 flex gap-2">
                <button type="button" onClick={applyFilters} className="btn btn-primary w-full sm:w-40">Search</button>
                <button type="button" onClick={resetFilters} className="btn btn-outline-secondary w-full sm:w-40">Reset</button>
              </div>
            </div>
          </div>
        </div>

        {/* Summary cards */}
        {statCards.map((c) => (
          <div key={c.label} className={classnames("col-span-12 sm:col-span-6 lg:col-span-4 intro-y", c.cls)}>
            <div className="box p-5 flex items-center">
              <Lucide icon={c.icon} className={classnames("w-8 h-8 mr-4 flex-none", c.color)} />
              <div>
                <div className="text-xl font-medium">{c.value}</div>
                <div className="text-slate-500 text-xs mt-0.5">{c.label}</div>
              </div>
            </div>
          </div>
        ))}

        {/* Table */}
        <div className="col-span-12 mt-2">
          <div className="intro-y flex items-center h-10">
            <h2 className="text-lg font-medium truncate mr-5">Employee Records</h2>
            <div className="ml-auto text-slate-500 text-sm">
              {total} result{total === 1 ? "" : "s"}
            </div>
          </div>

          {loading ? (
            <div className="intro-y box p-10 mt-5 text-center text-slate-500">Loading employees...</div>
          ) : employees.length === 0 ? (
            <div className="intro-y box p-10 mt-5 flex flex-col items-center justify-center text-center">
              <Lucide icon="Users" className="w-12 h-12 text-slate-300 mb-3" />
              <div className="text-slate-500 mb-5">No employees found.</div>
              {canCreate && (
                <button type="button" onClick={openAdd} className="btn btn-primary shadow-md">
                  <Lucide icon="Plus" className="w-4 h-4 mr-2" /> Add Employee
                </button>
              )}
            </div>
          ) : (
            <div className="intro-y w-full overflow-x-auto mt-5">
              <table className="table table-report w-full min-w-[1500px]">
                <thead>
                  <tr>
                    <th className="whitespace-nowrap">EMPLOYEE ID</th>
                    <th className="whitespace-nowrap">EMPLOYEE NAME</th>
                    <th className="whitespace-nowrap">DEPARTMENT</th>
                    <th className="whitespace-nowrap">ROLE</th>
                    <th className="whitespace-nowrap">BRANCH</th>
                    <th className="whitespace-nowrap">PHONE NUMBER</th>
                    <th className="whitespace-nowrap">EMAIL</th>
                    <th className="text-center whitespace-nowrap">EMPLOYMENT STATUS</th>
                    <th className="text-center whitespace-nowrap">LOGIN / ACCOUNT</th>
                    <th className="text-center whitespace-nowrap min-w-[200px]">ACTIONS</th>
                  </tr>
                </thead>
                <tbody>
                  {employees.map((emp) => {
                    const acc = accountState(emp);
                    return (
                      <tr key={emp.id} className="intro-x">
                        <td className="whitespace-nowrap font-medium">{emp.employee_code}</td>
                        <td className="whitespace-nowrap">
                          {emp.full_name}
                          {emp.is_collector && <span className="ml-2"><Badge cls="bg-pending/20 text-pending">Collector</Badge></span>}
                        </td>
                        <td className="whitespace-nowrap">{emp.department || "—"}</td>
                        <td className="whitespace-nowrap">{emp.roles?.name || "—"}</td>
                        <td className="whitespace-nowrap">{emp.branches?.name || "All branches"}</td>
                        <td className="whitespace-nowrap">{emp.phone || "—"}</td>
                        <td className="whitespace-nowrap">{emp.email || "—"}</td>
                        <td className="w-36">
                          <div className="flex justify-center">
                            <Badge cls={EMPLOYMENT_BADGE_CLASSES[emp.employment_status]}>
                              {titleCase(emp.employment_status)}
                            </Badge>
                          </div>
                        </td>
                        <td className="w-32">
                          <div className="flex justify-center">
                            <Badge cls={ACCOUNT_BADGE_CLASSES[acc]}>{accountLabel(acc)}</Badge>
                          </div>
                        </td>
                        <td className="table-report__action w-auto min-w-[200px] whitespace-nowrap">
                          <div className="flex justify-center items-center gap-3">
                            <Tippy tag="a" href="" content="View Details" onClick={(e) => { e.preventDefault(); openDetails(emp); }}>
                              <Lucide icon="Eye" className="w-4 h-4 text-slate-500 hover:text-primary" />
                            </Tippy>
                            {canEdit && (
                              <Tippy tag="a" href="" content="Edit" onClick={(e) => { e.preventDefault(); openEdit(emp); }}>
                                <Lucide icon="Edit" className="w-4 h-4 text-slate-500 hover:text-primary" />
                              </Tippy>
                            )}
                            {isAdmin && !emp.profile_id && (
                              <Tippy tag="a" href="" content="Create Login" onClick={(e) => { e.preventDefault(); openCreateLogin(emp); }}>
                                <Lucide icon="Key" className="w-4 h-4 text-slate-500 hover:text-primary" />
                              </Tippy>
                            )}
                            {isAdmin && emp.profile_id && emp.profile_id !== session?.user?.id && (
                              <Tippy
                                tag="a"
                                href=""
                                content={acc === "enabled" ? "Disable Login" : "Enable Login"}
                                onClick={(e) => {
                                  e.preventDefault();
                                  if (busyId !== emp.id) handleToggleLogin(emp);
                                }}
                              >
                                <Lucide
                                  icon="Power"
                                  className={classnames(
                                    "w-4 h-4 hover:text-primary",
                                    acc === "enabled" ? "text-success" : "text-slate-400"
                                  )}
                                />
                              </Tippy>
                            )}
                            {canDelete && (
                              <Tippy tag="a" href="" content="Delete" onClick={(e) => { e.preventDefault(); if (busyId !== emp.id) handleDelete(emp); }}>
                                <Lucide icon="Trash2" className="w-4 h-4 text-slate-500 hover:text-danger" />
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

          {total > PAGE_SIZE && (
            <div className="intro-y flex items-center justify-between mt-4 text-sm text-slate-500">
              <div>
                Page {page + 1} of {pageCount}
              </div>
              <div className="flex gap-2">
                <button type="button" className="btn btn-outline-secondary" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>
                  Previous
                </button>
                <button
                  type="button"
                  className="btn btn-outline-secondary"
                  disabled={page + 1 >= pageCount}
                  onClick={() => setPage((p) => p + 1)}
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Add / Edit modal */}
      {formOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60" onClick={() => !saving && setFormOpen(false)}></div>
          <div className="relative box w-full max-w-2xl p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center mb-5">
              <h2 className="text-lg font-medium">{editing ? `Edit Employee ${editing.employee_code || ""}` : "Add Employee"}</h2>
              <button type="button" onClick={() => setFormOpen(false)} className="ml-auto text-slate-500 hover:text-slate-700" aria-label="Close">
                <Lucide icon="X" className="w-5 h-5" />
              </button>
            </div>
            {formError && <div className="mb-4 p-3 rounded-md bg-danger/10 text-danger text-sm">{formError}</div>}
            <div className="grid grid-cols-12 gap-4">
              <div className="col-span-6">
                <label className="text-xs text-slate-500">Full Name</label>
                <input type="text" className="form-control box mt-1 w-full" placeholder="e.g. Usman Khan" value={form.full_name} onChange={setF("full_name")} />
              </div>
              <div className="col-span-6">
                <label className="text-xs text-slate-500">CNIC</label>
                <input type="text" className="form-control box mt-1 w-full" placeholder="e.g. 42101-1234567-1" value={form.cnic} onChange={setF("cnic")} />
              </div>
              <div className="col-span-6">
                <label className="text-xs text-slate-500">Phone Number</label>
                <input type="text" className="form-control box mt-1 w-full" placeholder="e.g. 0300-1234567" value={form.phone} onChange={setF("phone")} />
              </div>
              <div className="col-span-6">
                <label className="text-xs text-slate-500">Email</label>
                <input type="email" className="form-control box mt-1 w-full" placeholder="e.g. usman@isp.com" value={form.email} onChange={setF("email")} />
              </div>
              <div className="col-span-12">
                <label className="text-xs text-slate-500">Address</label>
                <input type="text" className="form-control box mt-1 w-full" placeholder="Optional" value={form.address} onChange={setF("address")} />
              </div>
              <div className="col-span-6">
                <label className="text-xs text-slate-500">Department</label>
                <select className="form-select box mt-1 w-full" value={form.department} onChange={setF("department")}>
                  {form.department && !DEPARTMENTS.includes(form.department) && (
                    <option value={form.department}>{form.department}</option>
                  )}
                  {DEPARTMENTS.map((d) => (
                    <option key={d} value={d}>{d}</option>
                  ))}
                </select>
              </div>
              <div className="col-span-6">
                <label className="text-xs text-slate-500">Role</label>
                <select className="form-select box mt-1 w-full" value={form.role_id} onChange={setF("role_id")}>
                  <option value="">No role</option>
                  {roles.map((r) => (
                    <option key={r.id} value={r.id}>{r.name}</option>
                  ))}
                </select>
              </div>
              <div className="col-span-6">
                <label className="text-xs text-slate-500">Manager</label>
                <select className="form-select box mt-1 w-full" value={form.manager_id} onChange={setF("manager_id")}>
                  <option value="">No manager</option>
                  {managers
                    .filter((m) => m.id !== editing?.id)
                    .map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.full_name} ({m.employee_code})
                      </option>
                    ))}
                </select>
              </div>
              <div className="col-span-6">
                <label className="text-xs text-slate-500">Joining Date</label>
                <input type="date" className="form-control box mt-1 w-full" value={form.joining_date} onChange={setF("joining_date")} />
              </div>
              <div className="col-span-6">
                <label className="text-xs text-slate-500">Username</label>
                <input type="text" className="form-control box mt-1 w-full" placeholder="e.g. usman.khan" value={form.username} onChange={setF("username")} />
              </div>
              <div className="col-span-6">
                <label className="text-xs text-slate-500">Employment Status</label>
                <select className="form-select box mt-1 w-full" value={form.employment_status} onChange={setF("employment_status")}>
                  {EMPLOYMENT_STATUS_OPTIONS.map((s) => (
                    <option key={s} value={s}>{titleCase(s)}</option>
                  ))}
                </select>
              </div>
              {!session?.branchId && (
                <div className="col-span-6">
                  <label className="text-xs text-slate-500">Branch</label>
                  <select className="form-select box mt-1 w-full" value={form.branch_id} onChange={setF("branch_id")}>
                    <option value="">All branches</option>
                    {branches.map((b) => (
                      <option key={b.id} value={b.id}>{b.name}</option>
                    ))}
                  </select>
                </div>
              )}
              {isAdmin && (
                <div className="col-span-6">
                  <label className="text-xs text-slate-500">Salary (PKR, visible to ISP admin only)</label>
                  <input type="number" min="0" className="form-control box mt-1 w-full" placeholder="e.g. 45000" value={form.salary} onChange={setF("salary")} />
                </div>
              )}
              <div className="col-span-12 sm:col-span-6">
                <label className="flex items-center gap-2 text-sm mt-6">
                  <input type="checkbox" className="form-check-input" checked={form.is_collector} onChange={(e) => setForm((p) => ({ ...p, is_collector: e.target.checked }))} />
                  Field collection agent
                </label>
              </div>
              <div className="col-span-12 sm:col-span-6">
                <label className="text-xs text-slate-500">Commission % (on cash collected, paid through payroll)</label>
                <input type="number" min="0" max="100" step="0.01" className="form-control box mt-1 w-full" placeholder="0 - 100" value={form.commission_percent} onChange={setF("commission_percent")} />
              </div>
              <div className="col-span-12">
                <label className="text-xs text-slate-500">Remarks</label>
                <textarea className="form-control box mt-1 w-full" rows={2} placeholder="Optional note about this employee" value={form.remarks} onChange={setF("remarks")}></textarea>
              </div>
            </div>
            <div className="text-xs text-slate-500 mt-4">
              Logins are created separately with the key icon in the list (an invitation e-mail is sent to the employee).
            </div>
            <div className="flex justify-end gap-2 mt-6">
              <button type="button" onClick={() => setFormOpen(false)} className="btn btn-outline-secondary" disabled={saving}>Cancel</button>
              <button type="button" onClick={handleSave} className="btn btn-primary shadow-md" disabled={saving}>
                {saving ? "Saving..." : "Save Employee"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Create login modal */}
      {loginFor && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60" onClick={() => !loginBusy && setLoginFor(null)}></div>
          <div className="relative box w-full max-w-md p-6">
            <div className="flex items-center mb-5">
              <h2 className="text-lg font-medium">Create Login for {loginFor.full_name}</h2>
              <button type="button" onClick={() => setLoginFor(null)} className="ml-auto text-slate-500 hover:text-slate-700" aria-label="Close">
                <Lucide icon="X" className="w-5 h-5" />
              </button>
            </div>
            {loginMsg && (
              <div className={classnames("mb-4 p-3 rounded-md text-sm", loginMsg.ok ? "bg-success/10 text-success" : "bg-danger/10 text-danger")}>
                {loginMsg.text}
              </div>
            )}
            <div className="grid grid-cols-12 gap-4">
              <div className="col-span-12">
                <label className="text-xs text-slate-500">Login e-mail</label>
                <input type="email" className="form-control box mt-1 w-full" value={loginForm.email} onChange={(e) => setLoginForm((p) => ({ ...p, email: e.target.value }))} />
              </div>
              <div className="col-span-12">
                <label className="text-xs text-slate-500">Account type</label>
                <select className="form-select box mt-1 w-full" value={loginForm.role} onChange={(e) => setLoginForm((p) => ({ ...p, role: e.target.value }))}>
                  <option value="isp_staff">Staff (permissions from role)</option>
                  <option value="isp_admin">ISP Administrator (full access)</option>
                </select>
              </div>
              <div className="col-span-12">
                <label className="text-xs text-slate-500">Role</label>
                <select className="form-select box mt-1 w-full" value={loginForm.role_id} onChange={(e) => setLoginForm((p) => ({ ...p, role_id: e.target.value }))}>
                  <option value="">No role</option>
                  {roles.map((r) => (
                    <option key={r.id} value={r.id}>{r.name}</option>
                  ))}
                </select>
              </div>
              {roles.find((r) => r.id === loginForm.role_id)?.name === "Collection Agent" && (
                <div className="col-span-12 p-3 rounded-md bg-primary/10 text-primary text-xs">
                  This employee will be marked as a field collection agent. This login will only see the customers assigned to them.
                </div>
              )}
              <div className="col-span-12">
                <label className="text-xs text-slate-500">Pin to branch</label>
                <select className="form-select box mt-1 w-full" value={loginForm.branch_id} onChange={(e) => setLoginForm((p) => ({ ...p, branch_id: e.target.value }))}>
                  <option value="">All branches</option>
                  {branches.map((b) => (
                    <option key={b.id} value={b.id}>{b.name}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-6">
              <button type="button" onClick={() => setLoginFor(null)} className="btn btn-outline-secondary" disabled={loginBusy}>
                {loginMsg?.ok ? "Close" : "Cancel"}
              </button>
              {!loginMsg?.ok && (
                <button type="button" onClick={handleCreateLogin} className="btn btn-primary shadow-md" disabled={loginBusy}>
                  {loginBusy ? "Sending..." : "Send Invitation"}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Details modal */}
      {details && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60" onClick={() => setDetails(null)}></div>
          <div className="relative box w-full max-w-xl p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center mb-5">
              <h2 className="text-lg font-medium">Employee Details</h2>
              <button type="button" onClick={() => setDetails(null)} className="ml-auto text-slate-500 hover:text-slate-700" aria-label="Close">
                <Lucide icon="X" className="w-5 h-5" />
              </button>
            </div>
            <div className="grid grid-cols-2 gap-y-4 gap-x-4 text-sm">
              {[
                ["Employee ID", details.employee_code],
                ["Full Name", details.full_name],
                ["CNIC", details.cnic],
                ["Phone Number", details.phone],
                ["Email", details.email],
                ["Username", details.username],
                ["Department", details.department],
                ["Role", details.roles?.name],
                ["Branch", details.branches?.name || "All branches"],
                ["Manager", managerName(details.manager_id)],
                ["Joining Date", formatDate(details.joining_date)],
                ["Field Collection Agent", details.is_collector ? "Yes" : "No"],
                ["Commission %", details.is_collector || Number(details.commission_percent) > 0 ? `${Number(details.commission_percent || 0)}% on cash collected, paid through payroll` : "—"],
              ].map(([k, v]) => (
                <div key={k}>
                  <div className="text-slate-500 text-xs">{k}</div>
                  <div className="font-medium">{v || "—"}</div>
                </div>
              ))}
              {isAdmin && (
                <div>
                  <div className="text-slate-500 text-xs">Salary</div>
                  <div className="font-medium">{detailsExtra.salary != null ? money(detailsExtra.salary) : "—"}</div>
                </div>
              )}
              <div className="col-span-2">
                <div className="text-slate-500 text-xs">Address</div>
                <div className="font-medium">{details.address || "—"}</div>
              </div>
              <div>
                <div className="text-slate-500 text-xs mb-1">Employment Status</div>
                <Badge cls={EMPLOYMENT_BADGE_CLASSES[details.employment_status]}>{titleCase(details.employment_status)}</Badge>
              </div>
              <div>
                <div className="text-slate-500 text-xs mb-1">Login / Account</div>
                <Badge cls={ACCOUNT_BADGE_CLASSES[accountState(details)]}>{accountLabel(accountState(details))}</Badge>
              </div>
              {details.profiles?.email && (
                <div className="col-span-2">
                  <div className="text-slate-500 text-xs">Login e-mail</div>
                  <div className="font-medium">{details.profiles.email}</div>
                </div>
              )}
              <div className="col-span-2">
                <div className="text-slate-500 text-xs">Remarks</div>
                <div className="font-medium">{details.remarks || "—"}</div>
              </div>
            </div>

            <div className="mt-6 border-t border-slate-200/60 dark:border-darkmode-400 pt-4">
              <div className="text-sm font-medium mb-2">Open Assigned Support Tickets</div>
              {detailsExtra.loading ? (
                <div className="text-slate-400 text-xs">Loading...</div>
              ) : detailsExtra.tickets.length === 0 ? (
                <div className="text-slate-400 text-xs">No tickets currently assigned.</div>
              ) : (
                <ul className="space-y-1.5">
                  {detailsExtra.tickets.map((t) => (
                    <li key={t.id} className="text-xs bg-slate-100 dark:bg-darkmode-300 rounded-md px-3 py-2">
                      {t.ticket_number} - {titleCase(t.status)}
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div className="mt-4 border-t border-slate-200/60 dark:border-darkmode-400 pt-4">
              <div className="text-sm font-medium mb-2">Open Assigned Installations</div>
              {detailsExtra.loading ? (
                <div className="text-slate-400 text-xs">Loading...</div>
              ) : detailsExtra.installations.length === 0 ? (
                <div className="text-slate-400 text-xs">No installations currently assigned.</div>
              ) : (
                <ul className="space-y-1.5">
                  {detailsExtra.installations.map((i) => (
                    <li key={i.id} className="text-xs bg-slate-100 dark:bg-darkmode-300 rounded-md px-3 py-2">
                      {i.installation_number} - {titleCase(i.status)}
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="flex justify-end gap-2 mt-6">
              <button type="button" onClick={() => setDetails(null)} className="btn btn-outline-secondary">Close</button>
              {canEdit && (
                <button
                  type="button"
                  onClick={() => {
                    const e = details;
                    setDetails(null);
                    openEdit(e);
                  }}
                  className="btn btn-primary shadow-md"
                >
                  <Lucide icon="Edit" className="w-4 h-4 mr-2" /> Edit
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export default Main;
