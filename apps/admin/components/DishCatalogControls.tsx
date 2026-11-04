'use client';

import { useEffect, useState, type FormEvent } from 'react';
import type { CanonicalDish } from '@tastes/contracts';
import { callAdmin } from '../infrastructure/firebase';

export function DishCatalogControls() {
  const [data, setData] = useState<{
    dishes: CanonicalDish[];
    pending: { id: string; rawName: string }[];
  } | null>(null);
  const [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [id, setId] = useState(''),
    [name, setName] = useState(''),
    [aliases, setAliases] = useState(''),
    [reason, setReason] = useState('');
  async function load() {
    try {
      const result = await callAdmin<
        Record<string, never>,
        { dishes: CanonicalDish[]; pending: { id: string; rawName: string }[] }
      >('getAdminDishCatalog', {});
      if (!Array.isArray(result?.dishes) || !Array.isArray(result?.pending))
        throw new Error(
          'Dish catalogue is unavailable. Refresh after the server update.',
        );
      setData(result);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : 'Could not load dish catalogue.',
      );
    }
  }
  useEffect(() => {
    void load();
  }, []);
  async function save(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      await callAdmin('upsertCanonicalDish', {
        id,
        name,
        aliases: aliases
          .split('\n')
          .map((s) => s.trim())
          .filter(Boolean),
        status: 'active',
        reason,
      });
      await load();
      setReason('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not approve dish.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <section
      className="panel cities-panel"
      aria-label="Taste matching dish catalogue"
    >
      <div className="panel-heading">
        <h2>Taste matching dish catalogue</h2>
        <button className="button" disabled={busy} onClick={() => void load()}>
          Refresh
        </button>
      </div>
      <p>
        Approve exact dishes and aliases shared across venues. Keep variants
        such as vegan carbonara separate. Similar spelling does not confirm the
        same dish.
      </p>
      {error ? <p role="alert">{error}</p> : null}
      {data ? (
        <>
          <label>
            Approved dish
            <select
              value={id}
              onChange={(e) => {
                const dish = data.dishes.find((d) => d.id === e.target.value);
                setId(dish?.id ?? '');
                setName(dish?.name ?? '');
                setAliases(dish?.aliases.join('\n') ?? '');
              }}
            >
              <option value="">Add a new canonical dish</option>
              {data.dishes.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </label>
          <form className="form-grid" onSubmit={save}>
            <label>
              Stable dish ID
              <input
                value={id}
                onChange={(e) => setId(e.target.value)}
                required
                pattern="[a-z0-9][a-z0-9._:-]*"
                maxLength={128}
              />
            </label>
            <label>
              Canonical name
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                maxLength={120}
              />
            </label>
            <label>
              Exact aliases (one per line)
              <textarea
                value={aliases}
                onChange={(e) => setAliases(e.target.value)}
                rows={4}
              />
            </label>
            <label>
              Reason for approval
              <input
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                required
                minLength={5}
                maxLength={500}
              />
            </label>
            <button
              className="button primary"
              disabled={busy || reason.trim().length < 5}
            >
              Approve dish and aliases
            </button>
          </form>
          <h3>Names awaiting review</h3>
          <p>
            Review these names before adding an exact alias or a new dish.
            Approval is reflected as the recommendation index refreshes.
          </p>
          {data.pending.map((p) => (
            <div className="panel-heading" key={p.id}>
              <span>{p.rawName}</span>
              <button
                className="button"
                disabled={busy}
                onClick={() => {
                  setName(p.rawName);
                  setAliases(p.rawName);
                  setId('');
                }}
              >
                Prepare for review
              </button>
            </div>
          ))}
          {!data.pending.length ? <p>No unresolved names.</p> : null}
        </>
      ) : null}
    </section>
  );
}
