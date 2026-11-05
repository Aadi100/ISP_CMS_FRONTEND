import { Lucide, Tippy } from "@/base-components";
import classnames from "classnames";
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { getSession, can } from "@/lib/session";
import { friendlyError } from "@/lib/errors";
import { formatDate, formatDateTime, titleCase } from "@/lib/format";
import OutagesPanel from "./components/OutagesPanel";

const PAGE_SIZE = 10;

const DEVICE_TYPES = [
  "OLT",
  "Core Router",
  "Distribution Switch",
  "Access Switch",
  "POP",
  "OLT Chassis",
  "Wireless Access Point",
  "UPS",
  "Fiber Distribution Box",
  "Other",
];

const STATUS_OPTIONS = ["online", "offline", "maintenance", "disabled"];

const STATUS_BADGE_CLASSES = {
  online: "bg-success/20 text-success",
  offline: "bg-danger/20 text-danger",
  maintenance: "bg-warning/20 text-warning",
  disabled: "bg-slate-300 text-slate-600 dark:bg-darkmode-400 dark:text-slate-300",
};

const EMPTY_FILTERS = { search: "", type: "", status: "", technician: "", branch: "" };

const EMPTY_FORM = {
  name: "",
  device_type: DEVICE_TYPES[0],
  vendor: "",
  model: "",
  serial_number: "",
  ip_address: "",
  mac_address: "",
  location: "",
  installation_date: "",
  last_maintenance_at: "",
  technician_id: "",
  status: "online",
  remarks: "",
};

const IPV4 = /^(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}$/;
function isValidIp(v) {
  if (IPV4.test(v)) return true;
  if (!v.includes(":") || !/^[0-9a-fA-F:.]+$/.test(v)) return false;
  const dbl = v.split("::");
  if (dbl.length > 2) return false;
  const groups = v.split(":").filter((g) => g !== "");
  if (groups.length > 8) return false;
  if (dbl.length === 1 && groups.length !== 8) return false;
  return groups.every((g, i) =>
    g.includes(".") ? i === groups.length - 1 && IPV4.test(g) : /^[0-9a-fA-F]{1,4}$/.test(g)
  );
}
const MAC = /^([0-9A-Fa-f]{2}[:-]){5}[0-9A-Fa-f]{2}$/;

const cleanTerm = (s) => s.replace(/[,()%*\\]/g, " ").trim();

function StatusBadge({ status }) {
  return (
    <div
      className={classnames(
        "py-1 px-2 rounded-full text-xs font-medium inline-block whitespace-nowrap",
        STATUS_BADGE_CLASSES[status]
      )}
    >
      {titleCase(status)}
    </div>
  );
}

function Main() {
  const [tab, setTab] = useState("devices");
  const [session, setSession] = useState(null);
  const [devices, setDevices] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [banner, setBanner] = useState(null);
  const [busyId, setBusyId] = useState(null);

  const [employees, setEmployees] = useState([]);
  const [branches, setBranches] = useState([]);
  const [counts, setCounts] = useState({ total: 0, online: 0, offline: 0, maintenance: 0, disabled: 0 });

  const [draft, setDraft] = useState(EMPTY_FILTERS);
  const [filters, setFilters] = useState(EMPTY_FILTERS);

  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);

  const [details, setDetails] = useState(null);
  const [deleting, setDeleting] = useState(null);

  const canCreate = can(session, "network", "create");
  const canEdit = can(session, "network", "edit");
  const canDelete = can(session, "network", "delete");

  const techName = (id) => employees.find((e) => e.id === id)?.full_name || "—";

  const showBanner = (message) => {
    setBanner(message);
    window.clearTimeout(showBanner._t);
    showBanner._t = window.setTimeout(() => setBanner(null), 3500);
  };

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

  const loadDevices = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      let q = supabase
        .from("network_devices")
        .select("*", { count: "exact" })
        .order("created_at", { ascending: false })
        .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);

      const term = cleanTerm(filters.search);
      if (term) {
        const parts = [
          `name.ilike.%${term}%`,
          `device_code.ilike.%${term}%`,
          `location.ilike.%${term}%`,
          `vendor.ilike.%${term}%`,
          `serial_number.ilike.%${term}%`,
        ];
        if (isValidIp(term)) parts.push(`ip_address.eq.${term}`);
        q = q.or(parts.join(","));
      }
      if (filters.type) q = q.eq("device_type", filters.type);
      if (filters.status) q = q.eq("status", filters.status);
      if (filters.technician) q = q.eq("technician_id", filters.technician);
      if (filters.branch) q = q.eq("branch_id", filters.branch);

      const { data, error: err, count } = await q;
      if (err) throw err;
      setDevices(data || []);
      setTotal(count || 0);
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setLoading(false);
    }
  }, [filters, page]);

  const loadCounts = useCallback(async () => {
    try {
      const head = (status) => {
        let q = supabase.from("network_devices").select("id", { count: "exact", head: true });
        if (status) q = q.eq("status", status);
        return q;
      };
      const [all, on, off, mnt, dis] = await Promise.all([
        head(), head("online"), head("offline"), head("maintenance"), head("disabled"),
      ]);
      setCounts({
        total: all.count || 0,
        online: on.count || 0,
        offline: off.count || 0,
        maintenance: mnt.count || 0,
        disabled: dis.count || 0,
      });
    } catch (e) {
      // non-critical
    }
  }, []);

  useEffect(() => {
    loadDevices();
  }, [loadDevices]);
  useEffect(() => {
    loadCounts();
  }, [loadCounts]);

  const refreshAll = () => {
    loadDevices();
    loadCounts();
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

  const openCreate = () => {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setFormError("");
    setFormOpen(true);
  };
  const openEdit = (d) => {
    setEditingId(d.id);
    setForm({
      name: d.name || "",
      device_type: d.device_type || DEVICE_TYPES[0],
      vendor: d.vendor || "",
      model: d.model || "",
      serial_number: d.serial_number || "",
      ip_address: d.ip_address ? String(d.ip_address).replace(/\/(32|128)$/, "") : "",
      mac_address: d.mac_address || "",
      location: d.location || "",
      installation_date: d.installation_date || "",
      last_maintenance_at: d.last_maintenance_at || "",
      technician_id: d.technician_id || "",
      status: d.status || "online",
      remarks: d.remarks || "",
    });
    setFormError("");
    setFormOpen(true);
  };
  const setField = (k) => (e) => setForm((p) => ({ ...p, [k]: e.target.value }));

  const saveDevice = async () => {
    const name = form.name.trim();
    const ip = form.ip_address.trim();
    const mac = form.mac_address.trim();
    if (!name) return setFormError("Device name is required.");
    if (ip && !isValidIp(ip)) return setFormError("IP address must be a valid IPv4 or IPv6 address.");
    if (mac && !MAC.test(mac)) return setFormError("MAC address must look like AA:BB:CC:DD:EE:FF.");

    const row = {
      name,
      device_type: form.device_type,
      vendor: form.vendor.trim() || null,
      model: form.model.trim() || null,
      serial_number: form.serial_number.trim() || null,
      ip_address: ip || null,
      mac_address: mac || null,
      location: form.location.trim() || null,
      installation_date: form.installation_date || null,
      last_maintenance_at: form.last_maintenance_at || null,
      technician_id: form.technician_id || null,
      status: form.status,
      remarks: form.remarks.trim() || null,
    };

    setSaving(true);
    setFormError("");
    try {
      const { error: err } = editingId
        ? await supabase.from("network_devices").update(row).eq("id", editingId)
        : await supabase.from("network_devices").insert(row);
      if (err) throw err;
      setFormOpen(false);
      showBanner(editingId ? "Device updated." : "Device added to the network.");
      refreshAll();
    } catch (e) {
      setFormError(friendlyError(e));
    } finally {
      setSaving(false);
    }
  };

  const changeStatus = async (d, status) => {
    setBusyId(d.id);
    setError("");
    try {
      const { error: err } = await supabase.from("network_devices").update({ status }).eq("id", d.id);
      if (err) throw err;
      showBanner(`${d.device_code || d.name} is now ${titleCase(status)}.`);
      setDetails((cur) => (cur && cur.id === d.id ? { ...cur, status } : cur));
      refreshAll();
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setBusyId(null);
    }
  };

  const confirmDelete = async () => {
    if (!deleting) return;
    setBusyId(deleting.id);
    setError("");
    try {
      const { error: err } = await supabase.from("network_devices").delete().eq("id", deleting.id);
      if (err) throw err;
      showBanner(`${deleting.name} deleted.`);
      setDeleting(null);
      setDetails(null);
      refreshAll();
    } catch (e) {
      setError(friendlyError(e));
      setDeleting(null);
    } finally {
      setBusyId(null);
    }
  };

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const hasFilters = Object.values(filters).some(Boolean);
  const selectCls = "form-select box mt-1 w-full";

  const Card = ({ icon, color, value, label, span = "xl:col-span-2" }) => (
    <div className={`col-span-12 sm:col-span-6 lg:col-span-4 ${span} intro-y`}>
      <div className="box p-5 flex items-center">
        <Lucide icon={icon} className={`w-8 h-8 mr-4 flex-none ${color}`} />
        <div>
          <div className="text-xl font-medium">{value}</div>
          <div className="text-slate-500 text-xs mt-0.5">{label}</div>
        </div>
      </div>
    </div>
  );

  const tabs = (
    <div className="col-span-12 intro-y flex gap-2 border-b border-slate-200/60 dark:border-darkmode-400">
      {[
        ["devices", "Devices"],
        ["outages", "Outages"],
      ].map(([key, label]) => (
        <button
          key={key}
          type="button"
          onClick={() => setTab(key)}
          className={classnames(
            "px-4 py-2 text-sm font-medium -mb-px border-b-2",
            tab === key ? "border-primary text-primary" : "border-transparent text-slate-500"
          )}
        >
          {label}
        </button>
      ))}
    </div>
  );

  if (tab === "outages") {
    return (
      <div className="grid grid-cols-12 gap-6">
        <div className="col-span-12 intro-y">
          <h2 className="text-lg font-medium">Network</h2>
          <div className="text-slate-500 mt-1">Manage network devices and service outages.</div>
        </div>
        {tabs}
        <div className="col-span-12">
          <OutagesPanel session={session} />
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="grid grid-cols-12 gap-6">
        <div className="col-span-12 intro-y flex flex-col lg:flex-row lg:items-center">
          <div>
            <h2 className="text-lg font-medium">Network</h2>
            <div className="text-slate-500 mt-1">
              Manage network devices, locations and infrastructure.
            </div>
          </div>
          <div className="flex flex-wrap gap-2 lg:ml-auto mt-4 lg:mt-0">
            {canCreate && (
              <button type="button" onClick={openCreate} className="btn btn-primary shadow-md">
                <Lucide icon="Plus" className="w-4 h-4 mr-2" /> Add Network Device
              </button>
            )}
          </div>
        </div>

        {tabs}

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
                placeholder="Search by Device Name, Device ID, IP Address, Location, Vendor or Serial"
              />
            </div>
            <div className="grid grid-cols-12 gap-3 mt-4">
              <div className="col-span-12 sm:col-span-6 lg:col-span-3">
                <label className="text-xs text-slate-500">Device Type</label>
                <select className={selectCls} value={draft.type} onChange={setDraftField("type")}>
                  <option value="">All Types</option>
                  {DEVICE_TYPES.map((t) => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
              </div>
              <div className="col-span-12 sm:col-span-6 lg:col-span-3">
                <label className="text-xs text-slate-500">Status</label>
                <select className={selectCls} value={draft.status} onChange={setDraftField("status")}>
                  <option value="">All Statuses</option>
                  {STATUS_OPTIONS.map((s) => (
                    <option key={s} value={s}>{titleCase(s)}</option>
                  ))}
                </select>
              </div>
              <div className="col-span-12 sm:col-span-6 lg:col-span-3">
                <label className="text-xs text-slate-500">Technician</label>
                <select className={selectCls} value={draft.technician} onChange={setDraftField("technician")}>
                  <option value="">All Technicians</option>
                  {employees.map((e) => (
                    <option key={e.id} value={e.id}>{e.full_name}</option>
                  ))}
                </select>
              </div>
              {branches.length > 0 && (
                <div className="col-span-12 sm:col-span-6 lg:col-span-3">
                  <label className="text-xs text-slate-500">Branch</label>
                  <select className={selectCls} value={draft.branch} onChange={setDraftField("branch")}>
                    <option value="">All Branches</option>
                    {branches.map((b) => (
                      <option key={b.id} value={b.id}>{b.name}</option>
                    ))}
                  </select>
                </div>
              )}
              <div className="col-span-12 flex gap-2">
                <button type="button" onClick={applyFilters} className="btn btn-primary w-full sm:w-40">Search</button>
                <button type="button" onClick={resetFilters} className="btn btn-outline-secondary w-full sm:w-40">Reset</button>
              </div>
            </div>
          </div>
        </div>

        {/* Summary cards (real counts) */}
        <Card icon="Wifi" color="text-primary" value={counts.total} label="Total Devices" />
        <Card icon="CheckCircle2" color="text-success" value={counts.online} label="Online Devices" />
        <Card icon="AlertCircle" color="text-danger" value={counts.offline} label="Offline Devices" span="xl:col-span-3" />
        <Card icon="AlertTriangle" color="text-warning" value={counts.maintenance} label="Maintenance Devices" />
        <Card icon="Power" color="text-slate-400" value={counts.disabled} label="Disabled Devices" span="xl:col-span-3" />

        {/* Table */}
        <div className="col-span-12 mt-2">
          <div className="intro-y flex items-center h-10">
            <h2 className="text-lg font-medium truncate mr-5">Network Devices</h2>
            <div className="ml-auto text-slate-500 text-sm">
              {total} result{total === 1 ? "" : "s"}
            </div>
          </div>
          <div className="text-slate-500 text-xs mt-1">
            Status is the stored value set by your team. The browser cannot ping devices, so "Last seen" only shows
            when an external monitor reported the device.
          </div>

          {loading ? (
            <div className="intro-y box p-10 mt-5 text-center text-slate-500">Loading devices...</div>
          ) : devices.length === 0 ? (
            <div className="intro-y box p-10 mt-5 flex flex-col items-center justify-center text-center">
              <Lucide icon="Wifi" className="w-12 h-12 text-slate-300 mb-3" />
              <div className="text-slate-500 mb-5">
                {hasFilters ? "No network devices match your filters." : "No network devices yet."}
              </div>
              {canCreate && !hasFilters && (
                <button type="button" onClick={openCreate} className="btn btn-primary shadow-md">
                  <Lucide icon="Plus" className="w-4 h-4 mr-2" /> Add Network Device
                </button>
              )}
            </div>
          ) : (
            <div className="intro-y w-full overflow-x-auto mt-5">
              <table className="table table-report w-full min-w-[1360px]">
                <thead>
                  <tr>
                    <th className="whitespace-nowrap">DEVICE ID</th>
                    <th className="whitespace-nowrap">DEVICE NAME</th>
                    <th className="whitespace-nowrap">DEVICE TYPE</th>
                    <th className="whitespace-nowrap">VENDOR</th>
                    <th className="whitespace-nowrap">LOCATION</th>
                    <th className="whitespace-nowrap">IP ADDRESS</th>
                    <th className="text-center whitespace-nowrap">STATUS</th>
                    <th className="whitespace-nowrap">LAST SEEN</th>
                    <th className="whitespace-nowrap">LAST MAINTENANCE</th>
                    <th className="text-center whitespace-nowrap min-w-[140px]">ACTIONS</th>
                  </tr>
                </thead>
                <tbody>
                  {devices.map((d) => (
                    <tr key={d.id} className="intro-x">
                      <td className="whitespace-nowrap font-medium">{d.device_code}</td>
                      <td className="whitespace-nowrap">{d.name}</td>
                      <td className="whitespace-nowrap">{d.device_type}</td>
                      <td className="whitespace-nowrap">{d.vendor || "—"}</td>
                      <td className="whitespace-nowrap">{d.location || "—"}</td>
                      <td className="whitespace-nowrap">{d.ip_address ? String(d.ip_address) : "—"}</td>
                      <td className="w-36">
                        <div className="flex justify-center"><StatusBadge status={d.status} /></div>
                      </td>
                      <td className="whitespace-nowrap">
                        {d.last_seen_at ? formatDateTime(d.last_seen_at) : "Never reported"}
                      </td>
                      <td className="whitespace-nowrap">{formatDate(d.last_maintenance_at)}</td>
                      <td className="table-report__action w-auto min-w-[140px] whitespace-nowrap">
                        <div className="flex justify-center items-center gap-3">
                          <Tippy
                            tag="a"
                            href=""
                            content="View Details"
                            onClick={(e) => {
                              e.preventDefault();
                              setDetails(d);
                            }}
                          >
                            <Lucide icon="Eye" className="w-4 h-4 text-slate-500 hover:text-primary" />
                          </Tippy>
                          {canEdit && (
                            <Tippy
                              tag="a"
                              href=""
                              content="Edit"
                              onClick={(e) => {
                                e.preventDefault();
                                openEdit(d);
                              }}
                            >
                              <Lucide icon="Edit" className="w-4 h-4 text-slate-500 hover:text-primary" />
                            </Tippy>
                          )}
                          {canEdit && (
                            <Tippy
                              tag="a"
                              href=""
                              content={d.status === "disabled" ? "Enable" : "Disable"}
                              onClick={(e) => {
                                e.preventDefault();
                                if (busyId !== d.id) changeStatus(d, d.status === "disabled" ? "online" : "disabled");
                              }}
                            >
                              <Lucide
                                icon="Power"
                                className={classnames(
                                  "w-4 h-4 hover:text-primary",
                                  d.status === "disabled" ? "text-slate-400" : "text-success"
                                )}
                              />
                            </Tippy>
                          )}
                          {canDelete && (
                            <Tippy
                              tag="a"
                              href=""
                              content="Delete"
                              onClick={(e) => {
                                e.preventDefault();
                                setDeleting(d);
                              }}
                            >
                              <Lucide icon="Trash2" className="w-4 h-4 text-slate-500 hover:text-danger" />
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
              <div className="text-slate-500 text-sm">Page {page} of {totalPages}</div>
              <div className="flex gap-2">
                <button type="button" className="btn btn-outline-secondary" disabled={page <= 1 || loading} onClick={() => setPage((p) => p - 1)}>
                  Previous
                </button>
                <button type="button" className="btn btn-outline-secondary" disabled={page >= totalPages || loading} onClick={() => setPage((p) => p + 1)}>
                  Next
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Add / edit modal */}
      {formOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60" onClick={() => setFormOpen(false)}></div>
          <div className="relative box w-full max-w-lg p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center mb-5">
              <h2 className="text-lg font-medium">{editingId ? "Edit Network Device" : "Add Network Device"}</h2>
              <button type="button" onClick={() => setFormOpen(false)} className="ml-auto text-slate-500 hover:text-slate-700" aria-label="Close">
                <Lucide icon="X" className="w-5 h-5" />
              </button>
            </div>
            {formError && <div className="mb-4 p-3 rounded-md bg-danger/10 text-danger text-sm">{formError}</div>}
            <div className="grid grid-cols-12 gap-4">
              <div className="col-span-12">
                <label className="text-xs text-slate-500">Device Name</label>
                <input type="text" className="form-control box mt-1 w-full" placeholder="e.g. Huawei MA5608T" value={form.name} onChange={setField("name")} />
              </div>
              <div className="col-span-6">
                <label className="text-xs text-slate-500">Device Type</label>
                <select className="form-select box mt-1 w-full" value={form.device_type} onChange={setField("device_type")}>
                  {Array.from(new Set([...DEVICE_TYPES, form.device_type])).map((t) => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
              </div>
              <div className="col-span-6">
                <label className="text-xs text-slate-500">Status</label>
                <select className="form-select box mt-1 w-full" value={form.status} onChange={setField("status")}>
                  {STATUS_OPTIONS.map((s) => (
                    <option key={s} value={s}>{titleCase(s)}</option>
                  ))}
                </select>
              </div>
              <div className="col-span-6">
                <label className="text-xs text-slate-500">Vendor</label>
                <input type="text" className="form-control box mt-1 w-full" placeholder="e.g. Huawei" value={form.vendor} onChange={setField("vendor")} />
              </div>
              <div className="col-span-6">
                <label className="text-xs text-slate-500">Model</label>
                <input type="text" className="form-control box mt-1 w-full" placeholder="e.g. MA5608T" value={form.model} onChange={setField("model")} />
              </div>
              <div className="col-span-6">
                <label className="text-xs text-slate-500">Serial Number</label>
                <input type="text" className="form-control box mt-1 w-full" placeholder="Optional" value={form.serial_number} onChange={setField("serial_number")} />
              </div>
              <div className="col-span-6">
                <label className="text-xs text-slate-500">IP Address</label>
                <input type="text" className="form-control box mt-1 w-full" placeholder="IPv4 or IPv6, e.g. 10.10.1.5" value={form.ip_address} onChange={setField("ip_address")} />
              </div>
              <div className="col-span-6">
                <label className="text-xs text-slate-500">MAC Address</label>
                <input type="text" className="form-control box mt-1 w-full" placeholder="AA:BB:CC:DD:EE:FF" value={form.mac_address} onChange={setField("mac_address")} />
              </div>
              <div className="col-span-6">
                <label className="text-xs text-slate-500">POP Location</label>
                <input type="text" className="form-control box mt-1 w-full" placeholder="e.g. Gulshan POP" value={form.location} onChange={setField("location")} />
              </div>
              <div className="col-span-6">
                <label className="text-xs text-slate-500">Installation Date</label>
                <input type="date" className="form-control box mt-1 w-full" value={form.installation_date} onChange={setField("installation_date")} />
              </div>
              <div className="col-span-6">
                <label className="text-xs text-slate-500">Last Maintenance Date</label>
                <input type="date" className="form-control box mt-1 w-full" value={form.last_maintenance_at} onChange={setField("last_maintenance_at")} />
              </div>
              <div className="col-span-12">
                <label className="text-xs text-slate-500">Assigned Technician</label>
                <select className="form-select box mt-1 w-full" value={form.technician_id} onChange={setField("technician_id")}>
                  <option value="">None</option>
                  {employees.map((e) => (
                    <option key={e.id} value={e.id}>{e.full_name}</option>
                  ))}
                </select>
              </div>
              <div className="col-span-12">
                <label className="text-xs text-slate-500">Remarks</label>
                <textarea className="form-control box mt-1 w-full" rows={2} placeholder="Optional note about this device" value={form.remarks} onChange={setField("remarks")}></textarea>
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-6">
              <button type="button" onClick={() => setFormOpen(false)} className="btn btn-outline-secondary">Cancel</button>
              <button type="button" onClick={saveDevice} disabled={saving} className="btn btn-primary shadow-md">
                {saving ? "Saving..." : "Save Device"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Details */}
      {details && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60" onClick={() => setDetails(null)}></div>
          <div className="relative box w-full max-w-lg p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center mb-5">
              <h2 className="text-lg font-medium">Device Details</h2>
              <button type="button" onClick={() => setDetails(null)} className="ml-auto text-slate-500 hover:text-slate-700" aria-label="Close">
                <Lucide icon="X" className="w-5 h-5" />
              </button>
            </div>
            <div className="grid grid-cols-2 gap-y-4 gap-x-4 text-sm">
              {[
                ["Device Name", details.name],
                ["Device ID", details.device_code],
                ["Device Type", details.device_type],
                ["Vendor", details.vendor],
                ["Model", details.model],
                ["Serial Number", details.serial_number],
                ["IP Address", details.ip_address ? String(details.ip_address) : null],
                ["MAC Address", details.mac_address],
                ["POP Location", details.location],
                ["Installation Date", details.installation_date ? formatDate(details.installation_date) : null],
                ["Last Maintenance Date", details.last_maintenance_at ? formatDate(details.last_maintenance_at) : null],
                ["Last Seen", details.last_seen_at ? formatDateTime(details.last_seen_at) : "Never reported"],
                ["Assigned Technician", details.technician_id ? techName(details.technician_id) : null],
              ].map(([label, value]) => (
                <div key={label}>
                  <div className="text-slate-500 text-xs">{label}</div>
                  <div className="font-medium">{value || "—"}</div>
                </div>
              ))}
              <div>
                <div className="text-slate-500 text-xs mb-1">Current Status</div>
                {canEdit ? (
                  <select
                    className="form-select box w-full"
                    value={details.status}
                    disabled={busyId === details.id}
                    onChange={(e) => changeStatus(details, e.target.value)}
                  >
                    {STATUS_OPTIONS.map((s) => (
                      <option key={s} value={s}>{titleCase(s)}</option>
                    ))}
                  </select>
                ) : (
                  <StatusBadge status={details.status} />
                )}
              </div>
              <div className="col-span-2">
                <div className="text-slate-500 text-xs">Remarks</div>
                <div className="font-medium whitespace-pre-wrap">{details.remarks || "—"}</div>
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-6">
              <button type="button" onClick={() => setDetails(null)} className="btn btn-outline-secondary">Close</button>
              {canEdit && (
                <button
                  type="button"
                  onClick={() => {
                    const d = details;
                    setDetails(null);
                    openEdit(d);
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

      {/* Delete confirmation */}
      {deleting && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60" onClick={() => setDeleting(null)}></div>
          <div className="relative box w-full max-w-md p-6">
            <h2 className="text-lg font-medium mb-2">Delete device?</h2>
            <div className="text-slate-500 text-sm">
              {deleting.device_code} - {deleting.name} will be permanently removed.
            </div>
            <div className="flex justify-end gap-2 mt-6">
              <button type="button" onClick={() => setDeleting(null)} className="btn btn-outline-secondary">Cancel</button>
              <button type="button" onClick={confirmDelete} disabled={busyId === deleting.id} className="btn btn-danger shadow-md">
                {busyId === deleting.id ? "Deleting..." : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export default Main;
