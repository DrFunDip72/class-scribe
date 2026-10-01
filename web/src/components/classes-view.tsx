"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { AlertCircle, ArrowLeft, Check, GraduationCap, Pencil, Plus, Trash2, X } from "lucide-react";
import { MAX_CLASS_NAME } from "@/lib/classes";
import { useWorkspace } from "@/components/workspace-provider";

export function ClassesView() {
  const workspace = useWorkspace();
  const [newName, setNewName] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Deleting a class leaves its recordings in place, so the warning can be
  // specific about what actually happens to them.
  const counts = useMemo(() => {
    const map = new Map<string, number>();
    for (const job of workspace.jobs) {
      if (job.class_id) map.set(job.class_id, (map.get(job.class_id) ?? 0) + 1);
    }
    return map;
  }, [workspace.jobs]);

  async function run(action: () => Promise<string | null>) {
    setBusy(true);
    setError(await action());
    setBusy(false);
  }

  async function add() {
    if (!newName.trim()) return;
    const name = newName;
    await run(async () => {
      const message = await workspace.createClass(name);
      if (!message) setNewName("");
      return message;
    });
  }

  async function saveRename(id: string) {
    const name = editingName;
    await run(async () => {
      const message = await workspace.renameClass(id, name);
      if (!message) setEditingId(null);
      return message;
    });
  }

  return <section className="page-section">
    <Link className="back-link" href="/settings"><ArrowLeft size={15} /> Settings</Link>
    <h1 className="page-title">Classes</h1>
    <p className="page-subtitle">Your classes are private to your account. Add the ones you record.</p>

    {error ? <p className="inline-alert error" role="alert"><AlertCircle size={16} />{error}</p> : null}

    <form
      className="class-add"
      onSubmit={(event) => { event.preventDefault(); void add(); }}
    >
      <label className="sr-only" htmlFor="new-class">Class name</label>
      <input
        id="new-class"
        value={newName}
        maxLength={MAX_CLASS_NAME}
        disabled={busy}
        placeholder="e.g. NURS 2430"
        onChange={(event) => setNewName(event.target.value)}
      />
      <button type="submit" className="button button-primary" disabled={busy || !newName.trim()}>
        <Plus size={17} /> Add
      </button>
    </form>

    {workspace.classes.length === 0
      ? <div className="empty-state compact">
        <GraduationCap />
        <h3>No classes yet</h3>
        <p>Add your first class above.</p>
      </div>
      : <ul className="class-list">{workspace.classes.map((item) => {
        const count = counts.get(item.id) ?? 0;
        if (editingId === item.id) {
          return <li key={item.id} className="class-row editing">
            <input
              value={editingName}
              maxLength={MAX_CLASS_NAME}
              disabled={busy}
              autoFocus
              onChange={(event) => setEditingName(event.target.value)}
              onKeyDown={(event) => { if (event.key === "Enter") void saveRename(item.id); }}
            />
            <button type="button" className="icon-button" aria-label="Save name" disabled={busy} onClick={() => void saveRename(item.id)}>
              <Check size={16} />
            </button>
            <button type="button" className="icon-button" aria-label="Cancel" disabled={busy} onClick={() => setEditingId(null)}>
              <X size={16} />
            </button>
          </li>;
        }
        return <li key={item.id} className="class-row">
          <div>
            <strong>{item.name}</strong>
            <small>{count} recording{count === 1 ? "" : "s"}</small>
          </div>
          <button
            type="button"
            className="icon-button"
            aria-label={`Rename ${item.name}`}
            disabled={busy}
            onClick={() => { setEditingId(item.id); setEditingName(item.name); }}
          ><Pencil size={15} /></button>
          <button
            type="button"
            className="icon-button danger"
            aria-label={`Delete ${item.name}`}
            disabled={busy}
            onClick={() => setConfirmDelete(item.id)}
          ><Trash2 size={15} /></button>
        </li>;
      })}</ul>}

    {confirmDelete ? (() => {
      const target = workspace.classes.find((item) => item.id === confirmDelete);
      const count = counts.get(confirmDelete) ?? 0;
      return <div className="sheet-backdrop" role="presentation" onClick={() => setConfirmDelete(null)}>
        <div className="sheet" role="dialog" aria-label="Delete class" onClick={(event) => event.stopPropagation()}>
          <div className="sheet-heading">
            <strong>Delete {target?.name}?</strong>
            <button type="button" className="icon-button" aria-label="Close" onClick={() => setConfirmDelete(null)}><X size={16} /></button>
          </div>
          <p className="sheet-copy">
            {count
              ? `Its ${count} recording${count === 1 ? "" : "s"} will stay in your notes and move to Unsorted. Nothing is deleted.`
              : "This class has no recordings."}
          </p>
          <button
            type="button"
            className="button button-full button-danger"
            disabled={busy}
            onClick={() => { const id = confirmDelete; setConfirmDelete(null); void run(() => workspace.deleteClass(id)); }}
          >
            <Trash2 size={17} /> Delete class
          </button>
        </div>
      </div>;
    })() : null}
  </section>;
}
