import { Lucide, Tippy } from "@/base-components";
import classnames from "classnames";
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { getSession } from "@/lib/session";
import { friendlyError } from "@/lib/errors";
import { titleCase } from "@/lib/format";

// Friendly label -> permission key stored in roles.permissions
const MODULES = [
  { key: "dashboard", label: "Dashboard" },
  { key: "subscribers", label: "Subscribers" },
  { key: "packages", label: "Packages" },
  { key: "billing", label: "Billing" },
  { key: "payments", label: "Payments" },
  { key: "invoices", label: "Invoices" },
  { key: "resellers", label: "Resellers / LCO" },
  { key: "tickets", label: "Support Tickets" },
  { key: "inventory", label: "Inventory" },
  { key: "network", label: "Network" },
  { key: "employees", label: "Employees" },
  { key: "users_roles", label: "Users & Roles" },
  { key: "reports", label: "Reports" },
  { key: "settings", label: "Settings" },
  { key: "accounting", label: "Accounting" },
  { key: "collections", label: "Field Collection" },
  { key: "leads", label: "Leads / New Connections" },
  { key: "hr", label: "HR & Payroll" },
  { key: "purchasing", label: "Purchasing" },
];

const ACTIONS = [
  { key: "view", label: "View" },
  { key: "create", label: "Create" },
  { key: "edit", label: "Edit" },
  { key: "delete", label: "Delete" },
  { key: "export", label: "Export" },
];

// Always exactly the 14 modules x 5 actions, whatever the stored jsonb contains.
function normalizePermissions(raw) {
  const out = {};
  MODULES.forEach((m) => {
    const src = (raw && raw[m.key]) || {};
    out[m.key] = {};
    ACTIONS.forEach((a) => {
      out[m.key][a.key] = Boolean(src[a.key]);
    });
  });
  return out;
}

const emptyPermissions = () => normalizePermissions({});
const PAGE_SIZE = 10;

const ACCOUNT_BADGE_CLASSES = {
  active: "bg-success/20 text-success",
  disabled: "bg-slate-300 text-slate-600 dark:bg-darkmode-400 dark:text-slate-300",
};

function Badge({ cls, children }) {
  return (
    <div className={classnames("py-1 px-2 rounded-full text-xs font-medium inline-block whitespace-nowrap", cls)}>
      {children}
    </div>
  );
}

function Main() {
  const [session, setSession] = useState(null);
  const isAdmin = session?.role === "isp_admin";

  const [roles, setRoles] = useState([]);
  const [usage, setUsage] = useState({}); // role_id -> number of profiles + employees
  const [branches, setBranches] = useState([]);
  const [rolesLoading, setRolesLoading] = useState(true);

  const [users, setUsers] = useState([]);
  const [usersTotal, setUsersTotal] = useState(0);
  const [usersLoading, setUsersLoading] = useState(true);
  const [page, setPage] = useState(0);
  const [stats, setStats] = useState({ total: 0, active: 0, disabled: 0 });

  const [draft, setDraft] = useState({ search: "", role_id: "", status: "" });
  const [filters, setFilters] = useState({ search: "", role_id: "", status: "" });

  const [error, setError] = useState("");
  const [banner, setBanner] = useState("");
  const [busy, setBusy] = useState(false);
  const [busyUser, setBusyUser] = useState(null);

  // role editor
  const [editor, setEditor] = useState({ open: false, role: null });
  const [editorName, setEditorName] = useState("");
  const [editorDesc, setEditorDesc] = useState("");
  const [editorPerms, setEditorPerms] = useState(emptyPermissions());
  const [editorError, setEditorError] = useState("");

  // user editor
  const [userEdit, setUserEdit] = useState(null);
  const [userForm, setUserForm] = useState({ role_id: "", branch_id: "" });
  const [userError, setUserError] = useState("");

  const flash = (msg) => {
    setBanner(msg);
    window.clearTimeout(flash._t);
    flash._t = window.setTimeout(() => setBanner(""), 4000);
  };

  const loadRoles = useCallback(async () => {
    setRolesLoading(true);
    const [r, p, e] = await Promise.all([
      supabase.from("roles").select("*").order("is_system", { ascending: false }).order("name"),
      supabase.from("profiles").select("role_id").not("role_id", "is", null).limit(5000),
      supabase.from("employees").select("role_id").not("role_id", "is", null).limit(5000),
    ]);
    if (r.error) setError(friendlyError(r.error));
    setRoles(r.data || []);
    const counts = {};
    [...(p.data || []), ...(e.data || [])].forEach((x) => {
      counts[x.role_id] = (counts[x.role_id] || 0) + 1;
    });
    setUsage(counts);
    setRolesLoading(false);
  }, []);

  const loadUsers = useCallback(async () => {
    setUsersLoading(true);
    const from = page * PAGE_SIZE;
    let q = supabase
      .from("profiles")
      .select("id, full_name, email, phone, role, role_id, branch_id, status, created_at, roles(name)", { count: "exact" })
      .neq("role", "platform_admin");
    if (filters.search) {
      const s = filters.search.replace(/[,()%]/g, " ").trim();
      if (s) q = q.or(`full_name.ilike.%${s}%,email.ilike.%${s}%,phone.ilike.%${s}%`);
    }
    if (filters.role_id) q = q.eq("role_id", filters.role_id);
    if (filters.status) q = q.eq("status", filters.status);
    const { data, error: err, count } = await q.order("full_name").range(from, from + PAGE_SIZE - 1);
    if (err) setError(friendlyError(err));
    setUsers(data || []);
    setUsersTotal(count || 0);
    setUsersLoading(false);
  }, [page, filters]);

  const loadStats = useCallback(async () => {
    const head = () =>
      supabase.from("profiles").select("id", { count: "exact", head: true }).neq("role", "platform_admin");
    const [a, b, c] = await Promise.all([head(), head().eq("status", "active"), head().eq("status", "disabled")]);
    setStats({ total: a.count || 0, active: b.count || 0, disabled: c.count || 0 });
  }, []);

  useEffect(() => {
    (async () => {
      setSession(await getSession());
      const { data } = await supabase.from("branches").select("id,name").order("name");
      setBranches(data || []);
    })();
    loadRoles();
  }, [loadRoles]);

  useEffect(() => {
    loadUsers();
  }, [loadUsers]);

  useEffect(() => {
    loadStats();
  }, [loadStats]);

  const applyFilters = () => {
    setPage(0);
    setFilters({ ...draft, search: draft.search.trim() });
  };
  const resetFilters = () => {
    const f = { search: "", role_id: "", status: "" };
    setDraft(f);
    setPage(0);
    setFilters(f);
  };

  const branchName = (id) => (id ? branches.find((b) => b.id === id)?.name || "—" : "All branches");
  const customRoles = roles.filter((r) => !r.is_system).length;
  const readOnlyEditor = editor.role?.is_system || !isAdmin;

  // ---- role editor -------------------------------------------------------
  const openCreateRole = () => {
    setEditorName("");
    setEditorDesc("");
    setEditorPerms(emptyPermissions());
    setEditorError("");
    setEditor({ open: true, role: null });
  };
  const openEditRole = (role) => {
    setEditorName(role.name);
    setEditorDesc(role.description || "");
    setEditorPerms(normalizePermissions(role.permissions));
    setEditorError("");
    setEditor({ open: true, role });
  };
  const closeEditor = () => setEditor({ open: false, role: null });

  const toggleCell = (mod, act) => {
    if (readOnlyEditor) return;
    setEditorPerms((p) => ({ ...p, [mod]: { ...p[mod], [act]: !p[mod][act] } }));
  };
  const toggleColumn = (act) => {
    if (readOnlyEditor) return;
    setEditorPerms((p) => {
      const all = MODULES.every((m) => p[m.key][act]);
      const next = {};
      MODULES.forEach((m) => {
        next[m.key] = { ...p[m.key], [act]: !all };
      });
      return next;
    });
  };

  const handleSaveRole = async () => {
    const name = editorName.trim();
    if (!name) {
      setEditorError("Role name is required.");
      return;
    }
    setBusy(true);
    setEditorError("");
    let err;
    if (editor.role) {
      ({ error: err } = await supabase
        .from("roles")
        .update({ name, description: editorDesc.trim() || null, permissions: editorPerms })
        .eq("id", editor.role.id));
    } else {
      ({ error: err } = await supabase
        .from("roles")
        .insert({ name, description: editorDesc.trim() || null, is_system: false, permissions: editorPerms }));
    }
    setBusy(false);
    if (err) {
      setEditorError(friendlyError(err));
      return;
    }
    flash(editor.role ? `Role "${name}" updated.` : `Role "${name}" created.`);
    closeEditor();
    loadRoles();
  };

  const handleDuplicate = async (role) => {
    let copyName = `${role.name} (Copy)`;
    let n = 2;
    while (roles.some((r) => r.name.toLowerCase() === copyName.toLowerCase())) {
      copyName = `${role.name} (Copy ${n})`;
      n += 1;
    }
    setBusy(true);
    setError("");
    const { error: err } = await supabase.from("roles").insert({
      name: copyName,
      description: role.description,
      is_system: false,
      permissions: normalizePermissions(role.permissions),
    });
    setBusy(false);
    if (err) {
      setError(friendlyError(err));
      return;
    }
    flash(`Role "${role.name}" duplicated as "${copyName}".`);
    loadRoles();
  };

  const handleDelete = async (role) => {
    if (role.is_system || usage[role.id]) return;
    if (!window.confirm(`Delete the role "${role.name}"?`)) return;
    setBusy(true);
    setError("");
    const { error: err } = await supabase.from("roles").delete().eq("id", role.id);
    setBusy(false);
    if (err) {
      setError(friendlyError(err));
      return;
    }
    flash(`Role "${role.name}" deleted.`);
    loadRoles();
  };

  // ---- users -------------------------------------------------------------
  const openUserEdit = (u) => {
    setUserEdit(u);
    setUserForm({ role_id: u.role_id || "", branch_id: u.branch_id || "" });
    setUserError("");
  };

  const handleSaveUser = async () => {
    setBusy(true);
    setUserError("");
    const patch = { branch_id: userForm.branch_id || null };
    if (userEdit.role === "isp_staff") patch.role_id = userForm.role_id || null;
    const { error: err } = await supabase.from("profiles").update(patch).eq("id", userEdit.id);
    setBusy(false);
    if (err) {
      setUserError(friendlyError(err));
      return;
    }
    flash(`${userEdit.full_name || userEdit.email} updated.`);
    setUserEdit(null);
    loadUsers();
    loadRoles();
  };

  const handleToggleUser = async (u) => {
    const next = u.status === "active" ? "disabled" : "active";
    setBusyUser(u.id);
    setError("");
    const { error: err } = await supabase.functions.invoke("set-user-status", {
      body: { user_id: u.id, status: next },
    });
    setBusyUser(null);
    if (err) {
      let msg = "";
      try {
        if (err?.context?.status === 404) {
          msg = "The set-user-status edge function is not deployed yet.";
        } else if (typeof err?.context?.json === "function") {
          msg = (await err.context.json())?.error || "";
        }
      } catch (e) {
        /* ignore */
      }
      if (!msg && /Failed to send|Failed to fetch|FunctionsFetchError/i.test(`${err.message} ${err.name}`)) {
        msg = "Cannot reach the login service. The edge function may not be deployed yet.";
      }
      setError(msg || friendlyError(err));
      return;
    }
    flash(`${u.full_name || u.email} is now ${next}.`);
    loadUsers();
    loadStats();
  };

  const isSelf = (u) => u.id === session?.user?.id;
  const pageCount = Math.max(1, Math.ceil(usersTotal / PAGE_SIZE));

  const statCards = [
    { icon: "Users", color: "text-primary", value: stats.total, label: "Total Users" },
    { icon: "CheckCircle2", color: "text-success", value: stats.active, label: "Active Users" },
    { icon: "AlertCircle", color: "text-danger", value: stats.disabled, label: "Disabled Users" },
    { icon: "Shield", color: "text-pending", value: customRoles, label: "Custom Roles" },
  ];

  return (
    <>
      <div className="grid grid-cols-12 gap-6">
        {/* Header */}
        <div className="col-span-12 intro-y flex flex-col lg:flex-row lg:items-center">
          <div>
            <h2 className="text-lg font-medium">Users & Roles</h2>
            <div className="text-slate-500 mt-1">Manage login accounts, roles and permissions.</div>
          </div>
          <div className="flex flex-wrap gap-2 lg:ml-auto mt-4 lg:mt-0">
            {isAdmin && (
              <button type="button" onClick={openCreateRole} className="btn btn-primary shadow-md">
                <Lucide icon="Plus" className="w-4 h-4 mr-2" /> Create Role
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
        {!isAdmin && session && (
          <div className="col-span-12 intro-y">
            <div className="box p-3 px-4 bg-warning/10 text-warning text-sm">
              Only ISP administrators can change roles, permissions and user accounts. You can view them here.
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
                onChange={(e) => setDraft((p) => ({ ...p, search: e.target.value }))}
                onKeyDown={(e) => e.key === "Enter" && applyFilters()}
                className="form-control w-full box pl-12 py-3 text-base"
                placeholder="Search users by Name, Email or Phone Number"
              />
            </div>
            <div className="grid grid-cols-12 gap-3 mt-4">
              <div className="col-span-12 sm:col-span-6">
                <label className="text-xs text-slate-500">Role</label>
                <select className="form-select box mt-1 w-full" value={draft.role_id} onChange={(e) => setDraft((p) => ({ ...p, role_id: e.target.value }))}>
                  <option value="">All Roles</option>
                  {roles.map((r) => (
                    <option key={r.id} value={r.id}>{r.name}</option>
                  ))}
                </select>
              </div>
              <div className="col-span-12 sm:col-span-6">
                <label className="text-xs text-slate-500">Account Status</label>
                <select className="form-select box mt-1 w-full" value={draft.status} onChange={(e) => setDraft((p) => ({ ...p, status: e.target.value }))}>
                  <option value="">All Account Statuses</option>
                  <option value="active">Active</option>
                  <option value="disabled">Disabled</option>
                </select>
              </div>
              <div className="col-span-12 flex gap-2">
                <button type="button" onClick={applyFilters} className="btn btn-primary w-full sm:w-40">Search</button>
                <button type="button" onClick={resetFilters} className="btn btn-outline-secondary w-full sm:w-40">Reset</button>
              </div>
            </div>
          </div>
        </div>

        {/* Summary */}
        {statCards.map((c) => (
          <div key={c.label} className="col-span-12 sm:col-span-6 lg:col-span-3 intro-y">
            <div className="box p-5 flex items-center">
              <Lucide icon={c.icon} className={classnames("w-8 h-8 mr-4 flex-none", c.color)} />
              <div>
                <div className="text-xl font-medium">{c.value}</div>
                <div className="text-slate-500 text-xs mt-0.5">{c.label}</div>
              </div>
            </div>
          </div>
        ))}

        {/* Users */}
        <div className="col-span-12 mt-2">
          <div className="intro-y flex items-center h-10">
            <h2 className="text-lg font-medium truncate mr-5">System Users</h2>
            <div className="ml-auto text-slate-500 text-sm">
              {usersTotal} result{usersTotal === 1 ? "" : "s"}
            </div>
          </div>
          <div className="text-xs text-slate-500 mt-1">
            New logins are created from the Employees page (Create Login). A user pinned to a branch only sees that
            branch's data (plus records that belong to no branch); a user with no branch sees every branch.
          </div>

          {usersLoading ? (
            <div className="intro-y box p-10 mt-5 text-center text-slate-500">Loading users...</div>
          ) : users.length === 0 ? (
            <div className="intro-y box p-10 mt-5 flex flex-col items-center justify-center text-center">
              <Lucide icon="Users" className="w-12 h-12 text-slate-300 mb-3" />
              <div className="text-slate-500">No users found.</div>
            </div>
          ) : (
            <div className="intro-y w-full overflow-x-auto mt-5">
              <table className="table table-report w-full min-w-[1100px]">
                <thead>
                  <tr>
                    <th className="whitespace-nowrap">NAME</th>
                    <th className="whitespace-nowrap">EMAIL</th>
                    <th className="whitespace-nowrap">PHONE NUMBER</th>
                    <th className="whitespace-nowrap">ROLE</th>
                    <th className="whitespace-nowrap">BRANCH</th>
                    <th className="text-center whitespace-nowrap">ACCOUNT STATUS</th>
                    <th className="text-center whitespace-nowrap min-w-[140px]">ACTIONS</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((u) => (
                    <tr key={u.id} className="intro-x">
                      <td className="whitespace-nowrap font-medium">
                        {u.full_name || "—"} {isSelf(u) && <span className="text-xs text-slate-400">(you)</span>}
                      </td>
                      <td className="whitespace-nowrap">{u.email || "—"}</td>
                      <td className="whitespace-nowrap">{u.phone || "—"}</td>
                      <td className="whitespace-nowrap">
                        {u.role === "isp_admin" ? "ISP Administrator" : u.roles?.name || "—"}
                      </td>
                      <td className="whitespace-nowrap">{branchName(u.branch_id)}</td>
                      <td className="w-32">
                        <div className="flex justify-center">
                          <Badge cls={ACCOUNT_BADGE_CLASSES[u.status]}>{titleCase(u.status)}</Badge>
                        </div>
                      </td>
                      <td className="table-report__action w-auto min-w-[140px] whitespace-nowrap">
                        <div className="flex justify-center items-center gap-3">
                          {isAdmin && !isSelf(u) ? (
                            <>
                              <Tippy tag="a" href="" content="Change Role / Branch" onClick={(e) => { e.preventDefault(); openUserEdit(u); }}>
                                <Lucide icon="Shield" className="w-4 h-4 text-slate-500 hover:text-primary" />
                              </Tippy>
                              <Tippy
                                tag="a"
                                href=""
                                content={u.status === "active" ? "Disable" : "Enable"}
                                onClick={(e) => {
                                  e.preventDefault();
                                  if (busyUser !== u.id) handleToggleUser(u);
                                }}
                              >
                                <Lucide
                                  icon="Power"
                                  className={classnames("w-4 h-4 hover:text-primary", u.status === "active" ? "text-success" : "text-slate-400")}
                                />
                              </Tippy>
                            </>
                          ) : (
                            <span className="text-xs text-slate-400">{isSelf(u) ? "Your account" : "View only"}</span>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {usersTotal > PAGE_SIZE && (
            <div className="intro-y flex items-center justify-between mt-4 text-sm text-slate-500">
              <div>Page {page + 1} of {pageCount}</div>
              <div className="flex gap-2">
                <button type="button" className="btn btn-outline-secondary" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>Previous</button>
                <button type="button" className="btn btn-outline-secondary" disabled={page + 1 >= pageCount} onClick={() => setPage((p) => p + 1)}>Next</button>
              </div>
            </div>
          )}
        </div>

        {/* Roles */}
        <div className="col-span-12 mt-2">
          <div className="intro-y flex items-center h-10">
            <h2 className="text-lg font-medium truncate mr-5">Roles & Permissions</h2>
            <div className="ml-auto text-slate-500 text-sm">
              {roles.length} role{roles.length === 1 ? "" : "s"}
            </div>
          </div>

          {rolesLoading ? (
            <div className="intro-y box p-10 mt-5 text-center text-slate-500">Loading roles...</div>
          ) : roles.length === 0 ? (
            <div className="intro-y box p-10 mt-5 text-center text-slate-500">No roles yet.</div>
          ) : (
            <div className="intro-y w-full overflow-x-auto mt-5">
              <table className="table table-report w-full min-w-[720px]">
                <thead>
                  <tr>
                    <th className="whitespace-nowrap">ROLE NAME</th>
                    <th className="whitespace-nowrap">DESCRIPTION</th>
                    <th className="whitespace-nowrap">TYPE</th>
                    <th className="text-right whitespace-nowrap">ASSIGNED TO</th>
                    <th className="text-center whitespace-nowrap min-w-[160px]">ACTIONS</th>
                  </tr>
                </thead>
                <tbody>
                  {roles.map((r) => {
                    const inUse = usage[r.id] || 0;
                    const canDelete = isAdmin && !r.is_system && inUse === 0 && !busy;
                    return (
                      <tr key={r.id} className="intro-x">
                        <td className="whitespace-nowrap font-medium">{r.name}</td>
                        <td>{r.description || "—"}</td>
                        <td className="whitespace-nowrap">
                          <Badge cls={r.is_system ? "bg-primary/20 text-primary" : "bg-pending/20 text-pending"}>
                            {r.is_system ? "System" : "Custom"}
                          </Badge>
                        </td>
                        <td className="text-right whitespace-nowrap">{inUse}</td>
                        <td className="table-report__action w-auto min-w-[160px] whitespace-nowrap">
                          <div className="flex justify-center items-center gap-3">
                            <Tippy
                              tag="a"
                              href=""
                              content={r.is_system || !isAdmin ? "View Permissions" : "Edit Role"}
                              onClick={(e) => {
                                e.preventDefault();
                                openEditRole(r);
                              }}
                            >
                              <Lucide icon={r.is_system || !isAdmin ? "Eye" : "Edit"} className="w-4 h-4 text-slate-500 hover:text-primary" />
                            </Tippy>
                            {isAdmin && (
                              <Tippy
                                tag="a"
                                href=""
                                content="Duplicate Role"
                                onClick={(e) => {
                                  e.preventDefault();
                                  if (!busy) handleDuplicate(r);
                                }}
                              >
                                <Lucide icon="Copy" className="w-4 h-4 text-slate-500 hover:text-primary" />
                              </Tippy>
                            )}
                            <Tippy
                              tag="a"
                              href=""
                              content={
                                r.is_system
                                  ? "System roles cannot be deleted"
                                  : inUse > 0
                                  ? "Role is still assigned to users or employees"
                                  : "Delete Role"
                              }
                              onClick={(e) => {
                                e.preventDefault();
                                if (canDelete) handleDelete(r);
                              }}
                            >
                              <Lucide
                                icon="Trash2"
                                className={classnames("w-4 h-4", canDelete ? "text-slate-500 hover:text-danger" : "text-slate-300 cursor-not-allowed")}
                              />
                            </Tippy>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Edit user modal */}
      {userEdit && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60" onClick={() => !busy && setUserEdit(null)}></div>
          <div className="relative box w-full max-w-md p-6">
            <div className="flex items-center mb-5">
              <h2 className="text-lg font-medium">Change Role / Branch</h2>
              <button type="button" onClick={() => setUserEdit(null)} className="ml-auto text-slate-500 hover:text-slate-700" aria-label="Close">
                <Lucide icon="X" className="w-5 h-5" />
              </button>
            </div>
            <div className="text-sm font-medium mb-4">{userEdit.full_name || userEdit.email}</div>
            {userError && <div className="mb-4 p-3 rounded-md bg-danger/10 text-danger text-sm">{userError}</div>}
            <div className="mb-4">
              <label className="text-xs text-slate-500">Role</label>
              {userEdit.role === "isp_admin" ? (
                <div className="text-sm mt-1 text-slate-500">
                  This user is an ISP Administrator and has full access; the role below does not apply.
                </div>
              ) : (
                <select className="form-select box mt-1 w-full" value={userForm.role_id} onChange={(e) => setUserForm((p) => ({ ...p, role_id: e.target.value }))}>
                  <option value="">No role (no permissions)</option>
                  {roles.map((r) => (
                    <option key={r.id} value={r.id}>{r.name}</option>
                  ))}
                </select>
              )}
            </div>
            <div>
              <label className="text-xs text-slate-500">Branch</label>
              <select className="form-select box mt-1 w-full" value={userForm.branch_id} onChange={(e) => setUserForm((p) => ({ ...p, branch_id: e.target.value }))}>
                <option value="">All branches</option>
                {branches.map((b) => (
                  <option key={b.id} value={b.id}>{b.name}</option>
                ))}
              </select>
              <div className="text-xs text-slate-500 mt-2">
                Branch pinning: choosing a branch limits this user to that branch's subscribers, tickets, equipment and
                other records (plus records that belong to no branch). Leave it empty so the user can see all branches.
                The change applies the next time the user signs in or reloads.
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-6">
              <button type="button" onClick={() => setUserEdit(null)} className="btn btn-outline-secondary" disabled={busy}>Cancel</button>
              <button type="button" onClick={handleSaveUser} className="btn btn-primary shadow-md" disabled={busy}>
                {busy ? "Saving..." : "Save"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Role editor modal */}
      {editor.open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60" onClick={() => !busy && closeEditor()}></div>
          <div className="relative box w-full max-w-3xl p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center mb-5">
              <h2 className="text-lg font-medium">
                {editor.role ? (readOnlyEditor ? "Role Permissions" : "Edit Role") : "Create Role"}
              </h2>
              <button type="button" onClick={closeEditor} className="ml-auto text-slate-500 hover:text-slate-700" aria-label="Close">
                <Lucide icon="X" className="w-5 h-5" />
              </button>
            </div>
            {editor.role?.is_system && (
              <div className="mb-4 p-3 rounded-md bg-primary/10 text-primary text-sm">
                This is a system role and cannot be edited. Use Duplicate to make an editable copy.
              </div>
            )}
            {editorError && <div className="mb-4 p-3 rounded-md bg-danger/10 text-danger text-sm">{editorError}</div>}
            <div className="grid grid-cols-12 gap-4 mb-5">
              <div className="col-span-12 sm:col-span-6">
                <label className="text-xs text-slate-500">Role Name</label>
                <input
                  type="text"
                  className="form-control box mt-1 w-full"
                  placeholder="e.g. Front Desk Staff"
                  value={editorName}
                  disabled={readOnlyEditor}
                  onChange={(e) => setEditorName(e.target.value)}
                />
              </div>
              <div className="col-span-12 sm:col-span-6">
                <label className="text-xs text-slate-500">Description</label>
                <input
                  type="text"
                  className="form-control box mt-1 w-full"
                  placeholder="Optional"
                  value={editorDesc}
                  disabled={readOnlyEditor}
                  onChange={(e) => setEditorDesc(e.target.value)}
                />
              </div>
            </div>

            <div className="text-xs text-slate-500 mb-2">
              Choose what this role is allowed to do in each part of the system.
            </div>
            <div className="w-full overflow-x-auto">
              <table className="table table-report w-full min-w-[640px]">
                <thead>
                  <tr>
                    <th className="whitespace-nowrap">MODULE</th>
                    {ACTIONS.map((a) => (
                      <th key={a.key} className="text-center whitespace-nowrap">
                        <div className="flex flex-col items-center gap-1">
                          <span>{a.label}</span>
                          <input
                            type="checkbox"
                            className="form-check-input"
                            disabled={readOnlyEditor}
                            checked={MODULES.every((m) => editorPerms[m.key][a.key])}
                            onChange={() => toggleColumn(a.key)}
                            title={`Toggle ${a.label} for all modules`}
                          />
                        </div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {MODULES.map((m) => (
                    <tr key={m.key}>
                      <td className="whitespace-nowrap">{m.label}</td>
                      {ACTIONS.map((a) => (
                        <td key={a.key} className="text-center">
                          <input
                            type="checkbox"
                            className="form-check-input"
                            disabled={readOnlyEditor}
                            checked={editorPerms[m.key][a.key]}
                            onChange={() => toggleCell(m.key, a.key)}
                          />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex justify-end gap-2 mt-6">
              <button type="button" onClick={closeEditor} className="btn btn-outline-secondary" disabled={busy}>
                {readOnlyEditor ? "Close" : "Cancel"}
              </button>
              {!readOnlyEditor && (
                <button type="button" onClick={handleSaveRole} className="btn btn-primary shadow-md" disabled={busy}>
                  {busy ? "Saving..." : "Save Role"}
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
