import { Lucide, Tippy } from "@/base-components";
import classnames from "classnames";
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { getSession, can } from "@/lib/session";
import { friendlyError } from "@/lib/errors";
import { money, titleCase } from "@/lib/format";
import ResellerDetail from "./components/ResellerDetail";
import TopupTab from "./components/TopupTab";
import CommissionTab from "./components/CommissionTab";

const STATUS_BADGE_CLASSES = {
  active: "bg-success/20 text-success",
  suspended: "bg-danger/20 text-danger",
  terminated: "bg-slate-200 text-slate-500 dark:bg-darkmode-300",
};

const EMPTY_FORM = {
  name: "",
  company_name: "",
  owner_name: "",
  cnic: "",
  phone: "",
  email: "",
  area_id: "",
  package_id: "",
  low_wallet_threshold: "5000",
  commission_percent: "0",
  status: "active",
  notes: "",
  branch_id: "",
};

const WALLET_TITLES = {
  recharge: "Recharge Wallet",
  deduction: "Deduct From Wallet",
  adjustment: "Adjust Wallet (+/-)",
};

const FILTERS_DEFAULT = { search: "", status: "", area: "", branch: "", wallet: "" };

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

function Modal({ title, onClose, children, footer, wide }) {
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60" onClick={onClose}></div>
      <div className={classnames("relative box w-full p-6 max-h-[90vh] overflow-y-auto", wide ? "max-w-2xl" : "max-w-lg")}>
        <div className="flex items-center mb-5">
          <h2 className="text-lg font-medium">{title}</h2>
          <button type="button" onClick={onClose} className="ml-auto text-slate-500 hover:text-slate-700" aria-label="Close">
            <Lucide icon="X" className="w-5 h-5" />
          </button>
        </div>
        {children}
        <div className="flex justify-end gap-2 mt-6">{footer}</div>
      </div>
    </div>
  );
}

function Main() {
  const [session, setSession] = useState(null);
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [banner, setBanner] = useState("");
  const [stats, setStats] = useState({ total: 0, active: 0, suspended: 0, low: 0, wallet: 0 });

  const [areas, setAreas] = useState([]);
  const [packages, setPackages] = useState([]);
  const [branches, setBranches] = useState([]);

  const [draft, setDraft] = useState(FILTERS_DEFAULT);
  const [filters, setFilters] = useState(FILTERS_DEFAULT);

  const [detail, setDetail] = useState(null);
  const [ledgerKey, setLedgerKey] = useState(0);

  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [formError, setFormError] = useState("");

  const [wallet, setWallet] = useState(null); // { reseller, type }
  const [walletForm, setWalletForm] = useState({ resellerId: "", amount: "", reference: "", notes: "" });
  const [walletError, setWalletError] = useState("");

  const [saving, setSaving] = useState(false);
  const [tab, setTab] = useState("list");
  const [pendingTopups, setPendingTopups] = useState(0);
  const [allResellers, setAllResellers] = useState([]);

  const canCreate = can(session, "resellers", "create");
  const canEdit = can(session, "resellers", "edit");

  const showBanner = (message) => {
    setBanner(message);
    window.clearTimeout(showBanner._t);
    showBanner._t = window.setTimeout(() => setBanner(""), 4000);
  };

  useEffect(() => {
    (async () => {
      const s = await getSession();
      setSession(s);
      const [a, p, b] = await Promise.all([
        supabase.from("areas").select("id,name").order("name"),
        supabase.from("packages").select("id,name,status").order("name"),
        s?.branchId ? Promise.resolve({ data: [] }) : supabase.from("branches").select("id,name").order("name"),
      ]);
      setAreas(a.data || []);
      setPackages(p.data || []);
      setBranches(b.data || []);
    })();
  }, []);

  const loadStats = useCallback(async () => {
    const { data, error: err } = await supabase
      .from("v_reseller_overview")
      .select("id, name, reseller_code, status, wallet_balance, is_low_wallet")
      .order("name");
    const pc = await supabase.from("wallet_topup_requests").select("id", { count: "exact", head: true }).eq("status", "pending");
    setPendingTopups(pc.count || 0);
    if (err) return;
    const list = data || [];
    setAllResellers(list);
    setStats({
      total: list.length,
      active: list.filter((r) => r.status === "active").length,
      suspended: list.filter((r) => r.status === "suspended").length,
      low: list.filter((r) => r.is_low_wallet).length,
      wallet: list.reduce((sum, r) => sum + Number(r.wallet_balance || 0), 0),
    });
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      let q = supabase.from("v_reseller_overview").select("*", { count: "exact" });
      if (filters.status) q = q.eq("status", filters.status);
      if (filters.area) q = q.eq("area_id", filters.area);
      if (filters.branch) q = q.eq("branch_id", filters.branch);
      if (filters.wallet) q = q.eq("is_low_wallet", filters.wallet === "low");
      if (filters.search) {
        const s = filters.search.replace(/[,()%]/g, " ").trim();
        if (s) {
          q = q.or(
            `name.ilike.%${s}%,reseller_code.ilike.%${s}%,phone.ilike.%${s}%,company_name.ilike.%${s}%,area_name.ilike.%${s}%`
          );
        }
      }
      const from = (page - 1) * pageSize;
      const { data, count, error: err } = await q
        .order("created_at", { ascending: false })
        .range(from, from + pageSize - 1);
      if (err) throw err;
      setRows(data || []);
      setTotal(count || 0);
      // keep the open drawer in sync with fresh numbers
      setDetail((d) => (d ? (data || []).find((r) => r.id === d.id) || d : d));
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setLoading(false);
    }
  }, [filters, page, pageSize]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    loadStats();
  }, [loadStats]);

  const refresh = async () => {
    await Promise.all([load(), loadStats()]);
  };

  const applyFilters = () => {
    setPage(1);
    setFilters({ ...draft, search: draft.search.trim() });
  };
  const resetFilters = () => {
    setDraft(FILTERS_DEFAULT);
    setPage(1);
    setFilters(FILTERS_DEFAULT);
  };

  // ---- create / edit -----------------------------------------------------
  const openAdd = () => {
    setEditingId(null);
    setForm({ ...EMPTY_FORM, branch_id: session?.branchId || "" });
    setFormError("");
    setFormOpen(true);
  };
  const openEdit = (r) => {
    setEditingId(r.id);
    setForm({
      name: r.name || "",
      company_name: r.company_name || "",
      owner_name: r.owner_name || "",
      cnic: r.cnic || "",
      phone: r.phone || "",
      email: r.email || "",
      area_id: r.area_id || "",
      package_id: r.package_id || "",
      low_wallet_threshold: String(r.low_wallet_threshold ?? 5000),
      commission_percent: String(r.commission_percent ?? 0),
      status: r.status || "active",
      notes: r.notes || "",
      branch_id: r.branch_id || "",
    });
    setFormError("");
    setFormOpen(true);
  };
  const setF = (k, v) => setForm((p) => ({ ...p, [k]: v }));

  const saveReseller = async () => {
    setFormError("");
    if (!form.name.trim()) return setFormError("Reseller name is required.");
    if (Number(form.commission_percent) < 0 || Number(form.commission_percent) > 100) return setFormError("Commission must be between 0 and 100.");
    if (Number(form.low_wallet_threshold) < 0) return setFormError("Low-wallet threshold cannot be negative.");
    setSaving(true);
    try {
      const payload = {
        name: form.name.trim(),
        company_name: form.company_name.trim() || null,
        owner_name: form.owner_name.trim() || null,
        cnic: form.cnic.trim() || null,
        phone: form.phone.trim() || null,
        email: form.email.trim() || null,
        area_id: form.area_id || null,
        package_id: form.package_id || null,
        low_wallet_threshold: Number(form.low_wallet_threshold) || 0,
        commission_percent: Number(form.commission_percent) || 0,
        status: form.status,
        notes: form.notes.trim() || null,
      };
      if (form.branch_id || editingId) payload.branch_id = form.branch_id || null;
      const res = editingId
        ? await supabase.from("resellers").update(payload).eq("id", editingId)
        : await supabase.from("resellers").insert(payload);
      if (res.error) throw res.error;
      setFormOpen(false);
      showBanner(editingId ? "Reseller updated." : "Reseller created. Recharge the wallet to add balance.");
      await refresh();
    } catch (e) {
      setFormError(friendlyError(e));
    } finally {
      setSaving(false);
    }
  };

  const toggleStatus = async (r) => {
    const next = r.status === "active" ? "suspended" : "active";
    setError("");
    const { error: err } = await supabase.from("resellers").update({ status: next }).eq("id", r.id);
    if (err) return setError(friendlyError(err));
    showBanner(`${r.name} is now ${titleCase(next)}.`);
    refresh();
  };

  // ---- wallet ------------------------------------------------------------
  const openWallet = (reseller, type) => {
    setWallet({ reseller, type });
    setWalletForm({ resellerId: reseller?.id || "", amount: "", reference: "", notes: "" });
    setWalletError("");
  };

  const submitWallet = async () => {
    setWalletError("");
    const amount = Number(walletForm.amount);
    if (!walletForm.resellerId) return setWalletError("Select a reseller.");
    if (!amount) return setWalletError("Enter a non-zero amount.");
    if (wallet.type !== "adjustment" && amount < 0) return setWalletError("Amount must be positive.");
    setSaving(true);
    try {
      const { error: err } = await supabase.rpc("record_wallet_txn", {
        p_reseller_id: walletForm.resellerId,
        p_type: wallet.type,
        p_amount: amount,
        p_reference: walletForm.reference.trim() || null,
        p_notes: walletForm.notes.trim() || null,
      });
      if (err) throw err;
      setWallet(null);
      setLedgerKey((k) => k + 1);
      showBanner(`${WALLET_TITLES[wallet.type]} saved.`);
      await refresh();
    } catch (e) {
      const msg = friendlyError(e);
      setWalletError(/insufficient wallet balance/i.test(msg) ? `Not enough balance in the wallet: ${msg}` : msg);
    } finally {
      setSaving(false);
    }
  };

  const walletReseller = wallet
    ? allResellers.find((r) => r.id === walletForm.resellerId) || wallet.reseller
    : null;

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const cards = [
    ["Users", "text-primary", stats.total, "Total Resellers", "xl:col-span-2"],
    ["CheckCircle2", "text-success", stats.active, "Active Resellers", "xl:col-span-2"],
    ["AlertCircle", "text-danger", stats.suspended, "Suspended Resellers", "xl:col-span-3"],
    ["AlertTriangle", "text-warning", stats.low, "Low Wallet Balance", "xl:col-span-2"],
    ["Wallet", "text-pending", money(stats.wallet), "Total Wallet Balance", "xl:col-span-3"],
  ];

  return (
    <>
      <div className="grid grid-cols-12 gap-6">
        <div className="col-span-12 intro-y flex flex-col lg:flex-row lg:items-center">
          <div>
            <h2 className="text-lg font-medium">Resellers / LCO</h2>
            <div className="text-slate-500 mt-1">Manage reseller accounts, assigned areas and wallet balances.</div>
          </div>
          <div className="flex flex-wrap gap-2 lg:ml-auto mt-4 lg:mt-0">
            {canCreate && (
              <button type="button" onClick={openAdd} className="btn btn-primary shadow-md">
                <Lucide icon="Plus" className="w-4 h-4 mr-2" /> Add Reseller
              </button>
            )}
            {canEdit && (
              <button type="button" onClick={() => openWallet(null, "recharge")} className="btn btn-outline-secondary">
                <Lucide icon="Wallet" className="w-4 h-4 mr-2" /> Recharge Wallet
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
            <div className="alert alert-danger show flex items-center">
              <Lucide icon="AlertCircle" className="w-5 h-5 mr-2" />
              <span>{error}</span>
              <button type="button" className="ml-auto" onClick={() => setError("")}>
                <Lucide icon="X" className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}


        <div className="col-span-12 intro-y">
          <div className="box p-4 flex flex-wrap gap-2">
            {[["list", "Resellers"], ["topups", "Top-up requests"], ["commission", "Commission"]].map(([k, l]) => (
              <button key={k} type="button" onClick={() => setTab(k)} className={classnames("py-2 px-4 rounded-full text-sm font-medium inline-flex items-center", tab === k ? "bg-primary text-white" : "bg-slate-100 text-slate-600 dark:bg-darkmode-400 dark:text-slate-300")}>
                {l}
                {k === "topups" && pendingTopups > 0 && <span className="ml-2 bg-danger text-white rounded-full text-xs px-2">{pendingTopups}</span>}
              </button>
            ))}
          </div>
        </div>
        {tab === "topups" && <div className="col-span-12"><TopupTab resellers={allResellers} canEdit={canEdit} onChanged={refresh} /></div>}
        {tab === "commission" && <div className="col-span-12"><CommissionTab resellers={allResellers} canEdit={canEdit} onChanged={refresh} /></div>}
        {tab === "list" && (<>
        {/* Search + filters */}
        <div className="col-span-12 intro-y">
          <div className="box p-5">
            <div className="relative text-slate-500">
              <Lucide icon="Search" className="w-5 h-5 z-10 absolute my-auto inset-y-0 ml-4 left-0" />
              <input
                type="text"
                value={draft.search}
                onChange={(e) => setDraft({ ...draft, search: e.target.value })}
                onKeyDown={(e) => e.key === "Enter" && applyFilters()}
                className="form-control w-full box pl-12 py-3 text-base"
                placeholder="Search by Reseller Name, Reseller ID, Phone Number or Assigned Area"
              />
            </div>
            <div className="grid grid-cols-12 gap-3 mt-4">
              <div className="col-span-12 sm:col-span-6 lg:col-span-3">
                <label className="text-xs text-slate-500">Status</label>
                <select className="form-select box mt-1 w-full" value={draft.status} onChange={(e) => setDraft({ ...draft, status: e.target.value })}>
                  <option value="">All Statuses</option>
                  <option value="active">Active</option>
                  <option value="suspended">Suspended</option>
                  <option value="terminated">Terminated</option>
                </select>
              </div>
              <div className="col-span-12 sm:col-span-6 lg:col-span-3">
                <label className="text-xs text-slate-500">Assigned Area</label>
                <select className="form-select box mt-1 w-full" value={draft.area} onChange={(e) => setDraft({ ...draft, area: e.target.value })}>
                  <option value="">All Areas</option>
                  {areas.map((a) => (
                    <option key={a.id} value={a.id}>{a.name}</option>
                  ))}
                </select>
              </div>
              {!session?.branchId && branches.length > 0 && (
                <div className="col-span-12 sm:col-span-6 lg:col-span-3">
                  <label className="text-xs text-slate-500">Branch</label>
                  <select className="form-select box mt-1 w-full" value={draft.branch} onChange={(e) => setDraft({ ...draft, branch: e.target.value })}>
                    <option value="">All Branches</option>
                    {branches.map((b) => (
                      <option key={b.id} value={b.id}>{b.name}</option>
                    ))}
                  </select>
                </div>
              )}
              <div className="col-span-12 sm:col-span-6 lg:col-span-3">
                <label className="text-xs text-slate-500">Wallet Status</label>
                <select className="form-select box mt-1 w-full" value={draft.wallet} onChange={(e) => setDraft({ ...draft, wallet: e.target.value })}>
                  <option value="">All Wallet Statuses</option>
                  <option value="ok">Sufficient</option>
                  <option value="low">Low Balance</option>
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
        {cards.map(([icon, color, value, label, span]) => (
          <div key={label} className={`col-span-12 sm:col-span-6 lg:col-span-4 ${span} intro-y`}>
            <div className="box p-5 flex items-center">
              <Lucide icon={icon} className={`w-8 h-8 mr-4 flex-none ${color}`} />
              <div>
                <div className="text-xl font-medium">{value}</div>
                <div className="text-slate-500 text-xs mt-0.5">{label}</div>
              </div>
            </div>
          </div>
        ))}

        {/* Table */}
        <div className="col-span-12 mt-2">
          <div className="intro-y flex items-center h-10">
            <h2 className="text-lg font-medium truncate mr-5">Reseller Accounts</h2>
            <div className="ml-auto text-slate-500 text-sm">
              {total} result{total === 1 ? "" : "s"}
            </div>
          </div>

          {loading ? (
            <div className="intro-y box p-10 mt-5 text-center">
              <Lucide icon="Loader" className="w-8 h-8 mx-auto mb-3 animate-spin text-primary" />
              <div className="text-slate-500">Loading resellers...</div>
            </div>
          ) : rows.length === 0 ? (
            <div className="intro-y box p-10 mt-5 flex flex-col items-center justify-center text-center">
              <Lucide icon="Users" className="w-12 h-12 text-slate-300 mb-3" />
              <div className="text-slate-500 mb-5">No resellers found.</div>
              {canCreate && (
                <button type="button" onClick={openAdd} className="btn btn-primary shadow-md">
                  <Lucide icon="Plus" className="w-4 h-4 mr-2" /> Add Reseller
                </button>
              )}
            </div>
          ) : (
            <div className="intro-y w-full overflow-x-auto mt-5">
              <table className="table table-report w-full min-w-[1300px]">
                <thead>
                  <tr>
                    <th className="whitespace-nowrap">RESELLER ID</th>
                    <th className="whitespace-nowrap">RESELLER NAME</th>
                    <th className="whitespace-nowrap">PHONE NUMBER</th>
                    <th className="whitespace-nowrap">ASSIGNED AREA</th>
                    <th className="text-right whitespace-nowrap">SUBSCRIBERS</th>
                    <th className="text-right whitespace-nowrap">COLLECTIONS (MONTH)</th>
                    <th className="text-right whitespace-nowrap">COMMISSION</th>
                    <th className="text-right whitespace-nowrap">WALLET BALANCE</th>
                    <th className="whitespace-nowrap">WHOLESALE PACKAGE</th>
                    <th className="text-center whitespace-nowrap">STATUS</th>
                    <th className="text-center whitespace-nowrap min-w-[160px]">ACTIONS</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id} className="intro-x">
                      <td className="whitespace-nowrap font-medium">{r.reseller_code}</td>
                      <td className="whitespace-nowrap">{r.name}</td>
                      <td className="whitespace-nowrap">{r.phone || "—"}</td>
                      <td className="whitespace-nowrap">{r.area_name || "—"}</td>
                      <td className="text-right whitespace-nowrap">{r.subscribers_count}</td>
                      <td className="text-right whitespace-nowrap">{money(r.monthly_collections)}</td>
                      <td className="text-right whitespace-nowrap">{Number(r.commission_percent || 0)}%</td>
                      <td className={classnames("text-right whitespace-nowrap", r.is_low_wallet ? "text-danger" : "text-success")}>
                        {money(r.wallet_balance)}
                      </td>
                      <td className="whitespace-nowrap">{r.package_name || "—"}</td>
                      <td className="w-32">
                        <div className="flex justify-center"><StatusBadge status={r.status} /></div>
                      </td>
                      <td className="table-report__action w-auto whitespace-nowrap">
                        <div className="flex justify-center items-center gap-3">
                          <Tippy tag="a" href="" content="View Details" onClick={(e) => { e.preventDefault(); setDetail(r); }}>
                            <Lucide icon="Eye" className="w-4 h-4 text-slate-500 hover:text-primary" />
                          </Tippy>
                          {canEdit && (
                            <Tippy tag="a" href="" content="Edit" onClick={(e) => { e.preventDefault(); openEdit(r); }}>
                              <Lucide icon="Edit" className="w-4 h-4 text-slate-500 hover:text-primary" />
                            </Tippy>
                          )}
                          {canEdit && (
                            <Tippy tag="a" href="" content="Recharge Wallet" onClick={(e) => { e.preventDefault(); openWallet(r, "recharge"); }}>
                              <Lucide icon="Wallet" className="w-4 h-4 text-slate-500 hover:text-primary" />
                            </Tippy>
                          )}
                          {canEdit && r.status !== "terminated" && (
                            <Tippy
                              tag="a"
                              href=""
                              content={r.status === "active" ? "Suspend" : "Activate"}
                              onClick={(e) => { e.preventDefault(); toggleStatus(r); }}
                            >
                              <Lucide icon="Power" className={classnames("w-4 h-4 hover:text-primary", r.status === "active" ? "text-success" : "text-slate-400")} />
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

          {/* Pagination */}
          {total > 0 && (
            <div className="intro-y flex flex-wrap items-center mt-5 gap-3">
              <div className="text-slate-500 text-sm">
                Page {page} of {totalPages}
              </div>
              <div className="flex gap-2 ml-auto items-center">
                <button type="button" className="btn btn-outline-secondary" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                  <Lucide icon="ChevronLeft" className="w-4 h-4" />
                </button>
                <button type="button" className="btn btn-outline-secondary" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
                  <Lucide icon="ChevronRight" className="w-4 h-4" />
                </button>
                <select
                  className="form-select box w-20"
                  value={pageSize}
                  onChange={(e) => { setPageSize(Number(e.target.value)); setPage(1); }}
                >
                  <option value={10}>10</option>
                  <option value={25}>25</option>
                </select>
              </div>
            </div>
          )}
        </div>
        </>)}
      </div>

      {detail && (
        <ResellerDetail
          reseller={detail}
          canInvite={can(session, "users_roles", "create") || session?.role === "isp_admin"}
          refreshKey={ledgerKey}
          canEdit={canEdit}
          onClose={() => setDetail(null)}
          onWallet={(type) => openWallet(detail, type)}
        />
      )}

      {/* Create / edit */}
      {formOpen && (
        <Modal
          wide
          title={editingId ? "Edit Reseller" : "Add Reseller"}
          onClose={() => !saving && setFormOpen(false)}
          footer={
            <>
              <button type="button" className="btn btn-outline-secondary" disabled={saving} onClick={() => setFormOpen(false)}>Cancel</button>
              <button type="button" className="btn btn-primary shadow-md" disabled={saving} onClick={saveReseller}>
                {saving ? "Saving..." : editingId ? "Update Reseller" : "Save Reseller"}
              </button>
            </>
          }
        >
          {formError && <div className="alert alert-danger show mb-4 text-sm">{formError}</div>}
          <div className="grid grid-cols-12 gap-4">
            {[
              ["name", "Reseller Name *", "col-span-12 sm:col-span-6"],
              ["company_name", "Company Name", "col-span-12 sm:col-span-6"],
              ["owner_name", "Owner Name", "col-span-12 sm:col-span-6"],
              ["cnic", "CNIC", "col-span-12 sm:col-span-6"],
              ["phone", "Phone Number", "col-span-12 sm:col-span-6"],
              ["email", "Email", "col-span-12 sm:col-span-6"],
            ].map(([k, label, span]) => (
              <div key={k} className={span}>
                <label className="text-xs text-slate-500">{label}</label>
                <input type={k === "email" ? "email" : "text"} className="form-control box mt-1 w-full" value={form[k]} onChange={(e) => setF(k, e.target.value)} />
              </div>
            ))}
            <div className="col-span-12 sm:col-span-6">
              <label className="text-xs text-slate-500">Assigned Area</label>
              <select className="form-select box mt-1 w-full" value={form.area_id} onChange={(e) => setF("area_id", e.target.value)}>
                <option value="">None</option>
                {areas.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            </div>
            <div className="col-span-12 sm:col-span-6">
              <label className="text-xs text-slate-500">Wholesale Package</label>
              <select className="form-select box mt-1 w-full" value={form.package_id} onChange={(e) => setF("package_id", e.target.value)}>
                <option value="">None</option>
                {packages.filter((p) => p.status === "active" || p.id === form.package_id).map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>
            {!session?.branchId && branches.length > 0 && (
              <div className="col-span-12 sm:col-span-6">
                <label className="text-xs text-slate-500">Branch</label>
                <select className="form-select box mt-1 w-full" value={form.branch_id} onChange={(e) => setF("branch_id", e.target.value)}>
                  <option value="">Whole ISP (no branch)</option>
                  {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                </select>
              </div>
            )}
            <div className="col-span-12 sm:col-span-6">
              <label className="text-xs text-slate-500">Low-wallet Threshold (PKR)</label>
              <input type="number" min="0" className="form-control box mt-1 w-full" value={form.low_wallet_threshold} onChange={(e) => setF("low_wallet_threshold", e.target.value)} />
            </div>
            <div className="col-span-12 sm:col-span-6">
              <label className="text-xs text-slate-500">Commission %</label>
              <input type="number" min="0" max="100" step="0.01" className="form-control box mt-1 w-full" value={form.commission_percent} onChange={(e) => setF("commission_percent", e.target.value)} />
            </div>
            <div className="col-span-12 sm:col-span-6">
              <label className="text-xs text-slate-500">Status</label>
              <select className="form-select box mt-1 w-full" value={form.status} onChange={(e) => setF("status", e.target.value)}>
                <option value="active">Active</option>
                <option value="suspended">Suspended</option>
                <option value="terminated">Terminated</option>
              </select>
            </div>
            <div className="col-span-12">
              <label className="text-xs text-slate-500">Notes</label>
              <textarea className="form-control box mt-1 w-full" rows={2} value={form.notes} onChange={(e) => setF("notes", e.target.value)}></textarea>
            </div>
            <div className="col-span-12 text-xs text-slate-500">
              The wallet balance cannot be typed in. Use Recharge, Deduct or Adjust so every change is recorded in the ledger.
            </div>
          </div>
        </Modal>
      )}

      {/* Wallet dialog */}
      {wallet && (
        <Modal
          title={WALLET_TITLES[wallet.type]}
          onClose={() => !saving && setWallet(null)}
          footer={
            <>
              <button type="button" className="btn btn-outline-secondary" disabled={saving} onClick={() => setWallet(null)}>Cancel</button>
              <button type="button" className="btn btn-primary shadow-md" disabled={saving} onClick={submitWallet}>
                {saving ? "Saving..." : "Confirm"}
              </button>
            </>
          }
        >
          {walletError && <div className="alert alert-danger show mb-4 text-sm">{walletError}</div>}
          <div className="grid grid-cols-12 gap-4">
            <div className="col-span-12">
              <label className="text-xs text-slate-500">Reseller</label>
              <select
                className="form-select box mt-1 w-full"
                value={walletForm.resellerId}
                onChange={(e) => setWalletForm((p) => ({ ...p, resellerId: e.target.value }))}
              >
                <option value="">Select a reseller</option>
                {allResellers.map((r) => (
                  <option key={r.id} value={r.id}>{r.reseller_code} - {r.name}</option>
                ))}
              </select>
              {walletReseller && walletReseller.wallet_balance !== undefined && (
                <div className="text-xs text-slate-500 mt-1">
                  Current balance: {money(walletReseller.wallet_balance)}
                </div>
              )}
            </div>
            <div className="col-span-12 sm:col-span-6">
              <label className="text-xs text-slate-500">
                Amount (PKR){wallet.type === "adjustment" ? " - use a minus sign to subtract" : ""}
              </label>
              <input
                type="number"
                step="0.01"
                className="form-control box mt-1 w-full"
                placeholder={wallet.type === "adjustment" ? "e.g. -500 or 500" : "e.g. 10000"}
                value={walletForm.amount}
                onChange={(e) => setWalletForm((p) => ({ ...p, amount: e.target.value }))}
              />
            </div>
            <div className="col-span-12 sm:col-span-6">
              <label className="text-xs text-slate-500">Reference</label>
              <input
                type="text"
                className="form-control box mt-1 w-full"
                placeholder="Optional"
                value={walletForm.reference}
                onChange={(e) => setWalletForm((p) => ({ ...p, reference: e.target.value }))}
              />
            </div>
            <div className="col-span-12">
              <label className="text-xs text-slate-500">Notes</label>
              <textarea
                className="form-control box mt-1 w-full"
                rows={2}
                value={walletForm.notes}
                onChange={(e) => setWalletForm((p) => ({ ...p, notes: e.target.value }))}
              ></textarea>
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}

export default Main;
