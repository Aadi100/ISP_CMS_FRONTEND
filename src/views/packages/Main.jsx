import { Lucide, Tippy } from "@/base-components";
import classnames from "classnames";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { getSession, can } from "@/lib/session";
import { friendlyError } from "@/lib/errors";
import { money } from "@/lib/format";
import AddonsCatalogue from "./components/AddonsCatalogue";

const STATUS_OPTIONS = ["All Statuses", "Active", "Inactive"];

const STATUS_BADGE_CLASSES = {
  Active: "bg-success/20 text-success",
  Inactive: "bg-slate-200 text-slate-500 dark:bg-darkmode-300",
};

const EMPTY_FORM = {
  name: "",
  download_speed: "",
  upload_speed: "",
  monthly_price: "",
  status: "active",
  description: "",
};

function StatusBadge({ status }) {
  const displayStatus =
    status === "active"
      ? "Active"
      : status === "inactive"
        ? "Inactive"
        : status;

  return (
    <div
      className={classnames(
        "py-1 px-2 rounded-full text-xs font-medium inline-block whitespace-nowrap",
        STATUS_BADGE_CLASSES[displayStatus]
      )}
    >
      {displayStatus}
    </div>
  );
}

function PackagesTab({ onSession }) {
  const [packages, setPackages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const [organizationId, setOrganizationId] = useState(null);
  const [session, setSession] = useState(null);
  const [busyId, setBusyId] = useState(null);

  // Search / filters
  const [searchDraft, setSearchDraft] = useState("");
  const [statusDraft, setStatusDraft] = useState("All Statuses");

  const [appliedFilters, setAppliedFilters] = useState({
    search: "",
    status: "All Statuses",
  });

  // Modal
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingPackageId, setEditingPackageId] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);

  useEffect(() => {
    loadPackages();
  }, []);

  const loadPackages = async () => {
    setLoading(true);
    setError("");

    try {
      const sess = await getSession();
      if (!sess?.orgId) {
        throw new Error("Your account is not connected to an ISP organization.");
      }
      setSession(sess);
      if (onSession) onSession(sess);
      setOrganizationId(sess.orgId);

      const [pkgRes, cntRes] = await Promise.all([
        supabase
          .from("packages")
          .select(
            "id, organization_id, name, description, download_speed, upload_speed, monthly_price, status, created_at, updated_at"
          )
          .order("created_at", { ascending: false }),
        supabase
          .from("v_subscribers_by_package")
          .select("package_id, subscribers, active_subscribers"),
      ]);

      if (pkgRes.error) throw pkgRes.error;
      if (cntRes.error) throw cntRes.error;

      const counts = {};
      (cntRes.data || []).forEach((row) => {
        if (row.package_id) {
          counts[row.package_id] = Number(row.subscribers) || 0;
        }
      });

      setPackages(
        (pkgRes.data || []).map((pkg) => ({
          ...pkg,
          subscribers: counts[pkg.id] || 0,
        }))
      );
    } catch (err) {
      setError(friendlyError(err, "Failed to load packages."));
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = () => {
    setAppliedFilters({
      search: searchDraft.trim().toLowerCase(),
      status: statusDraft,
    });
  };

  const handleReset = () => {
    setSearchDraft("");
    setStatusDraft("All Statuses");

    setAppliedFilters({
      search: "",
      status: "All Statuses",
    });
  };

  const openAddModal = () => {
    setEditingPackageId(null);
    setForm(EMPTY_FORM);
    setError("");
    setIsModalOpen(true);
  };

  const openEditModal = (pkg) => {
    setEditingPackageId(pkg.id);

    setForm({
      name: pkg.name || "",
      download_speed: pkg.download_speed ?? "",
      upload_speed: pkg.upload_speed ?? "",
      monthly_price: pkg.monthly_price ?? "",
      status: pkg.status || "active",
      description: pkg.description || "",
    });

    setError("");
    setIsModalOpen(true);
  };

  const closeModal = () => {
    if (saving) return;

    setIsModalOpen(false);
    setEditingPackageId(null);
    setForm(EMPTY_FORM);
  };

  const handleFormChange = (field, value) => {
    setForm((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  const handleSavePackage = async () => {
    setError("");

    if (!form.name.trim()) {
      setError("Package name is required.");
      return;
    }

    if (!organizationId) {
      setError("Organization could not be determined.");
      return;
    }

    const dl = Number(form.download_speed);
    const ul = Number(form.upload_speed);
    const price = Number(form.monthly_price);

    if (form.download_speed === "" || !Number.isFinite(dl) || dl <= 0) {
      setError("Download speed must be greater than 0.");
      return;
    }

    if (form.upload_speed === "" || !Number.isFinite(ul) || ul <= 0) {
      setError("Upload speed must be greater than 0.");
      return;
    }

    if (form.monthly_price === "" || !Number.isFinite(price) || price < 0) {
      setError("Monthly price must be 0 or greater.");
      return;
    }

    setSaving(true);

    try {
      const packagePayload = {
        name: form.name.trim(),
        description: form.description.trim() || null,
        download_speed: Number(form.download_speed),
        upload_speed: Number(form.upload_speed),
        monthly_price: Number(form.monthly_price),
        status: form.status,
      };

      if (editingPackageId) {
        // UPDATE existing package
        const { data, error: updateError } = await supabase
          .from("packages")
          .update(packagePayload)
          .eq("id", editingPackageId)
          .select()
          .single();

        if (updateError) throw updateError;

        setPackages((prev) =>
          prev.map((pkg) =>
            pkg.id === editingPackageId
              ? {
                  ...pkg,
                  ...data,
                }
              : pkg
          )
        );
      } else {
        // INSERT new package
        const { data, error: insertError } = await supabase
          .from("packages")
          .insert({
            ...packagePayload,
            organization_id: organizationId,
          })
          .select()
          .single();

        if (insertError) throw insertError;

        setPackages((prev) => [
          {
            ...data,
            subscribers: 0,
          },
          ...prev,
        ]);
      }

      closeModal();
    } catch (err) {
      setError(friendlyError(err, "Failed to save package."));
    } finally {
      setSaving(false);
    }
  };

  const toggleStatus = async (pkg) => {
    setError("");

    const newStatus = pkg.status === "active" ? "inactive" : "active";

    try {
      const { error: updateError } = await supabase
        .from("packages")
        .update({
          status: newStatus,
        })
        .eq("id", pkg.id);

      if (updateError) throw updateError;

      setPackages((prev) =>
        prev.map((item) =>
          item.id === pkg.id
            ? {
                ...item,
                status: newStatus,
              }
            : item
        )
      );
    } catch (err) {
      setError(friendlyError(err, "Failed to update package status."));
    }
  };

  const duplicatePackage = async (pkg) => {
    setError("");

    try {
      const { data, error: insertError } = await supabase
        .from("packages")
        .insert({
          organization_id: organizationId,
          name: `${pkg.name} (Copy)`,
          description: pkg.description || null,
          download_speed: Number(pkg.download_speed) || 0,
          upload_speed: Number(pkg.upload_speed) || 0,
          monthly_price: Number(pkg.monthly_price) || 0,
          status: "inactive",
        })
        .select()
        .single();

      if (insertError) throw insertError;

      setPackages((prev) => [
        {
          ...data,
          subscribers: 0,
        },
        ...prev,
      ]);
    } catch (err) {
      setError(friendlyError(err, "Failed to duplicate package."));
    }
  };

  const deletePackage = async (pkg) => {
    setError("");
    if (pkg.subscribers > 0) {
      setError(
        `"${pkg.name}" is used by ${pkg.subscribers} subscriber(s) and cannot be deleted. Set it to Inactive instead.`
      );
      return;
    }
    if (!window.confirm(`Delete package "${pkg.name}"? This cannot be undone.`)) return;

    setBusyId(pkg.id);
    try {
      const { error: delError } = await supabase
        .from("packages")
        .delete()
        .eq("id", pkg.id);
      if (delError) throw delError;
      setPackages((prev) => prev.filter((item) => item.id !== pkg.id));
    } catch (err) {
      if (err?.code === "23503") {
        setError(
          `"${pkg.name}" is in use and cannot be deleted. Set it to Inactive instead.`
        );
      } else {
        setError(friendlyError(err, "Failed to delete package."));
      }
    } finally {
      setBusyId(null);
    }
  };

  const filteredPackages = packages.filter((pkg) => {
    const search = appliedFilters.search;

    const matchesSearch =
      search === "" ||
      (pkg.name || "").toLowerCase().includes(search) ||
      String(pkg.download_speed || "").includes(search) ||
      String(pkg.upload_speed || "").includes(search) ||
      String(pkg.monthly_price || "").includes(search);

    const matchesStatus =
      appliedFilters.status === "All Statuses" ||
      (appliedFilters.status === "Active" && pkg.status === "active") ||
      (appliedFilters.status === "Inactive" && pkg.status === "inactive");

    return matchesSearch && matchesStatus;
  });

  const totalPackages = packages.length;

  const activePackages = packages.filter(
    (pkg) => pkg.status === "active"
  ).length;

  const inactivePackages = packages.filter(
    (pkg) => pkg.status === "inactive"
  ).length;

  const mostPopular = packages.reduce(
    (top, pkg) =>
      pkg.subscribers > (top?.subscribers ?? -1) ? pkg : top,
    null
  );

  const formatMoney = (value) => money(value, "").trim();
  const canCreate = can(session, "packages", "create");
  const canEdit = can(session, "packages", "edit");
  const canDelete = can(session, "packages", "delete");

  return (
    <>
      <div className="grid grid-cols-12 gap-6">
        {/* BEGIN: Page Header */}
        <div className="col-span-12 intro-y flex flex-col sm:flex-row sm:items-center">
          <div>
            <h2 className="text-lg font-medium">Internet Packages</h2>

            <div className="text-slate-500 mt-1">
              Create and manage internet plans offered to subscribers.
            </div>
          </div>

          <div className="flex flex-wrap gap-2 sm:ml-auto mt-4 sm:mt-0">
            {canCreate && (
              <button
                type="button"
                onClick={openAddModal}
                className="btn btn-primary shadow-md"
              >
                <Lucide icon="Plus" className="w-4 h-4 mr-2" />
                Add Package
              </button>
            )}
          </div>
        </div>
        {/* END: Page Header */}

        {/* BEGIN: Error */}
        {error && (
          <div className="col-span-12 intro-y">
            <div className="alert alert-danger show flex items-center">
              <Lucide icon="AlertCircle" className="w-5 h-5 mr-2" />
              <span>{error}</span>

              <button
                type="button"
                className="ml-auto"
                onClick={() => setError("")}
              >
                <Lucide icon="X" className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
        {/* END: Error */}

        {/* BEGIN: Search */}
        <div className="col-span-12 intro-y">
          <div className="box p-5">
            <div className="relative text-slate-500">
              <Lucide
                icon="Search"
                className="w-5 h-5 z-10 absolute my-auto inset-y-0 ml-4 left-0"
              />

              <input
                type="text"
                value={searchDraft}
                onChange={(e) => setSearchDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    handleSearch();
                  }
                }}
                className="form-control w-full box pl-12 py-3 text-base"
                placeholder="Search by Package Name, Speed or Price"
              />
            </div>

            <div className="grid grid-cols-12 gap-3 mt-4">
              <div className="col-span-12 sm:col-span-6 lg:col-span-4">
                <label className="text-xs text-slate-500">
                  Status
                </label>

                <select
                  className="form-select box mt-1 w-full"
                  value={statusDraft}
                  onChange={(e) => setStatusDraft(e.target.value)}
                >
                  {STATUS_OPTIONS.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </div>

              <div className="col-span-12 lg:col-span-8 flex items-end gap-2">
                <button
                  type="button"
                  onClick={handleSearch}
                  className="btn btn-primary w-full"
                >
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
        {/* END: Search */}

        {/* BEGIN: Summary Cards */}
        <div className="col-span-12 sm:col-span-6 lg:col-span-3 intro-y">
          <div className="box p-5 flex items-center">
            <Lucide
              icon="Package"
              className="w-8 h-8 mr-4 flex-none text-primary"
            />

            <div>
              <div className="text-xl font-medium">
                {totalPackages}
              </div>

              <div className="text-slate-500 text-xs mt-0.5">
                Total Packages
              </div>
            </div>
          </div>
        </div>

        <div className="col-span-12 sm:col-span-6 lg:col-span-3 intro-y">
          <div className="box p-5 flex items-center">
            <Lucide
              icon="CheckCircle"
              className="w-8 h-8 mr-4 flex-none text-success"
            />

            <div>
              <div className="text-xl font-medium">
                {activePackages}
              </div>

              <div className="text-slate-500 text-xs mt-0.5">
                Active Packages
              </div>
            </div>
          </div>
        </div>

        <div className="col-span-12 sm:col-span-6 lg:col-span-3 intro-y">
          <div className="box p-5 flex items-center">
            <Lucide
              icon="XCircle"
              className="w-8 h-8 mr-4 flex-none text-slate-400"
            />

            <div>
              <div className="text-xl font-medium">
                {inactivePackages}
              </div>

              <div className="text-slate-500 text-xs mt-0.5">
                Inactive Packages
              </div>
            </div>
          </div>
        </div>

        <div className="col-span-12 sm:col-span-6 lg:col-span-3 intro-y">
          <div className="box p-5 flex items-center">
            <Lucide
              icon="Star"
              className="w-8 h-8 mr-4 flex-none text-warning"
            />

            <div className="min-w-0">
              <div className="text-xl font-medium truncate">
                {mostPopular ? mostPopular.name : "—"}
              </div>

              <div className="text-slate-500 text-xs mt-0.5">
                Most Popular Package
              </div>
            </div>
          </div>
        </div>
        {/* END: Summary Cards */}

        {/* BEGIN: Packages Table */}
        <div className="col-span-12 mt-2">
          <div className="intro-y flex items-center h-10">
            <h2 className="text-lg font-medium truncate mr-5">
              All Packages
            </h2>

            <div className="ml-auto text-slate-500 text-sm">
              {filteredPackages.length} result
              {filteredPackages.length === 1 ? "" : "s"}
            </div>
          </div>

          {loading ? (
            <div className="intro-y box p-10 mt-5 text-center">
              <Lucide
                icon="Loader"
                className="w-8 h-8 mx-auto mb-3 animate-spin text-primary"
              />

              <div className="text-slate-500">
                Loading packages...
              </div>
            </div>
          ) : filteredPackages.length === 0 ? (
            <div className="intro-y box p-10 mt-5 flex flex-col items-center justify-center text-center">
              <Lucide
                icon="Package"
                className="w-12 h-12 text-slate-300 mb-3"
              />

              <div className="text-slate-500 mb-5">
                No internet packages found.
              </div>

              {canCreate && (
                <button
                  type="button"
                  onClick={openAddModal}
                  className="btn btn-primary shadow-md"
                >
                  <Lucide icon="Plus" className="w-4 h-4 mr-2" />
                  Add Package
                </button>
              )}
            </div>
          ) : (
            <div className="intro-y w-full overflow-x-auto mt-5">
              <table className="table table-report w-full min-w-[1100px]">
                <thead>
                  <tr>
                    <th className="whitespace-nowrap">
                      PACKAGE NAME
                    </th>

                    <th className="text-center whitespace-nowrap">
                      DOWNLOAD
                    </th>

                    <th className="text-center whitespace-nowrap">
                      UPLOAD
                    </th>

                    <th className="text-right whitespace-nowrap">
                      MONTHLY PRICE
                    </th>

                    <th className="text-center whitespace-nowrap">
                      STATUS
                    </th>

                    <th className="text-center whitespace-nowrap">
                      SUBSCRIBERS
                    </th>

                    <th className="text-center whitespace-nowrap min-w-[180px]">
                      ACTIONS
                    </th>
                  </tr>
                </thead>

                <tbody>
                  {filteredPackages.map((pkg) => (
                    <tr key={pkg.id} className="intro-x">
                      <td>
                        <div className="font-medium">
                          {pkg.name}
                        </div>

                        {pkg.description && (
                          <div className="text-slate-500 text-xs mt-1 max-w-[280px] truncate">
                            {pkg.description}
                          </div>
                        )}
                      </td>

                      <td className="text-center whitespace-nowrap">
                        {pkg.download_speed} Mbps
                      </td>

                      <td className="text-center whitespace-nowrap">
                        {pkg.upload_speed} Mbps
                      </td>

                      <td className="text-right whitespace-nowrap">
                        PKR {formatMoney(pkg.monthly_price)}
                      </td>

                      <td className="w-40">
                        <div className="flex justify-center">
                          <StatusBadge status={pkg.status} />
                        </div>
                      </td>

                      <td className="text-center whitespace-nowrap">
                        {pkg.subscribers}
                      </td>

                      <td className="table-report__action w-auto whitespace-nowrap">
                        <div className="flex justify-center items-center gap-3">
                          {canEdit && (
                            <>
                          <Tippy
                            tag="a"
                            href="#"
                            content="Edit"
                            onClick={(e) => {
                              e.preventDefault();
                              openEditModal(pkg);
                            }}
                          >
                            <Lucide
                              icon="Pencil"
                              className="w-4 h-4 text-slate-500 hover:text-primary"
                            />
                          </Tippy>

                          <Tippy
                            tag="a"
                            href="#"
                            content={
                              pkg.status === "active"
                                ? "Deactivate"
                                : "Activate"
                            }
                            onClick={(e) => {
                              e.preventDefault();
                              toggleStatus(pkg);
                            }}
                          >
                            <Lucide
                              icon="Power"
                              className={classnames(
                                "w-4 h-4",
                                {
                                  "text-success hover:text-slate-400":
                                    pkg.status === "active",
                                  "text-slate-400 hover:text-success":
                                    pkg.status !== "active",
                                }
                              )}
                            />
                          </Tippy>

                            </>
                          )}
                          {canCreate && (
                            <Tippy
                              tag="a"
                              href="#"
                              content="Duplicate Package"
                              onClick={(e) => {
                                e.preventDefault();
                                duplicatePackage(pkg);
                              }}
                            >
                              <Lucide
                                icon="Copy"
                                className="w-4 h-4 text-slate-500 hover:text-primary"
                              />
                            </Tippy>
                          )}
                          {canDelete && (
                            <Tippy
                              tag="a"
                              href="#"
                              content={
                                pkg.subscribers > 0
                                  ? "In use - set to Inactive instead"
                                  : "Delete"
                              }
                              onClick={(e) => {
                                e.preventDefault();
                                if (busyId !== pkg.id) deletePackage(pkg);
                              }}
                            >
                              <Lucide
                                icon="Trash2"
                                className={classnames("w-4 h-4", {
                                  "text-slate-300": pkg.subscribers > 0,
                                  "text-slate-500 hover:text-danger":
                                    pkg.subscribers === 0,
                                })}
                              />
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
        </div>
        {/* END: Packages Table */}
      </div>

      {/* BEGIN: Package Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/60"
            onClick={closeModal}
          ></div>

          <div className="relative box w-full max-w-lg p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center mb-5">
              <h2 className="text-lg font-medium">
                {editingPackageId
                  ? "Edit Package"
                  : "Add Package"}
              </h2>

              <button
                type="button"
                onClick={closeModal}
                className="ml-auto text-slate-500 hover:text-slate-700"
                aria-label="Close"
              >
                <Lucide icon="X" className="w-5 h-5" />
              </button>
            </div>

            <div className="grid grid-cols-12 gap-4">
              {/* Package Name */}
              <div className="col-span-12">
                <label className="text-xs text-slate-500">
                  Package Name
                </label>

                <input
                  type="text"
                  className="form-control box mt-1 w-full"
                  placeholder="e.g. Basic 10 Mbps"
                  value={form.name}
                  onChange={(e) =>
                    handleFormChange("name", e.target.value)
                  }
                />
              </div>

              {/* Download */}
              <div className="col-span-6">
                <label className="text-xs text-slate-500">
                  Download Speed (Mbps)
                </label>

                <input
                  type="number"
                  min="1"
                  className="form-control box mt-1 w-full"
                  placeholder="e.g. 10"
                  value={form.download_speed}
                  onChange={(e) =>
                    handleFormChange(
                      "download_speed",
                      e.target.value
                    )
                  }
                />
              </div>

              {/* Upload */}
              <div className="col-span-6">
                <label className="text-xs text-slate-500">
                  Upload Speed (Mbps)
                </label>

                <input
                  type="number"
                  min="0"
                  className="form-control box mt-1 w-full"
                  placeholder="e.g. 5"
                  value={form.upload_speed}
                  onChange={(e) =>
                    handleFormChange(
                      "upload_speed",
                      e.target.value
                    )
                  }
                />
              </div>

              {/* Monthly Price */}
              <div className="col-span-12">
                <label className="text-xs text-slate-500">
                  Monthly Price (PKR)
                </label>

                <input
                  type="number"
                  min="0"
                  className="form-control box mt-1 w-full"
                  placeholder="e.g. 1500"
                  value={form.monthly_price}
                  onChange={(e) =>
                    handleFormChange(
                      "monthly_price",
                      e.target.value
                    )
                  }
                />
              </div>

              {/* Status */}
              <div className="col-span-12">
                <label className="text-xs text-slate-500">
                  Status
                </label>

                <select
                  className="form-select box mt-1 w-full"
                  value={form.status}
                  onChange={(e) =>
                    handleFormChange("status", e.target.value)
                  }
                >
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                </select>
              </div>

              {/* Description */}
              <div className="col-span-12">
                <label className="text-xs text-slate-500">
                  Description
                </label>

                <textarea
                  className="form-control box mt-1 w-full"
                  rows={3}
                  placeholder="Short note about this package (optional)"
                  value={form.description}
                  onChange={(e) =>
                    handleFormChange(
                      "description",
                      e.target.value
                    )
                  }
                ></textarea>
              </div>
            </div>

            <div className="flex justify-end gap-2 mt-6">
              <button
                type="button"
                onClick={closeModal}
                className="btn btn-outline-secondary"
                disabled={saving}
              >
                Cancel
              </button>

              <button
                type="button"
                onClick={handleSavePackage}
                className="btn btn-primary shadow-md"
                disabled={saving}
              >
                {saving ? (
                  <>
                    <Lucide
                      icon="Loader"
                      className="w-4 h-4 mr-2 animate-spin"
                    />
                    Saving...
                  </>
                ) : (
                  <>
                    <Lucide
                      icon="Check"
                      className="w-4 h-4 mr-2"
                    />
                    {editingPackageId
                      ? "Update Package"
                      : "Save Package"}
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
      {/* END: Package Modal */}
    </>
  );
}

function Main() {
  const [tab, setTab] = useState("packages");
  const [session, setSession] = useState(null);

  useEffect(() => {
    getSession().then(setSession);
  }, []);

  return (
    <>
      <div className="flex gap-1 border-b border-slate-200 dark:border-darkmode-400 mb-5">
        {[
          ["packages", "Packages"],
          ["addons", "Add-ons catalogue"],
        ].map(([key, text]) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            className={classnames("px-4 py-2 text-sm -mb-px border-b-2", {
              "border-primary text-primary font-medium": tab === key,
              "border-transparent text-slate-500 hover:text-slate-700": tab !== key,
            })}
          >
            {text}
          </button>
        ))}
      </div>
      {tab === "packages" ? (
        <PackagesTab onSession={setSession} />
      ) : (
        <AddonsCatalogue session={session} />
      )}
    </>
  );
}

export default Main;