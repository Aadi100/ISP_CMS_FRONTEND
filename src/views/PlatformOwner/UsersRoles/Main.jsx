import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { getSession } from "@/lib/session";
import { friendlyError } from "@/lib/errors";
import { formatDate, titleCase } from "@/lib/format";
import { StatusBadge, ErrorBanner, InfoBanner, Pagination, edgeError } from "../shared";

const PAGE_SIZE = 25;
const COLS = "id, full_name, email, phone, role, status, organization_id, created_at, organizations(name, slug)";

function Main() {
  const [me, setMe] = useState(null);
  const [owners, setOwners] = useState([]);
  const [users, setUsers] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [orgs, setOrgs] = useState([]);

  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [orgFilter, setOrgFilter] = useState("all");
  const [roleFilter, setRoleFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");

  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    getSession().then(setMe);
    (async () => {
      const [o, p] = await Promise.all([
        supabase.from("organizations").select("id, name").order("name"),
        supabase.from("profiles").select(COLS).eq("role", "platform_admin").order("created_at"),
      ]);
      setOrgs(o.data || []);
      setOwners(p.data || []);
    })();
  }, []);

  useEffect(() => {
    const t = setTimeout(() => {
      setQuery(search.trim());
      setPage(0);
    }, 300);
    return () => clearTimeout(t);
  }, [search]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      let q = supabase
        .from("profiles")
        .select(COLS, { count: "exact" })
        .neq("role", "platform_admin")
        .order("created_at", { ascending: false })
        .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1);
      if (orgFilter !== "all") q = q.eq("organization_id", orgFilter);
      if (roleFilter !== "all") q = q.eq("role", roleFilter);
      if (statusFilter !== "all") q = q.eq("status", statusFilter);
      if (query) {
        const s = query.replace(/[,()%*]/g, " ");
        q = q.or(`full_name.ilike.%${s}%,email.ilike.%${s}%,phone.ilike.%${s}%`);
      }
      const { data, error: err, count } = await q;
      if (err) throw err;
      setUsers(data || []);
      setTotal(count || 0);
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setLoading(false);
    }
  }, [page, query, orgFilter, roleFilter, statusFilter]);

  useEffect(() => {
    load();
  }, [load]);

  const toggle = async (u) => {
    const status = u.status === "active" ? "disabled" : "active";
    if (status === "disabled" && !window.confirm(`Disable ${u.full_name || u.email}? They will not be able to sign in.`))
      return;
    setBusyId(u.id);
    setError("");
    setNotice("");
    try {
      const { data, error: err } = await supabase.functions.invoke("set-user-status", {
        body: { user_id: u.id, status },
      });
      if (err) {
        setError(await edgeError(err, friendlyError));
        return;
      }
      if (data?.error) {
        setError(data.error);
        return;
      }
      setNotice(`${u.full_name || u.email} is now ${status}.`);
      await load();
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setBusyId("");
    }
  };

  const UserTable = ({ rows, withOrg, canToggle }) => (
    <div className="overflow-x-auto">
      <table className="table table-report">
        <thead>
          <tr>
            <th>NAME</th>
            <th>E-MAIL</th>
            {withOrg && <th>ISP</th>}
            <th>ROLE</th>
            <th>STATUS</th>
            <th>JOINED</th>
            {canToggle && <th>ACTION</th>}
          </tr>
        </thead>
        <tbody>
          {rows.map((u) => (
            <tr key={u.id}>
              <td className="font-medium">{u.full_name || "-"}</td>
              <td>
                {u.email || "-"}
                {u.phone && <div className="text-slate-500 text-xs">{u.phone}</div>}
              </td>
              {withOrg && <td>{u.organizations?.name || "-"}</td>}
              <td>{titleCase(u.role)}</td>
              <td><StatusBadge status={u.status} /></td>
              <td>{formatDate(u.created_at)}</td>
              {canToggle && (
                <td>
                  <button
                    className={`btn btn-sm ${u.status === "active" ? "btn-outline-danger" : "btn-outline-success"}`}
                    disabled={busyId === u.id || u.id === me?.user?.id}
                    onClick={() => toggle(u)}
                  >
                    {busyId === u.id ? "..." : u.status === "active" ? "Disable" : "Enable"}
                  </button>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  return (
    <div className="p-5">
      <div className="intro-y flex items-center h-10 mb-5">
        <h2 className="text-lg font-medium truncate">Users &amp; Roles</h2>
      </div>

      <ErrorBanner message={error} onClose={() => setError("")} />
      <InfoBanner message={notice} onClose={() => setNotice("")} />

      <div className="intro-y box p-5 mb-5">
        <h3 className="text-base font-medium mb-1">Platform owner accounts</h3>
        <div className="text-slate-500 text-sm mb-4">Accounts that manage the SaaS platform. They do not belong to any ISP.</div>
        {owners.length === 0 ? (
          <div className="text-slate-500 text-sm">No platform owner accounts found.</div>
        ) : (
          <UserTable rows={owners} withOrg={false} canToggle={false} />
        )}
      </div>

      <div className="intro-y box p-5">
        <h3 className="text-base font-medium mb-1">ISP users</h3>
        <div className="text-slate-500 text-sm mb-4">
          Admins and staff of every ISP. Disabling a user blocks their sign-in; their data is kept.
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 mb-5">
          <input
            className="form-control"
            placeholder="Search name, e-mail or phone..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <select className="form-select" value={orgFilter} onChange={(e) => { setOrgFilter(e.target.value); setPage(0); }}>
            <option value="all">All ISPs</option>
            {orgs.map((o) => (
              <option key={o.id} value={o.id}>{o.name}</option>
            ))}
          </select>
          <select className="form-select" value={roleFilter} onChange={(e) => { setRoleFilter(e.target.value); setPage(0); }}>
            <option value="all">All roles</option>
            <option value="isp_admin">ISP Admin</option>
            <option value="isp_staff">ISP Staff</option>
          </select>
          <select className="form-select" value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setPage(0); }}>
            <option value="all">All statuses</option>
            <option value="active">Active</option>
            <option value="disabled">Disabled</option>
          </select>
        </div>

        {loading ? (
          <div className="text-center py-4">Loading users...</div>
        ) : users.length === 0 ? (
          <div className="text-center py-4 text-slate-500">No users found.</div>
        ) : (
          <UserTable rows={users} withOrg canToggle />
        )}
        <Pagination page={page} pageSize={PAGE_SIZE} total={total} onPage={setPage} />
      </div>
    </div>
  );
}

export default Main;
