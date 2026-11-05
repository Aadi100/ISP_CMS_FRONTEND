import { useCallback, useEffect, useState } from "react";
import { Lucide } from "@/base-components";
import { supabase } from "@/lib/supabase";
import { can } from "@/lib/session";
import { friendlyError } from "@/lib/errors";
import { money, formatDate, titleCase } from "@/lib/format";
import {
  ErrorBanner,
  Pagination,
  Loading,
  Empty,
  BranchSelect,
  DateRange,
  EXPENSE_METHODS,
  likeSafe,
  fetchAll,
  downloadCsv,
  useToast,
} from "./common";
import ExpenseForm from "./ExpenseForm";
import CategoriesModal from "./CategoriesModal";

const SOURCE_BADGE = { payroll: "Payroll", purchase: "Purchase" };

export default function Expenses({ session, branches }) {
  const canCreate = can(session, "accounting", "create");
  const canEdit = can(session, "accounting", "edit");
  const canDelete = can(session, "accounting", "delete");
  const canExport = can(session, "accounting", "export");
  const toast = useToast();

  const [categories, setCategories] = useState([]);
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(10);
  const [search, setSearch] = useState("");
  const [q, setQ] = useState("");
  const [category, setCategory] = useState("");
  const [method, setMethod] = useState("");
  const [source, setSource] = useState("");
  const [branch, setBranch] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [form, setForm] = useState(null); // {expense|null}
  const [showCats, setShowCats] = useState(false);
  const [busyId, setBusyId] = useState(null);

  useEffect(() => {
    const t = setTimeout(() => {
      setQ(search);
      setPage(0);
    }, 300);
    return () => clearTimeout(t);
  }, [search]);

  const loadCategories = useCallback(async () => {
    const { data, error: err } = await supabase.from("expense_categories").select("*").order("name");
    if (err) setError(friendlyError(err));
    else setCategories(data || []);
  }, []);
  useEffect(() => {
    loadCategories();
  }, [loadCategories]);

  const applyFilters = useCallback(
    (query) => {
      const s = likeSafe(q);
      if (s) {
        query = query.or(
          `payee.ilike.%${s}%,description.ilike.%${s}%,expense_number.ilike.%${s}%,reference_no.ilike.%${s}%`
        );
      }
      if (category) query = query.eq("category_id", category);
      if (method) query = query.eq("method", method);
      if (source) query = query.eq("source", source);
      if (branch) query = query.eq("branch_id", branch);
      if (from) query = query.gte("expense_date", from);
      if (to) query = query.lte("expense_date", to);
      return query;
    },
    [q, category, method, source, branch, from, to]
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const { data, error: err, count } = await applyFilters(
        supabase.from("v_expense_ledger").select("*", { count: "exact" })
      )
        .order("expense_date", { ascending: false })
        .order("created_at", { ascending: false })
        .range(page * pageSize, page * pageSize + pageSize - 1);
      if (err) throw err;
      setRows(data || []);
      setTotal(count || 0);
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setLoading(false);
    }
  }, [applyFilters, page, pageSize]);
  useEffect(() => {
    load();
  }, [load]);

  const resetPage = (fn) => (v) => {
    fn(v);
    setPage(0);
  };

  const remove = async (r) => {
    if (!window.confirm(`Delete expense ${r.expense_number} (${money(r.amount)})?`)) return;
    setBusyId(r.id);
    try {
      const { error: err } = await supabase.from("expenses").delete().eq("id", r.id);
      if (err) throw err;
      toast.show("Expense deleted.");
      await load();
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setBusyId(null);
    }
  };

  const exportCsv = async () => {
    try {
      const all = await fetchAll((a, b) =>
        applyFilters(supabase.from("v_expense_ledger").select("*"))
          .order("expense_date", { ascending: false })
          .range(a, b)
      );
      downloadCsv(
        "expenses.csv",
        ["Number", "Date", "Category", "Payee", "Method", "Reference", "Amount", "Source", "Branch", "Description"],
        all.map((r) => [
          r.expense_number,
          r.expense_date,
          r.category_name,
          r.payee,
          r.method,
          r.reference_no,
          r.amount,
          r.source,
          r.branch_name,
          r.description,
        ])
      );
    } catch (e) {
      setError(friendlyError(e));
    }
  };

  return (
    <div>
      {toast.node}
      <div className="flex flex-wrap items-center gap-2 mb-3">
        {canCreate && (
          <button type="button" className="btn btn-primary" onClick={() => setForm({ expense: null })}>
            <Lucide icon="Plus" className="w-4 h-4 mr-2" /> Add expense
          </button>
        )}
        <button type="button" className="btn btn-outline-secondary" onClick={() => setShowCats(true)}>
          Categories
        </button>
        {canExport && (
          <button type="button" className="btn btn-outline-secondary" onClick={exportCsv}>
            <Lucide icon="Download" className="w-4 h-4 mr-2" /> Export CSV
          </button>
        )}
        <input
          className="form-control box w-60 ml-auto"
          placeholder="Search payee, description, number, reference"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <select className="form-select box w-48" value={category} onChange={(e) => resetPage(setCategory)(e.target.value)}>
          <option value="">All categories</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <select className="form-select box w-40" value={method} onChange={(e) => resetPage(setMethod)(e.target.value)}>
          <option value="">All methods</option>
          {EXPENSE_METHODS.map((m) => (
            <option key={m} value={m}>
              {titleCase(m)}
            </option>
          ))}
        </select>
        <select className="form-select box w-36" value={source} onChange={(e) => resetPage(setSource)(e.target.value)}>
          <option value="">All sources</option>
          <option value="manual">Manual</option>
          <option value="payroll">Payroll</option>
          <option value="purchase">Purchase</option>
        </select>
        <BranchSelect branches={branches} value={branch} onChange={resetPage(setBranch)} />
        <DateRange from={from} to={to} onFrom={resetPage(setFrom)} onTo={resetPage(setTo)} />
      </div>
      <ErrorBanner message={error} onClose={() => setError("")} />
      {loading ? (
        <Loading />
      ) : rows.length === 0 ? (
        <div className="box">
          <Empty text="No expenses found." />
        </div>
      ) : (
        <div className="box overflow-x-auto">
          <table className="table table-report -mt-2">
            <thead>
              <tr>
                <th className="whitespace-nowrap">Number</th>
                <th className="whitespace-nowrap">Date</th>
                <th className="whitespace-nowrap">Category</th>
                <th className="whitespace-nowrap">Payee / description</th>
                <th className="whitespace-nowrap">Method</th>
                <th className="whitespace-nowrap text-right">Amount</th>
                <th className="whitespace-nowrap text-center">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const manual = r.source === "manual";
                return (
                  <tr key={r.id} className="intro-x">
                    <td className="whitespace-nowrap">{r.expense_number}</td>
                    <td className="whitespace-nowrap">{formatDate(r.expense_date)}</td>
                    <td>
                      {r.category_name}
                      {!manual && (
                        <span className="ml-2 py-1 px-2 rounded-full text-xs bg-pending/20 text-pending">
                          {SOURCE_BADGE[r.source] || titleCase(r.source)}
                        </span>
                      )}
                    </td>
                    <td>
                      <div className="font-medium">{r.payee || "-"}</div>
                      <div className="text-slate-500 text-xs">
                        {[r.description, r.reference_no && `Ref ${r.reference_no}`, r.branch_name]
                          .filter(Boolean)
                          .join(" | ")}
                      </div>
                    </td>
                    <td className="whitespace-nowrap">{titleCase(r.method)}</td>
                    <td className="text-right whitespace-nowrap font-medium">{money(r.amount)}</td>
                    <td className="text-center whitespace-nowrap">
                      {manual && (canEdit || canDelete) ? (
                        <div className="flex justify-center gap-3">
                          {canEdit && (
                            <button type="button" className="flex items-center" onClick={() => setForm({ expense: r })}>
                              <Lucide icon="Edit" className="w-4 h-4 mr-1" /> Edit
                            </button>
                          )}
                          {canDelete && (
                            <button
                              type="button"
                              className="flex items-center text-danger"
                              disabled={busyId === r.id}
                              onClick={() => remove(r)}
                            >
                              <Lucide icon="Trash2" className="w-4 h-4 mr-1" /> Delete
                            </button>
                          )}
                        </div>
                      ) : (
                        <span className="text-slate-400 text-xs">{manual ? "" : "Read-only"}</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <Pagination
        page={page}
        pageSize={pageSize}
        total={total}
        onPage={setPage}
        onPageSize={(n) => {
          setPageSize(n);
          setPage(0);
        }}
      />
      {form && (
        <ExpenseForm
          expense={form.expense}
          categories={categories}
          branches={branches}
          onClose={() => setForm(null)}
          onSaved={(msg) => {
            setForm(null);
            toast.show(msg);
            load();
          }}
        />
      )}
      {showCats && (
        <CategoriesModal
          categories={categories}
          canEdit={canEdit || canCreate}
          onClose={() => setShowCats(false)}
          onChanged={loadCategories}
        />
      )}
    </div>
  );
}
