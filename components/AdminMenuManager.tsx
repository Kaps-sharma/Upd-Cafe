'use client';

import { useEffect, useState } from 'react';
import type { MenuItem } from '@/lib/store';
import { MENU_CATEGORIES } from '@/lib/menu';

interface AdminMenuManagerProps {
  initialItems: MenuItem[];
}

export default function AdminMenuManager({ initialItems }: AdminMenuManagerProps) {
  const [items, setItems] = useState<MenuItem[]>(initialItems);
  const [drafts, setDrafts] = useState<Record<number, DraftRow>>({});
  const [addForm, setAddForm] = useState({ name: '', price: '', category: 'General', image: '' });
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = async () => {
    const res = await fetch('/api/admin/menu', { cache: 'no-store' });
    if (res.ok) {
      const data = await res.json();
      setItems(data.items);
      setDrafts({});
    }
  };

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  interface DraftRow {
    name: string;
    price: string;
    category: string;
    image: string;
    active: boolean;
  }

  const draftOf = (item: MenuItem): DraftRow =>
    drafts[item.id] ?? {
      name: item.name,
      price: String(item.price),
      category: item.category,
      image: item.image ?? '',
      active: item.active,
    };

  const setDraft = (id: number, patch: Partial<DraftRow>) =>
    setDrafts((prev) => ({ ...prev, [id]: { ...draftOf(items.find((i) => i.id === id) as MenuItem), ...patch } }));

  const saveRow = async (item: MenuItem) => {
    const draft = draftOf(item);
    if (!draft.name.trim() || !draft.price) {
      setMessage({ type: 'error', text: `Item "${item.name}": name and price are required.` });
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch(`/api/admin/menu/${item.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: draft.name,
          price: Number(draft.price),
          category: draft.category,
          image: draft.image,
          active: draft.active,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Could not save item.');
      setMessage({ type: 'success', text: `"${data.item.name}" saved.` });
      setDrafts((prev) => {
        const next = { ...prev };
        delete next[item.id];
        return next;
      });
      await refresh();
    } catch (err) {
      setMessage({ type: 'error', text: err instanceof Error ? err.message : 'Could not save item.' });
    } finally {
      setBusy(false);
    }
  };

  const remove = async (item: MenuItem) => {
    if (!window.confirm(`Delete "${item.name}" from the menu?`)) return;
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch(`/api/admin/menu/${item.id}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Could not delete item.');
      setMessage({ type: 'success', text: `"${item.name}" deleted.` });
      await refresh();
    } catch (err) {
      setMessage({ type: 'error', text: err instanceof Error ? err.message : 'Could not delete item.' });
    } finally {
      setBusy(false);
    }
  };

  const addItem = async () => {
    if (!addForm.name.trim() || !addForm.price) {
      setMessage({ type: 'error', text: 'Enter a name and price for the new item.' });
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch('/api/admin/menu', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: addForm.name,
          price: Number(addForm.price),
          category: addForm.category,
          image: addForm.image,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Could not add item.');
      setMessage({ type: 'success', text: `"${data.item.name}" added to the menu.` });
      setAddForm({ name: '', price: '', category: 'General', image: '' });
      await refresh();
    } catch (err) {
      setMessage({ type: 'error', text: err instanceof Error ? err.message : 'Could not add item.' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="form-card">
      <div className="card">
        <h2>Add menu item</h2>
        <div className="form-grid form-grid-4">
          <label>
            <span>Name</span>
            <input
              className="input"
              value={addForm.name}
              maxLength={40}
              placeholder="e.g. Anaconda Wrap"
              onChange={(e) => setAddForm({ ...addForm, name: e.target.value })}
            />
          </label>
          <label>
            <span>Price (₹)</span>
            <input
              className="input"
              type="number"
              min={0}
              step="any"
              value={addForm.price}
              placeholder="e.g. 120"
              onChange={(e) => setAddForm({ ...addForm, price: e.target.value })}
            />
          </label>
          <label>
            <span>Category</span>
            <input
              className="input"
              list="category-options"
              value={addForm.category}
              maxLength={30}
              onChange={(e) => setAddForm({ ...addForm, category: e.target.value })}
            />
            <datalist id="category-options">
              {MENU_CATEGORIES.map((cat) => (
                <option key={cat} value={cat} />
              ))}
            </datalist>
          </label>
          <div className="form-action">
            <button className="btn btn-primary" onClick={addItem} disabled={busy}>
              Add item
            </button>
          </div>
          <label className="full-span">
            <span>Image URL (optional)</span>
            <input
              className="input"
              value={addForm.image}
              maxLength={500}
              placeholder="https://example.com/photo.jpg"
              onChange={(e) => setAddForm({ ...addForm, image: e.target.value })}
            />
            <small>Paste a link to a picture of the item. Leave empty to show a placeholder.</small>
          </label>
        </div>
      </div>

      {message && (
        <p className={message.type === 'success' ? 'status success' : 'status error'}>
          {message.text}
        </p>
      )}

      <div className="card table-card admin-menu-table">
        <h2>Menu items ({items.length})</h2>
        <div className="table-scroll">
          <table className="table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Price</th>
                <th>Category</th>
                <th>Image</th>
                <th>Active</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => {
                const draft = draftOf(item);
                const dirty = JSON.stringify(draft) !== JSON.stringify({
                  name: item.name,
                  price: String(item.price),
                  category: item.category,
                  image: item.image ?? '',
                  active: item.active,
                });
                return (
                  <tr key={item.id} className={item.active ? '' : 'row-inactive'}>
                    <td>
                      <input
                        className="input input-sm"
                        value={draft.name}
                        maxLength={40}
                        onChange={(e) => setDraft(item.id, { name: e.target.value })}
                      />
                    </td>
                    <td>
                      <input
                        className="input input-sm input-num"
                        type="number"
                        min={0}
                        step="any"
                        value={draft.price}
                        onChange={(e) => setDraft(item.id, { price: e.target.value })}
                      />
                    </td>
                    <td>
                      <input
                        className="input input-sm"
                        list="category-options"
                        value={draft.category}
                        maxLength={30}
                        onChange={(e) => setDraft(item.id, { category: e.target.value })}
                      />
                    </td>
                    <td>
                      <input
                        className="input input-sm"
                        value={draft.image}
                        maxLength={500}
                        placeholder="Image URL"
                        onChange={(e) => setDraft(item.id, { image: e.target.value })}
                      />
                    </td>
                    <td>
                      <label className="switch">
                        <input
                          type="checkbox"
                          checked={draft.active}
                          onChange={(e) => setDraft(item.id, { active: e.target.checked })}
                        />
                        <span>{draft.active ? 'On' : 'Off'}</span>
                      </label>
                    </td>
                    <td className="table-actions">
                      {dirty && (
                        <button className="btn btn-sm btn-primary" onClick={() => saveRow(item)} disabled={busy}>
                          Save
                        </button>
                      )}
                      <button className="btn btn-sm" onClick={() => remove(item)} disabled={busy}>
                        Delete
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="muted note">
          Inactive items are hidden from customers but kept for later. Deleting an item removes it
          permanently.
        </p>
      </div>
    </section>
  );
}