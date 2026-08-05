'use client';

import { onAuthStateChanged, signInWithEmailAndPassword, signOut, type User } from 'firebase/auth';
import { useCallback, useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { callAdmin, getFirebaseAuth } from '../infrastructure/firebase';

type View = 'overview' | 'reports' | 'venues' | 'users';
type StaffRole = 'admin' | 'moderator';

interface Overview {
  totalUsers: number;
  publishedReviews: number;
  pendingReports: number;
  activeVenues: number;
  newUsers: { last24Hours: number; last7Days: number; last30Days: number };
  analytics: { connected: boolean; propertyId: string; dau: number; mau: number; error: string | null };
  reviewCities: Array<{ city: string; count: number }>;
  adsense: { connected: boolean; estimatedEarnings: number; impressions: number; clicks: number; error: string | null };
}

interface ReportItem {
  id: string;
  reporterId: string;
  reporterName: string;
  reason: string;
  details: string;
  targetType: 'review' | 'comment';
  targetId: string;
  parentId: string | null;
  contentPreview: string;
  createdAt: string;
}

interface AdminVenue {
  id: string;
  name: string;
  city: string;
  address: string;
  category: string;
  status: 'active' | 'hidden' | 'pending' | 'merged';
  featured: boolean;
  hotSpot: boolean;
  reviewCount: number;
}

interface AdminUser {
  id: string;
  displayName: string;
  username: string | null;
  email: string | null;
  phoneNumber: string | null;
  status: 'active' | 'suspended' | 'banned' | 'deleted';
  createdAt: string;
}

const emptyOverview: Overview = {
  totalUsers: 0,
  publishedReviews: 0,
  pendingReports: 0,
  activeVenues: 0,
  newUsers: { last24Hours: 0, last7Days: 0, last30Days: 0 },
  analytics: { connected: false, propertyId: '', dau: 0, mau: 0, error: null },
  reviewCities: [],
  adsense: { connected: false, estimatedEarnings: 0, impressions: 0, clicks: 0, error: null },
};

function Icon({ name }: { name: View | 'logout' | 'search' | 'plus' }) {
  const paths: Record<string, ReactNode> = {
    overview: <><rect x="3" y="3" width="7" height="7" rx="2"/><rect x="14" y="3" width="7" height="7" rx="2"/><rect x="3" y="14" width="7" height="7" rx="2"/><rect x="14" y="14" width="7" height="7" rx="2"/></>,
    reports: <><path d="M12 3 4 6v6c0 5 3.4 8 8 9 4.6-1 8-4 8-9V6l-8-3Z"/><path d="M12 8v5M12 17h.01"/></>,
    venues: <><path d="M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="2.5"/></>,
    users: <><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></>,
    logout: <><path d="M10 17l5-5-5-5M15 12H3"/><path d="M14 3h5a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-5"/></>,
    search: <><circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/></>,
    plus: <><path d="M12 5v14M5 12h14"/></>,
  };
  return <svg className="icon" viewBox="0 0 24 24" aria-hidden="true">{paths[name]}</svg>;
}

function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? '—' : new Intl.DateTimeFormat('en', { dateStyle: 'medium' }).format(date);
}

function errorMessage(error: unknown) {
  const message = (error as { message?: unknown })?.message;
  return typeof message === 'string' ? message.replace(/^Firebase:\s*/, '') : 'Something went wrong.';
}

function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      await signInWithEmailAndPassword(getFirebaseAuth(), email, password);
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="login-shell">
      <div className="login-glow" />
      <form className="login-card" onSubmit={submit}>
        <div className="brand brand-large"><span className="brand-mark">T</span><span>Tastes</span></div>
        <p className="eyebrow">STAFF PORTAL</p>
        <h1>Welcome back</h1>
        <p className="muted">Sign in with your administrator account.</p>
        <label>Email<input type="email" required value={email} onChange={(event) => setEmail(event.target.value)} placeholder="admin@tastes.com" /></label>
        <label>Password<input type="password" required value={password} onChange={(event) => setPassword(event.target.value)} placeholder="••••••••" /></label>
        {error && <p className="form-error">{error}</p>}
        <button className="button primary full" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
      </form>
    </main>
  );
}

function Metric({ label, value, note, tone = 'neutral' }: { label: string; value: number; note: string; tone?: 'neutral' | 'red' }) {
  return <article className={`metric-card ${tone}`}><p>{label}</p><strong>{value.toLocaleString()}</strong><span>{note}</span></article>;
}

function OverviewView({ data }: { data: Overview }) {
  const max = Math.max(data.newUsers.last24Hours, data.newUsers.last7Days, data.newUsers.last30Days, 1);
  const bars = [
    ['24 hours', data.newUsers.last24Hours],
    ['7 days', data.newUsers.last7Days],
    ['30 days', data.newUsers.last30Days],
  ] as const;
  return <>
    <div className="metrics">
      <Metric label="Total users" value={data.totalUsers} note="Registered profiles" />
      <Metric label="Published reviews" value={data.publishedReviews} note="Visible content" />
      <Metric label="Pending reports" value={data.pendingReports} note="Needs attention" tone="red" />
      <Metric label="Active venues" value={data.activeVenues} note="Available in discovery" />
    </div>
    <div className="metrics compact-metrics">
      <Metric label="DAU" value={data.analytics.dau} note={data.analytics.connected ? 'Google Analytics · yesterday' : 'Analytics permission needed'} />
      <Metric label="MAU" value={data.analytics.mau} note={data.analytics.connected ? 'Google Analytics · 30 days' : `Property ${data.analytics.propertyId || 'not found'}`} />
      <Metric label="Ad impressions" value={data.adsense.impressions} note={data.adsense.connected ? 'AdSense · 30 days' : 'AdSense OAuth not connected'} />
      <Metric label="Ad clicks" value={data.adsense.clicks} note={data.adsense.connected ? `$${data.adsense.estimatedEarnings.toFixed(2)} estimated` : 'Publisher account required'} />
    </div>
    <div className="split-grid">
      <section className="panel">
        <div className="panel-heading"><div><p className="eyebrow">GROWTH</p><h2>New signups</h2></div><span className="status-pill good">Live</span></div>
        <div className="bar-chart">
          {bars.map(([label, value]) => <div className="bar-row" key={label}><span>{label}</span><div className="bar-track"><i style={{ width: `${Math.max(4, value / max * 100)}%` }} /></div><strong>{value}</strong></div>)}
        </div>
      </section>
      <section className="panel focus-panel">
        <p className="eyebrow">TODAY’S FOCUS</p>
        <h2>{data.pendingReports ? `${data.pendingReports} reports are waiting` : 'The moderation queue is clear'}</h2>
        <p className="muted">Review flagged content first, then check pending venues and recent account actions.</p>
      </section>
    </div>
    <section className="panel cities-panel">
      <div className="panel-heading"><div><p className="eyebrow">CONTENT</p><h2>Reviews by city</h2></div><span className="status-pill">Top {data.reviewCities.length}</span></div>
      {data.reviewCities.length ? <div className="city-list">{data.reviewCities.map((item) => <div key={item.city}><span>{item.city}</span><strong>{item.count}</strong></div>)}</div> : <p className="muted empty-copy">Published reviews with city data will appear here.</p>}
    </section>
  </>;
}

function ReportsView({ reports, run }: { reports: ReportItem[]; run: (name: string, input: unknown) => Promise<void> }) {
  if (!reports.length) return <Empty title="No pending reports" text="New content reports will appear here." />;
  return <div className="report-grid">{reports.map((report) => <article className="report-card" key={report.id}>
    <div className="report-top"><span className="status-pill warning">{report.reason}</span><time>{formatDate(report.createdAt)}</time></div>
    <p className="content-preview">“{report.contentPreview || report.details || 'No preview available'}”</p>
    <dl><div><dt>Reporter</dt><dd>{report.reporterName}</dd></div><div><dt>Content</dt><dd>{report.targetType} · {report.targetId.slice(0, 10)}</dd></div></dl>
    <div className="actions">
      <button className="button ghost" onClick={() => run('dismissReport', { reportId: report.id })}>Dismiss</button>
      <button className="button ghost" onClick={() => {
        const text = window.prompt('Replace content text:', report.contentPreview);
        if (text) void run('editContent', { reportId: report.id, targetType: report.targetType, targetId: report.targetId, ...(report.parentId ? { parentId: report.parentId } : {}), text });
      }}>Edit</button>
      <button className="button danger" onClick={() => run('deleteContent', { reportId: report.id, targetType: report.targetType, targetId: report.targetId, ...(report.parentId ? { parentId: report.parentId } : {}) })}>Remove</button>
    </div>
  </article>)}</div>;
}

function VenueForm({ venue, close, saved }: { venue?: AdminVenue; close: () => void; saved: () => Promise<void> }) {
  const [values, setValues] = useState({ name: venue?.name ?? '', city: venue?.city ?? '', address: venue?.address ?? '', category: venue?.category ?? '', status: venue?.status ?? 'active' });
  const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent) {
    event.preventDefault(); setBusy(true);
    try { await callAdmin('upsertVenue', { ...(venue ? { venueId: venue.id } : {}), ...values }); await saved(); close(); } finally { setBusy(false); }
  }
  return <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && close()}><form className="modal" onSubmit={submit}>
    <div className="panel-heading"><div><p className="eyebrow">VENUE</p><h2>{venue ? 'Edit venue' : 'Add venue'}</h2></div><button type="button" className="close" onClick={close}>×</button></div>
    <div className="form-grid"><label>Name<input required value={values.name} onChange={(e) => setValues({ ...values, name: e.target.value })}/></label><label>Category<input required value={values.category} onChange={(e) => setValues({ ...values, category: e.target.value })}/></label><label>City<input required value={values.city} onChange={(e) => setValues({ ...values, city: e.target.value })}/></label><label>Status<select value={values.status} onChange={(e) => setValues({ ...values, status: e.target.value as typeof values.status })}><option value="active">Active</option><option value="pending">Pending</option><option value="hidden">Hidden</option></select></label><label className="wide">Address<input required value={values.address} onChange={(e) => setValues({ ...values, address: e.target.value })}/></label></div>
    <div className="actions end"><button type="button" className="button ghost" onClick={close}>Cancel</button><button className="button primary" disabled={busy}>{busy ? 'Saving…' : 'Save venue'}</button></div>
  </form></div>;
}

function VenuesView({ venues, isAdmin, refresh, run }: { venues: AdminVenue[]; isAdmin: boolean; refresh: () => Promise<void>; run: (name: string, input: unknown) => Promise<void> }) {
  const [editing, setEditing] = useState<AdminVenue | 'new' | null>(null);
  async function merge(venue: AdminVenue) {
    const targetVenueId = window.prompt(`Merge “${venue.name}” into venue ID:`);
    if (!targetVenueId) return;
    await run('mergeVenues', { sourceVenueId: venue.id, targetVenueId });
  }
  return <>
    {isAdmin && <div className="toolbar-right"><button className="button primary" onClick={() => setEditing('new')}><Icon name="plus"/> Add venue</button></div>}
    <div className="table-wrap"><table><thead><tr><th>Venue</th><th>Location</th><th>Status</th><th>Flags</th><th>Reviews</th><th /></tr></thead><tbody>{venues.map((venue) => <tr key={venue.id}><td><strong>{venue.name}</strong><small>{venue.category}</small></td><td>{venue.city}<small>{venue.address}</small></td><td><span className={`status-pill ${venue.status}`}>{venue.status}</span></td><td><div className="flag-list"><button disabled={!isAdmin} className={venue.featured ? 'flag active' : 'flag'} onClick={() => run('setVenueFlags', { venueId: venue.id, featured: !venue.featured, hotSpot: venue.hotSpot })}>Featured</button><button disabled={!isAdmin} className={venue.hotSpot ? 'flag active' : 'flag'} onClick={() => run('setVenueFlags', { venueId: venue.id, featured: venue.featured, hotSpot: !venue.hotSpot })}>Hot spot</button></div></td><td>{venue.reviewCount}</td><td>{isAdmin && <div className="row-menu"><button className="text-button" onClick={() => setEditing(venue)}>Edit</button><button className="text-button" onClick={() => merge(venue)}>Merge</button></div>}</td></tr>)}</tbody></table></div>
    {editing && (editing === 'new'
      ? <VenueForm close={() => setEditing(null)} saved={refresh}/>
      : <VenueForm venue={editing} close={() => setEditing(null)} saved={refresh}/>)} 
  </>;
}

function UsersView({ users, run }: { users: AdminUser[]; run: (name: string, input: unknown) => Promise<void> }) {
  async function action(name: string, user: AdminUser) {
    const reason = window.prompt(`Reason for this account action on ${user.displayName}:`);
    if (!reason) return;
    await run(name, { userId: user.id, reason });
  }
  return <div className="table-wrap"><table><thead><tr><th>User</th><th>Contact</th><th>Joined</th><th>Status</th><th /></tr></thead><tbody>{users.map((user) => <tr key={user.id}><td><strong>{user.displayName}</strong><small>@{user.username ?? user.id.slice(0, 8)}</small></td><td>{user.email ?? user.phoneNumber ?? '—'}</td><td>{formatDate(user.createdAt)}</td><td><span className={`status-pill ${user.status}`}>{user.status}</span></td><td><div className="row-menu">{user.status === 'active' ? <><button className="text-button" onClick={() => action('suspendUser', user)}>Suspend</button><button className="text-button red" onClick={() => action('banUser', user)}>Ban</button></> : <button className="text-button" onClick={() => action(user.status === 'banned' ? 'unbanUser' : 'reinstateUser', user)}>Reinstate</button>}</div></td></tr>)}</tbody></table></div>;
}

function Empty({ title, text }: { title: string; text: string }) { return <div className="empty"><span>✓</span><h2>{title}</h2><p>{text}</p></div>; }

export function AdminApp() {
  const [user, setUser] = useState<User | null>(null);
  const [role, setRole] = useState<StaffRole | null>(null);
  const [checking, setChecking] = useState(true);
  const [view, setView] = useState<View>('overview');
  const [overview, setOverview] = useState(emptyOverview);
  const [reports, setReports] = useState<ReportItem[]>([]);
  const [venues, setVenues] = useState<AdminVenue[]>([]);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');

  useEffect(() => onAuthStateChanged(getFirebaseAuth(), async (nextUser) => {
    setUser(nextUser);
    if (!nextUser) { setRole(null); setChecking(false); return; }
    const token = await nextUser.getIdTokenResult(true);
    const claim = token.claims.role;
    setRole(claim === 'admin' || claim === 'moderator' ? claim : null);
    setChecking(false);
  }), []);

  const refresh = useCallback(async (target = view, search = query) => {
    setBusy(true);
    try {
      if (target === 'overview') setOverview(await callAdmin('getAdminOverview', {}));
      if (target === 'reports') setReports(await callAdmin('getReportedContent', {}));
      if (target === 'venues') setVenues(await callAdmin('searchAdminVenues', { query: search }));
      if (target === 'users') setUsers(await callAdmin('searchUsers', { query: search }));
    } catch (error) { setNotice(errorMessage(error)); } finally { setBusy(false); }
  }, [query, view]);

  useEffect(() => { if (user && role) void refresh(); }, [user, role, view]);

  async function run(name: string, input: unknown) {
    setBusy(true); setNotice('');
    try { await callAdmin(name, input); setNotice('Changes saved.'); await refresh(); }
    catch (error) { setNotice(errorMessage(error)); setBusy(false); }
  }

  const titles = useMemo(() => ({ overview: ['Overview', 'A quick view of platform health.'], reports: ['Moderation', 'Review and resolve reported content.'], venues: ['Venues', 'Maintain place data and discovery flags.'], users: ['Users', 'Search accounts and manage access.'] }), []);
  if (checking) return <div className="loading-screen"><span className="spinner" /></div>;
  if (!user) return <Login />;
  if (!role) return <main className="access-denied"><div className="brand brand-large"><span className="brand-mark">T</span><span>Tastes</span></div><h1>Access restricted</h1><p>This account does not have an admin or moderator role.</p><button className="button primary" onClick={() => signOut(getFirebaseAuth())}>Sign out</button></main>;

  return <div className="app-shell">
    <aside>
      <div className="brand"><span className="brand-mark">T</span><span>Tastes</span><em>Admin</em></div>
      <nav>{(['overview', 'reports', 'venues', 'users'] as View[]).map((item) => <button key={item} className={view === item ? 'active' : ''} onClick={() => { setQuery(''); setView(item); }}><Icon name={item}/>{item === 'overview' ? 'Overview' : item === 'reports' ? 'Moderation' : item[0]?.toUpperCase() + item.slice(1)}{item === 'reports' && overview.pendingReports > 0 && <b>{overview.pendingReports}</b>}</button>)}</nav>
      <div className="staff-card"><div className="avatar">{(user.email?.[0] ?? 'A').toUpperCase()}</div><div><strong>{user.email?.split('@')[0]}</strong><span>{role}</span></div><button aria-label="Sign out" onClick={() => signOut(getFirebaseAuth())}><Icon name="logout"/></button></div>
    </aside>
    <main className="content">
      <header><div><p className="eyebrow">TASTES CONTROL CENTER</p><h1>{titles[view][0]}</h1><p>{titles[view][1]}</p></div>{view !== 'overview' && <form className="search" onSubmit={(event) => { event.preventDefault(); void refresh(view, query); }}><Icon name="search"/><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={`Search ${view}…`}/></form>}</header>
      {notice && <button className="notice" onClick={() => setNotice('')}>{notice}<span>×</span></button>}
      <div className={busy ? 'view busy' : 'view'}>
        {view === 'overview' && <OverviewView data={overview}/>} 
        {view === 'reports' && <ReportsView reports={reports} run={run}/>} 
        {view === 'venues' && <VenuesView venues={venues} isAdmin={role === 'admin'} refresh={() => refresh('venues', query)} run={run}/>} 
        {view === 'users' && <UsersView users={users} run={run}/>} 
      </div>
    </main>
  </div>;
}
