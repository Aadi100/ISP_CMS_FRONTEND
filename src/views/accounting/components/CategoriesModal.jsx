import { useState } from "react";
import { supabase } from "@/lib/supabase";
import { friendlyError } from "@/lib/errors";
import { Modal, ErrorBanner } from "./common";

export default function CategoriesModal({ categories, canEdit, onClose, onChanged }) {
  const [name, setName] = useState("");
  const [editId, setEditId] = useState(null);
  const [editName, setEditName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const run = async (fn) => {
    setBusy(true);
    setError("");
    try {
      const { error: err } = await fn();
      if (err) throw err;
      await onChanged();
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setBusy(false);
    }
  };

  const add = async () => {
    if (!name.trim()) return;
    await run(() => supabase.from("expense_categories").insert({ name: name.trim() }));
    setName("");
  };
  const rename = async (id) => {
    if (!editName.trim()) return;
    await run(() => supabase.from("expense_categories").update({ name: editName.trim() }).eq("id", id));
    setEditId(null);
  };
  const remove = async (c) => {
    if (!window.confirm(`Delete category "${c.name}"?`)) return;
    await run(() => supabase.from("expense_categories").delete().eq("id", c.id));
  };

  return (
    <Modal title="Expense categories" onClose={onClose}>
      <ErrorBanner message={error} />
      {canEdit && (
        <div className="flex gap-2 mb-4">
          <input
            className="form-control"
            placeholder="New category name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && add()}
          />
          <button type="button" className="btn btn-primary" disabled={busy || !name.trim()} onClick={add}>
            Add
          </button>
        </div>
      )}
      <div className="divide-y divide-slate-200/60 dark:divide-darkmode-400">
        {categories.map((c) => (
          <div key={c.id} className="flex items-center py-2 gap-2">
            {editId === c.id ? (
              <>
                <input className="form-control" value={editName} onChange={(e) => setEditName(e.target.value)} />
                <button type="button" className="btn btn-primary" disabled={busy} onClick={() => rename(c.id)}>
                  Save
                </button>
                <button type="button" className="btn btn-outline-secondary" onClick={() => setEditId(null)}>
                  Cancel
                </button>
              </>
            ) : (
              <>
                <div className="flex-1">
                  {c.name}
                  {c.is_system && <span className="ml-2 text-xs text-slate-400">System</span>}
                </div>
                {canEdit && !c.is_system && (
                  <>
                    <button
                      type="button"
                      className="btn btn-outline-secondary btn-sm"
                      onClick={() => {
                        setEditId(c.id);
                        setEditName(c.name);
                      }}
                    >
                      Rename
                    </button>
                    <button type="button" className="btn btn-outline-danger btn-sm" disabled={busy} onClick={() => remove(c)}>
                      Delete
                    </button>
                  </>
                )}
              </>
            )}
          </div>
        ))}
      </div>
    </Modal>
  );
}
