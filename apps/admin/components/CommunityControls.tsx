'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { callAdmin } from '../infrastructure/firebase';

interface Settings {
  mode: 'shadow' | 'enabled';
  ready: boolean;
  firstObservedAt: string | null;
  calculatedAt: string | null;
  overrides: { targetType: string; targetId: string; reason: string }[];
}

export function CommunityControls() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [reason, setReason] = useState('');
  const [targetType, setTargetType] = useState('user');
  const [targetId, setTargetId] = useState('');
  async function load() {
    try {
      setSettings(await callAdmin('getCommunityDiscoverySettings', {}));
    } catch (e) {
      setError(
        e instanceof Error ? e.message : 'Could not load discovery settings.',
      );
    }
  }
  useEffect(() => {
    void load();
  }, []);
  async function act(name: string, input: object) {
    setBusy(true);
    setError('');
    try {
      await callAdmin(name, { ...input, reason });
      await load();
    } catch (e) {
      setError(
        e instanceof Error ? e.message : 'Could not update discovery settings.',
      );
    } finally {
      setBusy(false);
    }
  }
  function exclude(event: FormEvent) {
    event.preventDefault();
    void act('setCommunityDiscoveryOverride', {
      targetType,
      targetId: targetId.trim(),
      excluded: true,
    });
  }
  const canAct = !busy && reason.trim().length >= 3;
  return (
    <section className="panel cities-panel" aria-label="Community discovery">
      <div className="panel-heading">
        <h2>Community discovery</h2>
        <button className="button" disabled={busy} onClick={() => void load()}>
          Refresh
        </button>
      </div>
      {error && <p role="alert">{error}</p>}
      {settings ? (
        <>
          <p>
            {settings.mode === 'enabled'
              ? 'Weekly rankings are enabled when a fresh calculation is available.'
              : 'Weekly rankings are being observed. Current suggestions remain visible in the app.'}
          </p>
          {!settings.ready && (
            <p>
              Activation requires at least seven days of observed activity and a
              recent calculation.
            </p>
          )}
          <label>
            Reason for change
            <input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              maxLength={500}
            />
          </label>
          <div className="form-grid">
            <button
              className="button"
              disabled={!canAct || settings.mode === 'shadow'}
              onClick={() =>
                void act('setCommunityDiscoveryMode', { mode: 'shadow' })
              }
            >
              Keep current suggestions
            </button>
            <button
              className="button primary"
              disabled={
                !canAct || !settings.ready || settings.mode === 'enabled'
              }
              onClick={() =>
                void act('setCommunityDiscoveryMode', { mode: 'enabled' })
              }
            >
              Use weekly rankings
            </button>
          </div>
          <h3>Exclude from recommendations</h3>
          <p>
            Exclusions affect recommendations only. Profiles and reviews remain
            available.
          </p>
          <form className="form-grid" onSubmit={exclude}>
            <label>
              Content type
              <select
                value={targetType}
                onChange={(e) => setTargetType(e.target.value)}
              >
                <option value="user">Profile</option>
                <option value="review">Review</option>
              </select>
            </label>
            <label>
              Profile or review ID
              <input
                required
                value={targetId}
                maxLength={128}
                onChange={(e) => setTargetId(e.target.value)}
              />
            </label>
            <button className="button" disabled={!canAct || !targetId.trim()}>
              Exclude from recommendations
            </button>
          </form>
          {(settings.overrides ?? []).map((item) => (
            <div
              key={`${item.targetType}:${item.targetId}`}
              className="panel-heading"
            >
              <p>
                {item.targetType}: {item.targetId} — {item.reason}
              </p>
              <button
                className="button"
                disabled={!canAct}
                onClick={() =>
                  void act('setCommunityDiscoveryOverride', {
                    targetType: item.targetType,
                    targetId: item.targetId,
                    excluded: false,
                  })
                }
              >
                Restore eligibility
              </button>
            </div>
          ))}
        </>
      ) : (
        <p>Loading discovery settings…</p>
      )}
    </section>
  );
}
