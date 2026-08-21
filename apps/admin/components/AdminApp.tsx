'use client';

import { onAuthStateChanged, signInWithEmailAndPassword, signOut, type User } from 'firebase/auth';
import { deleteObject, getDownloadURL, ref as storageRef, uploadBytes } from 'firebase/storage';
import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent, type FormEvent, type ReactNode } from 'react';
import { callAdmin, getFirebaseAuth, getFirebaseStorage } from '../infrastructure/firebase';

type View = 'overview' | 'reports' | 'venues' | 'users';
type StaffRole = 'admin' | 'moderator';
type DiscoverTag = 'trending' | 'most-reviewed' | 'new' | 'for-you' | 'hidden-gem';

const venueCategoryOptions = [
  { value: 'Cafe', label: 'Cafe' },
  { value: 'Restaurant', label: 'Restaurant' },
  { value: 'Bar', label: 'Bar' },
  { value: 'Italian', label: 'Italian 🇮🇹' },
  { value: 'Japanese', label: 'Japanese 🇯🇵' },
  { value: 'Georgian', label: 'Georgian 🇬🇪' },
  { value: 'Thai', label: 'Thai 🇹🇭' },
  { value: 'American', label: 'American 🇺🇸' },
  { value: 'Russian', label: 'Russian 🇷🇺' },
  { value: 'Korean', label: 'Korean 🇰🇷' },
  { value: 'Indian', label: 'Indian 🇮🇳' },
  { value: 'Mexican', label: 'Mexican 🇲🇽' },
  { value: 'Chinese', label: 'Chinese 🇨🇳' },
] as const;

interface OpeningHour { day: string; hours: string }
interface PopularDish { name: string; rating: number }

interface Overview {
  totalUsers: number;
  totalReviews: number;
  pendingReports: number;
  activeVenues: number;
  newUsers: { last24Hours: number; last7Days: number; last30Days: number };
  newReviews: { last24Hours: number; last7Days: number; last30Days: number };
  analytics: { connected: boolean; propertyId: string; dau: number; mau: number; error: string | null };
  reviewCities: Array<{ city: string; count: number }>;
}

type Period = '24h' | '7d' | '30d';

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
  status: 'active' | 'hidden' | 'pending' | 'merged' | 'removed';
  featured: boolean;
  hotSpot: boolean;
  reviewCount: number;
  imageUrl: string | null;
  photoUrls: string[];
  priceLevel: number | null;
  latitude: number | null;
  longitude: number | null;
  googlePlaceId: string | null;
  discoverTags: DiscoverTag[];
  phone: string | null;
  website: string | null;
  openingHours: OpeningHour[];
  placeTags: string[];
  popularDishes: PopularDish[];
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

interface UserHistory {
  user: AdminUser & { moderationReason: string | null; suspendedUntil: string | null };
  reviews: Array<{ id: string; text: string; status: string; venueName: string; createdAt: string }>;
  reports: Array<{ id: string; reason: string; status: string; createdAt: string }>;
  actions: Array<{ id: string; action: string; details: Record<string, unknown>; createdAt: string }>;
}

type RunAdmin = (name: string, input: unknown) => Promise<boolean>;
type AccountActionName = 'suspendUser' | 'banUser' | 'unbanUser' | 'reinstateUser';

const reportActionNames = new Set(['dismissReport', 'editContent', 'deleteContent']);

function successMessage(name: string, input: unknown) {
  const messages: Record<string, string> = {
    dismissReport: 'Report dismissed.',
    editContent: 'Reported content updated.',
    deleteContent: 'Reported content removed.',
    mergeVenues: 'Venues merged.',
    setVenueFlags: 'Venue flags updated.',
    suspendUser: 'User suspended.',
    banUser: 'User banned.',
    unbanUser: 'User unbanned.',
    reinstateUser: 'User reinstated.',
  };
  if (name === 'setVenueStatus') {
    const status = (input as { status?: unknown })?.status;
    if (status === 'hidden') return 'Venue hidden.';
    if (status === 'active') return 'Venue restored.';
    if (status === 'removed') return 'Venue removed.';
  }
  return messages[name] ?? 'Changes saved.';
}

const emptyOverview: Overview = {
  totalUsers: 0,
  totalReviews: 0,
  pendingReports: 0,
  activeVenues: 0,
  newUsers: { last24Hours: 0, last7Days: 0, last30Days: 0 },
  newReviews: { last24Hours: 0, last7Days: 0, last30Days: 0 },
  analytics: { connected: false, propertyId: '', dau: 0, mau: 0, error: null },
  reviewCities: [],
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

function ModalShell({ title, eyebrow, close, children }: { title: string; eyebrow: string; close: () => void; children: ReactNode }) {
  return <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && close()}>
    <section className="modal" role="dialog" aria-modal="true" aria-label={title}>
      <div className="panel-heading"><div><p className="eyebrow">{eyebrow}</p><h2>{title}</h2></div><button type="button" className="close" onClick={close}>×</button></div>
      {children}
    </section>
  </div>;
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
        <label>Email<input autoComplete="email" name="email" type="email" required value={email} onChange={(event) => setEmail(event.target.value)} placeholder="admin@tastes.com" /></label>
        <label>Password<input autoComplete="current-password" name="password" type="password" required value={password} onChange={(event) => setPassword(event.target.value)} placeholder="••••••••" /></label>
        {error && <p className="form-error">{error}</p>}
        <button className="button primary full" disabled={busy} type="submit">{busy ? 'Signing in…' : 'Sign in'}</button>
      </form>
    </main>
  );
}

function Metric({ label, value, note, tone = 'neutral' }: { label: string; value: number; note: string; tone?: 'neutral' | 'red' }) {
  return <article className={`metric-card ${tone}`}><p>{label}</p><strong>{value.toLocaleString()}</strong><span>{note}</span></article>;
}

function PeriodPanel({ eyebrow, title, counts, unit }: {
  eyebrow: string;
  title: string;
  counts: { last24Hours: number; last7Days: number; last30Days: number };
  unit: string;
}) {
  const [period, setPeriod] = useState<Period>('24h');
  const periods = [
    { key: '24h', label: '24h', description: 'last 24 hours', value: counts.last24Hours },
    { key: '7d', label: '7d', description: 'last 7 days', value: counts.last7Days },
    { key: '30d', label: '30d', description: 'last 30 days', value: counts.last30Days },
  ] as const;
  const max = Math.max(counts.last24Hours, counts.last7Days, counts.last30Days, 1);
  const selected = periods.find((item) => item.key === period) ?? periods[0];
  return <section className="panel">
    <div className="panel-heading">
      <div><p className="eyebrow">{eyebrow}</p><h2>{title}</h2></div>
      <div className="period-switcher" role="group" aria-label={`${title} period`}>
        {periods.map((item) => <button
          key={item.key}
          type="button"
          aria-pressed={period === item.key}
          className={period === item.key ? 'active' : ''}
          onClick={() => setPeriod(item.key)}
        >{item.label}</button>)}
      </div>
    </div>
    <div className="signup-period-value" aria-live="polite">
      <strong>{selected.value.toLocaleString()}</strong>
      <span>{unit} in the {selected.description}</span>
    </div>
    <div className="signup-period-bar" aria-hidden="true">
      <div className="bar-track"><i style={{ width: `${selected.value === 0 ? 0 : Math.max(4, selected.value / max * 100)}%` }} /></div>
    </div>
  </section>;
}

function OverviewView({ data }: { data: Overview }) {
  return <>
    <div className="metrics">
      <Metric label="Total users" value={data.totalUsers} note="Registered profiles" />
      <Metric label="Total reviews" value={data.totalReviews} note="All review records" />
      <Metric label="Pending reports" value={data.pendingReports} note="Needs attention" tone="red" />
      <Metric label="Active venues" value={data.activeVenues} note="Available in discovery" />
    </div>
    <div className="metrics compact-metrics analytics-metrics">
      <Metric label="Daily Active Users" value={data.analytics.dau} note="Live app activity · last 24 hours" />
      <Metric label="Monthly Active Users" value={data.analytics.mau} note="Live app activity · last 30 days" />
    </div>
    <div className="trio-grid">
      <PeriodPanel eyebrow="GROWTH" title="New signups" counts={data.newUsers} unit="new users" />
      <PeriodPanel eyebrow="CONTENT" title="Reviews posted" counts={data.newReviews} unit="reviews posted" />
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

function ReportsView({ reports, run }: { reports: ReportItem[]; run: RunAdmin }) {
  const [selected, setSelected] = useState<{ report: ReportItem; action: 'edit' | 'delete' } | null>(null);
  const [text, setText] = useState('');
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!selected) return;
    const target = {
      reportId: selected.report.id,
      targetType: selected.report.targetType,
      targetId: selected.report.targetId,
      ...(selected.report.parentId ? { parentId: selected.report.parentId } : {}),
    };
    const saved = selected.action === 'edit'
      ? await run('editContent', { ...target, text })
      : await run('deleteContent', target);
    if (!saved) return;
    setSelected(null);
  }
  if (!reports.length) return <Empty title="No pending reports" text="New content reports will appear here." />;
  return <><div className="report-grid">{reports.map((report) => <article className="report-card" key={report.id}>
    <div className="report-top"><span className="status-pill warning">{report.reason}</span><time>{formatDate(report.createdAt)}</time></div>
    <section className="report-content">
      <p className="report-field-label">Reported content</p>
      <p className="content-preview">“{report.contentPreview || 'No preview available'}”</p>
    </section>
    <section className="report-context">
      <div><p className="report-field-label">Reason</p><p>{report.reason}</p></div>
      <div><p className="report-field-label">Explanation</p><p>{report.details || 'No additional explanation provided.'}</p></div>
    </section>
    <dl><div><dt>Reporter</dt><dd>{report.reporterName}</dd></div><div><dt>Content</dt><dd>{report.targetType} · {report.targetId.slice(0, 10)}</dd></div></dl>
    <div className="actions">
      <button className="button ghost" onClick={() => run('dismissReport', { reportId: report.id })}>Dismiss</button>
      <button className="button ghost" onClick={() => { setText(report.contentPreview); setSelected({ report, action: 'edit' }); }}>Edit</button>
      <button className="button danger" onClick={() => setSelected({ report, action: 'delete' })}>Remove</button>
    </div>
  </article>)}</div>
    {selected && <ModalShell eyebrow="MODERATION" title={selected.action === 'edit' ? 'Edit reported content' : 'Remove reported content'} close={() => setSelected(null)}>
      <form onSubmit={submit}>
        {selected.action === 'edit'
          ? <label>Content<textarea required maxLength={2000} rows={7} value={text} onChange={(event) => setText(event.target.value)} /></label>
          : <p className="modal-copy">This hides the content from the product and resolves the report. The action is recorded in the audit log.</p>}
        <div className="actions end"><button type="button" className="button ghost" onClick={() => setSelected(null)}>Cancel</button><button className={selected.action === 'delete' ? 'button danger' : 'button primary'}>{selected.action === 'delete' ? 'Remove content' : 'Save changes'}</button></div>
      </form>
    </ModalShell>}
  </>;
}

const discoverTagOptions: Array<{ value: DiscoverTag; label: string }> = [
  { value: 'trending', label: 'Trending' },
  { value: 'most-reviewed', label: 'Most reviewed' },
  { value: 'new', label: 'New' },
  { value: 'for-you', label: 'For you' },
  { value: 'hidden-gem', label: 'Hidden gem' },
];

function uniqueVenueImages(venue?: AdminVenue) {
  return [...new Set([venue?.imageUrl, ...(venue?.photoUrls ?? [])].filter((value): value is string => Boolean(value)))];
}

function optionalText(value: string) {
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function commaSeparated(value: string) {
  return [...new Set(value.split(',').map((item) => item.trim()).filter(Boolean))];
}

function VenueForm({ venue, close, saved }: { venue?: AdminVenue; close: () => void; saved: () => Promise<void> }) {
  const [venueId] = useState(() => venue?.id ?? crypto.randomUUID());
  const initialImages = useMemo(() => uniqueVenueImages(venue), [venue]);
  const [values, setValues] = useState({
    name: venue?.name ?? '',
    city: venue?.city ?? '',
    address: venue?.address ?? '',
    category: venue?.category ?? '',
    status: venue?.status ?? 'active',
    priceLevel: venue?.priceLevel?.toString() ?? '',
    latitude: venue?.latitude?.toString() ?? '',
    longitude: venue?.longitude?.toString() ?? '',
    googlePlaceId: venue?.googlePlaceId ?? '',
    phone: venue?.phone ?? '',
    website: venue?.website ?? '',
    placeTags: venue?.placeTags.join(', ') ?? '',
    featured: venue?.featured ?? false,
    hotSpot: venue?.hotSpot ?? false,
  });
  const [discoverTags, setDiscoverTags] = useState<DiscoverTag[]>(venue?.discoverTags ?? []);
  const [openingHours, setOpeningHours] = useState<OpeningHour[]>(venue?.openingHours ?? []);
  const [popularDishes, setPopularDishes] = useState<PopularDish[]>(venue?.popularDishes ?? []);
  const [images, setImages] = useState<string[]>(initialImages);
  const [newUploads, setNewUploads] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [formError, setFormError] = useState('');

  function toggleDiscoverTag(tag: DiscoverTag) {
    setDiscoverTags((current) => current.includes(tag) ? current.filter((item) => item !== tag) : [...current, tag]);
  }

  function moveImage(index: number, direction: -1 | 1) {
    setImages((current) => {
      const target = index + direction;
      if (target < 0 || target >= current.length) return current;
      const next = [...current];
      [next[index], next[target]] = [next[target]!, next[index]!];
      return next;
    });
  }

  function managedImageReference(url: string) {
    try {
      const reference = storageRef(getFirebaseStorage(), url);
      return reference.fullPath.startsWith(`venue-images/${venueId}/`) ? reference : null;
    } catch { return null; }
  }

  async function deleteManagedImage(url: string) {
    const reference = managedImageReference(url);
    if (reference) await deleteObject(reference);
  }

  async function removeImage(url: string) {
    setImages((current) => current.filter((item) => item !== url));
    if (!newUploads.includes(url)) return;
    setNewUploads((current) => current.filter((item) => item !== url));
    try { await deleteManagedImage(url); } catch { /* A failed cleanup must not block editing. */ }
  }

  async function uploadImages(event: ChangeEvent<HTMLInputElement>) {
    const files = [...(event.target.files ?? [])];
    event.target.value = '';
    if (!files.length) return;
    if (images.length + files.length > 12) { setFormError('A venue can have up to 12 photos.'); return; }
    const invalid = files.find((file) => !file.type.startsWith('image/') || file.size >= 10 * 1024 * 1024);
    if (invalid) { setFormError('Choose image files smaller than 10 MB.'); return; }
    setUploading(true); setFormError('');
    try {
      const results = await Promise.allSettled(files.map(async (file) => {
        const extension = file.name.split('.').at(-1)?.toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg';
        const reference = storageRef(getFirebaseStorage(), `venue-images/${venueId}/${crypto.randomUUID()}.${extension}`);
        await uploadBytes(reference, file, { contentType: file.type });
        return getDownloadURL(reference);
      }));
      const uploaded = results.flatMap((result) => result.status === 'fulfilled' ? [result.value] : []);
      setImages((current) => [...current, ...uploaded]);
      setNewUploads((current) => [...current, ...uploaded]);
      if (uploaded.length !== files.length) setFormError(`${files.length - uploaded.length} photo upload${files.length - uploaded.length === 1 ? '' : 's'} failed.`);
    } catch (error) { setFormError(errorMessage(error)); }
    finally { setUploading(false); }
  }

  async function cancel() {
    await Promise.allSettled(newUploads.map(deleteManagedImage));
    close();
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if ((values.latitude === '') !== (values.longitude === '')) {
      setFormError('Latitude and longitude must be provided together.');
      return;
    }
    const tags = commaSeparated(values.placeTags);
    if (tags.length > 12) { setFormError('Use no more than 12 place tags.'); return; }
    setBusy(true); setFormError('');
    try {
      await callAdmin('upsertVenue', {
        venueId,
        name: values.name,
        city: values.city,
        address: values.address,
        category: values.category,
        status: values.status,
        imageUrl: images[0] ?? null,
        photoUrls: images,
        priceLevel: values.priceLevel ? Number(values.priceLevel) : null,
        latitude: values.latitude ? Number(values.latitude) : null,
        longitude: values.longitude ? Number(values.longitude) : null,
        googlePlaceId: optionalText(values.googlePlaceId),
        discoverTags,
        phone: optionalText(values.phone),
        website: optionalText(values.website),
        openingHours,
        placeTags: tags,
        popularDishes,
        featured: values.featured,
        hotSpot: values.hotSpot,
      });
      const removedImages = initialImages.filter((url) => !images.includes(url));
      await Promise.allSettled(removedImages.map(deleteManagedImage));
      setNewUploads([]);
      await saved();
      close();
    } catch (error) { setFormError(errorMessage(error)); }
    finally { setBusy(false); }
  }

  return <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy && !uploading) void cancel(); }}><form className="modal venue-editor" onSubmit={submit}>
    <div className="panel-heading venue-editor-heading"><div><p className="eyebrow">VENUE</p><h2>{venue ? 'Edit venue' : 'Add venue'}</h2><p className="muted">Manage everything shown on the venue page.</p></div><button type="button" className="close" disabled={busy || uploading} onClick={() => void cancel()}>×</button></div>

    <div className="venue-editor-body">
      <section className="editor-section"><div className="editor-section-title"><div><h3>Photos</h3><p>The first photo is used as the cover.</p></div><label className="button ghost upload-button">{uploading ? 'Uploading…' : 'Upload photos'}<input type="file" accept="image/*" multiple disabled={busy || uploading || images.length >= 12} onChange={(event) => void uploadImages(event)}/></label></div>
        {images.length ? <div className="venue-photo-grid">{images.map((url, index) => <article key={url} className={index === 0 ? 'venue-photo cover' : 'venue-photo'}><img src={url} alt=""/><span>{index === 0 ? 'Cover' : index + 1}</span><div><button type="button" disabled={index === 0} onClick={() => moveImage(index, -1)} aria-label="Move photo left">←</button><button type="button" disabled={index === images.length - 1} onClick={() => moveImage(index, 1)} aria-label="Move photo right">→</button><button type="button" className="red" onClick={() => void removeImage(url)} aria-label="Remove photo">×</button></div></article>)}</div> : <div className="photo-empty"><span>＋</span><p>No photos yet. Upload a cover and gallery images.</p></div>}
      </section>

      <section className="editor-section"><div className="editor-section-title"><div><h3>Basics</h3><p>Core information and publishing state.</p></div></div><div className="form-grid">
        <label>Name<input required minLength={2} maxLength={160} value={values.name} onChange={(event) => setValues({ ...values, name: event.target.value })}/></label>
        <label>Category<select required value={values.category} onChange={(event) => setValues({ ...values, category: event.target.value })}><option value="">Select a category…</option>{venueCategoryOptions.map((category) => <option key={category.value} value={category.value}>{category.label}</option>)}</select></label>
        <label>City<input required minLength={2} maxLength={120} value={values.city} onChange={(event) => setValues({ ...values, city: event.target.value })}/></label>
        <label>Status<select value={values.status} onChange={(event) => setValues({ ...values, status: event.target.value as typeof values.status })}><option value="active">Active</option><option value="pending">Pending</option><option value="hidden">Hidden</option>{venue ? <option value="removed">Removed</option> : null}</select></label>
        <label className="wide">Address<input required minLength={2} maxLength={300} value={values.address} onChange={(event) => setValues({ ...values, address: event.target.value })}/></label>
        <label>Price level<select value={values.priceLevel} onChange={(event) => setValues({ ...values, priceLevel: event.target.value })}><option value="">Not specified</option><option value="1">$</option><option value="2">$$</option><option value="3">$$$</option><option value="4">$$$$</option></select></label>
        <div className="editor-toggles"><label><input type="checkbox" checked={values.featured} onChange={(event) => setValues({ ...values, featured: event.target.checked })}/>Featured</label><label><input type="checkbox" checked={values.hotSpot} onChange={(event) => setValues({ ...values, hotSpot: event.target.checked })}/>Hot spot</label></div>
      </div></section>

      <section className="editor-section"><div className="editor-section-title"><div><h3>Location & contact</h3><p>Coordinates power map discovery and distance.</p></div></div><div className="form-grid">
        <label>Latitude<input type="number" step="any" min="-90" max="90" placeholder="41.0082" value={values.latitude} onChange={(event) => setValues({ ...values, latitude: event.target.value })}/></label>
        <label>Longitude<input type="number" step="any" min="-180" max="180" placeholder="28.9784" value={values.longitude} onChange={(event) => setValues({ ...values, longitude: event.target.value })}/></label>
        <label>Phone<input type="tel" maxLength={40} value={values.phone} onChange={(event) => setValues({ ...values, phone: event.target.value })}/></label>
        <label>Website<input maxLength={300} placeholder="https://…" value={values.website} onChange={(event) => setValues({ ...values, website: event.target.value })}/></label>
        <label className="wide">Google Place ID<input maxLength={256} value={values.googlePlaceId} onChange={(event) => setValues({ ...values, googlePlaceId: event.target.value })}/></label>
      </div></section>

      <section className="editor-section"><div className="editor-section-title"><div><h3>Discovery</h3><p>Choose curated feeds and add descriptive chips.</p></div></div>
        <div className="tag-options">{discoverTagOptions.map((tag) => <label key={tag.value} className={discoverTags.includes(tag.value) ? 'selected' : ''}><input type="checkbox" checked={discoverTags.includes(tag.value)} onChange={() => toggleDiscoverTag(tag.value)}/>{tag.label}</label>)}</div>
        <label>Place tags <span className="field-hint">Comma-separated, up to 12</span><input maxLength={970} placeholder="Romantic, Outdoor seating, Pet friendly" value={values.placeTags} onChange={(event) => setValues({ ...values, placeTags: event.target.value })}/></label>
      </section>

      <section className="editor-section"><div className="editor-section-title"><div><h3>Opening hours</h3><p>Add the rows exactly as they should appear in the app.</p></div><button type="button" className="button ghost" onClick={() => setOpeningHours([...openingHours, { day: '', hours: '' }])}>＋ Add hours</button></div>
        {openingHours.length ? <div className="repeat-list">{openingHours.map((item, index) => <div key={index} className="repeat-row hours-row"><input required maxLength={40} aria-label={`Days ${index + 1}`} placeholder="Monday – Friday" value={item.day} onChange={(event) => setOpeningHours(openingHours.map((row, rowIndex) => rowIndex === index ? { ...row, day: event.target.value } : row))}/><input required maxLength={80} aria-label={`Hours ${index + 1}`} placeholder="09:00 – 22:00" value={item.hours} onChange={(event) => setOpeningHours(openingHours.map((row, rowIndex) => rowIndex === index ? { ...row, hours: event.target.value } : row))}/><button type="button" aria-label="Remove hours" onClick={() => setOpeningHours(openingHours.filter((_, rowIndex) => rowIndex !== index))}>×</button></div>)}</div> : <p className="editor-empty-copy">No opening hours specified.</p>}
      </section>

      <section className="editor-section"><div className="editor-section-title"><div><h3>Popular dishes</h3><p>Optional editorial picks shown on the venue page.</p></div><button type="button" className="button ghost" onClick={() => setPopularDishes([...popularDishes, { name: '', rating: 5 }])}>＋ Add dish</button></div>
        {popularDishes.length ? <div className="repeat-list">{popularDishes.map((dish, index) => <div key={index} className="repeat-row dish-row"><input required maxLength={120} aria-label={`Dish ${index + 1}`} placeholder="Dish name" value={dish.name} onChange={(event) => setPopularDishes(popularDishes.map((item, itemIndex) => itemIndex === index ? { ...item, name: event.target.value } : item))}/><input required type="number" min="0" max="5" step="0.1" aria-label={`Dish rating ${index + 1}`} value={dish.rating} onChange={(event) => setPopularDishes(popularDishes.map((item, itemIndex) => itemIndex === index ? { ...item, rating: Number(event.target.value) } : item))}/><button type="button" aria-label="Remove dish" onClick={() => setPopularDishes(popularDishes.filter((_, itemIndex) => itemIndex !== index))}>×</button></div>)}</div> : <p className="editor-empty-copy">No popular dishes added.</p>}
      </section>
    </div>

    {formError && <p className="form-error venue-form-error">{formError}</p>}
    <div className="actions end venue-editor-actions"><span>{images.length}/12 photos</span><button type="button" className="button ghost" disabled={busy || uploading} onClick={() => void cancel()}>Cancel</button><button className="button primary" disabled={busy || uploading}>{busy ? 'Saving…' : uploading ? 'Uploading…' : 'Save venue'}</button></div>
  </form></div>;
}

function VenuesView({ venues, isAdmin, refresh, run }: { venues: AdminVenue[]; isAdmin: boolean; refresh: () => Promise<void>; run: RunAdmin }) {
  const [editing, setEditing] = useState<AdminVenue | 'new' | null>(null);
  const [merging, setMerging] = useState<AdminVenue | null>(null);
  const [targetVenueId, setTargetVenueId] = useState('');
  const [statusAction, setStatusAction] = useState<{ venue: AdminVenue; status: 'active' | 'hidden' | 'removed' } | null>(null);
  async function merge(event: FormEvent) {
    event.preventDefault();
    if (!merging || !targetVenueId) return;
    if (!await run('mergeVenues', { sourceVenueId: merging.id, targetVenueId })) return;
    setMerging(null); setTargetVenueId('');
  }
  async function changeStatus() {
    if (!statusAction) return;
    const action = statusAction;
    setStatusAction(null);
    await run('setVenueStatus', { venueId: action.venue.id, status: action.status });
  }
  return <>
    {isAdmin && <div className="toolbar-right"><button className="button primary" onClick={() => setEditing('new')}><Icon name="plus"/> Add venue</button></div>}
    <div className="table-wrap"><table><thead><tr><th>Venue</th><th>Location</th><th>Status</th><th>Flags</th><th>Reviews</th><th /></tr></thead><tbody>{venues.filter((venue) => venue.status !== 'removed').map((venue) => <tr key={venue.id}><td><div className="venue-cell">{venue.imageUrl ? <img src={venue.imageUrl} alt=""/> : <span className="venue-cell-placeholder">⌖</span>}<div><strong>{venue.name}</strong><small>{venue.category}{venue.priceLevel ? ` · ${'$'.repeat(venue.priceLevel)}` : ''}</small></div></div></td><td>{venue.city}<small>{venue.address}</small></td><td><span className={`status-pill ${venue.status}`}>{venue.status}</span></td><td><div className="flag-list"><button disabled={!isAdmin} className={venue.featured ? 'flag active' : 'flag'} onClick={() => run('setVenueFlags', { venueId: venue.id, featured: !venue.featured, hotSpot: venue.hotSpot })}>Featured</button><button disabled={!isAdmin} className={venue.hotSpot ? 'flag active' : 'flag'} onClick={() => run('setVenueFlags', { venueId: venue.id, featured: venue.featured, hotSpot: !venue.hotSpot })}>Hot spot</button></div></td><td>{venue.reviewCount}</td><td>{isAdmin && <div className="row-menu"><button className="text-button" onClick={() => setEditing(venue)}>Edit</button>{venue.status === 'active' ? <button className="text-button" onClick={() => setStatusAction({ venue, status: 'hidden' })}>Hide</button> : venue.status === 'hidden' ? <button className="text-button" onClick={() => setStatusAction({ venue, status: 'active' })}>Restore</button> : null}<button className="text-button" onClick={() => { setMerging(venue); setTargetVenueId(''); }}>Merge</button>{venue.status !== 'removed' && <button className="text-button red" onClick={() => setStatusAction({ venue, status: 'removed' })}>Remove</button>}</div>}</td></tr>)}</tbody></table></div>
    {editing && (editing === 'new'
      ? <VenueForm close={() => setEditing(null)} saved={refresh}/>
      : <VenueForm venue={editing} close={() => setEditing(null)} saved={refresh}/>)} 
    {merging && <ModalShell eyebrow="VENUE MERGE" title={`Merge ${merging.name}`} close={() => setMerging(null)}><form onSubmit={merge}><p className="modal-copy">All reviews will move to the selected venue. The source venue will remain as a merged record.</p><label>Destination venue<select required value={targetVenueId} onChange={(event) => setTargetVenueId(event.target.value)}><option value="">Select a venue…</option>{venues.filter((venue) => venue.id !== merging.id && venue.status !== 'merged' && venue.status !== 'removed').map((venue) => <option key={venue.id} value={venue.id}>{venue.name} · {venue.city}</option>)}</select></label><div className="actions end"><button type="button" className="button ghost" onClick={() => setMerging(null)}>Cancel</button><button className="button danger" disabled={!targetVenueId}>Merge venues</button></div></form></ModalShell>}
    {statusAction && <ModalShell eyebrow="VENUE STATUS" title={`${statusAction.status === 'active' ? 'Restore' : statusAction.status === 'hidden' ? 'Hide' : 'Remove'} ${statusAction.venue.name}`} close={() => setStatusAction(null)}><p className="modal-copy">{statusAction.status === 'removed' ? 'The venue will disappear from discovery but remain in the database and audit log.' : `The venue status will change to ${statusAction.status}.`}</p><div className="actions end"><button type="button" className="button ghost" onClick={() => setStatusAction(null)}>Cancel</button><button type="button" className={statusAction.status === 'removed' ? 'button danger' : 'button primary'} onClick={() => void changeStatus()}>Confirm</button></div></ModalShell>}
  </>;
}

function UsersView({ users, run }: { users: AdminUser[]; run: RunAdmin }) {
  const [selectedAction, setSelectedAction] = useState<{ name: AccountActionName; user: AdminUser } | null>(null);
  const [reason, setReason] = useState('');
  const [suspendedUntil, setSuspendedUntil] = useState('');
  const [history, setHistory] = useState<UserHistory | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState('');
  async function action(event: FormEvent) {
    event.preventDefault();
    if (!selectedAction) return;
    const saved = await run(selectedAction.name, {
      userId: selectedAction.user.id,
      reason,
      ...(selectedAction.name === 'suspendUser' ? { suspendedUntil: new Date(`${suspendedUntil}T23:59:59.000Z`).toISOString() } : {}),
    });
    if (!saved) return;
    setSelectedAction(null); setReason(''); setSuspendedUntil('');
  }
  function chooseAction(name: AccountActionName, user: AdminUser) {
    setReason(''); setSuspendedUntil(''); setSelectedAction({ name, user });
  }
  async function showHistory(user: AdminUser) {
    setHistoryLoading(true); setHistoryError('');
    try { setHistory(await callAdmin<{ userId: string }, UserHistory>('getUserHistory', { userId: user.id })); }
    catch (error) { setHistoryError(errorMessage(error)); }
    finally { setHistoryLoading(false); }
  }
  return <>{historyError && <button className="notice" onClick={() => setHistoryError('')}>{historyError}<span>×</span></button>}<div className="table-wrap"><table><thead><tr><th>User</th><th>Contact</th><th>Joined</th><th>Status</th><th /></tr></thead><tbody>{users.map((user) => <tr key={user.id}><td><strong>{user.displayName}</strong><small>@{user.username ?? user.id.slice(0, 8)}</small></td><td>{user.email ?? user.phoneNumber ?? '—'}</td><td>{formatDate(user.createdAt)}</td><td><span className={`status-pill ${user.status}`}>{user.status}</span></td><td><div className="row-menu"><button className="text-button" disabled={historyLoading} onClick={() => void showHistory(user)}>History</button>{user.status === 'active' ? <><button className="text-button" onClick={() => chooseAction('suspendUser', user)}>Suspend</button><button className="text-button red" onClick={() => chooseAction('banUser', user)}>Ban</button></> : <button className="text-button" onClick={() => chooseAction(user.status === 'banned' ? 'unbanUser' : 'reinstateUser', user)}>{user.status === 'banned' ? 'Unban' : 'Reinstate'}</button>}</div></td></tr>)}</tbody></table></div>
    {selectedAction && <ModalShell eyebrow="ACCOUNT ACTION" title={`${selectedAction.name === 'suspendUser' ? 'Temporarily suspend' : selectedAction.name === 'banUser' ? 'Permanently ban' : selectedAction.name === 'unbanUser' ? 'Unban' : 'Reinstate'} ${selectedAction.user.displayName}`} close={() => setSelectedAction(null)}><form onSubmit={action}><label>Reason<textarea required maxLength={500} rows={4} value={reason} onChange={(event) => setReason(event.target.value)} /></label>{selectedAction.name === 'suspendUser' && <label>Suspended until<input type="date" required min={new Date().toISOString().slice(0, 10)} value={suspendedUntil} onChange={(event) => setSuspendedUntil(event.target.value)} /></label>}<div className="actions end"><button type="button" className="button ghost" onClick={() => setSelectedAction(null)}>Cancel</button><button className={selectedAction.name === 'banUser' ? 'button danger' : 'button primary'}>{selectedAction.name === 'banUser' ? 'Permanently ban' : 'Confirm action'}</button></div></form></ModalShell>}
    {history && <ModalShell eyebrow="USER HISTORY" title={history.user.displayName} close={() => setHistory(null)}><div className="history-summary"><div><span>Status</span><strong className={`status-pill ${history.user.status}`}>{history.user.status}</strong></div><div><span>Joined</span><strong>{formatDate(history.user.createdAt)}</strong></div>{history.user.suspendedUntil && <div><span>Suspended until</span><strong>{formatDate(history.user.suspendedUntil)}</strong></div>}{history.user.moderationReason && <div className="wide"><span>Latest moderation reason</span><strong>{history.user.moderationReason}</strong></div>}</div><div className="history-grid"><HistoryList title="Reviews" empty="No reviews" items={history.reviews.map((item) => ({ id: item.id, title: item.venueName, text: item.text || item.status, date: item.createdAt }))} /><HistoryList title="Reports filed" empty="No reports" items={history.reports.map((item) => ({ id: item.id, title: item.reason, text: item.status, date: item.createdAt }))} /><HistoryList title="Account actions" empty="No account actions" items={history.actions.map((item) => ({ id: item.id, title: item.action.replaceAll('-', ' '), text: String(item.details.reason ?? ''), date: item.createdAt }))} /></div></ModalShell>}
  </>;
}

function HistoryList({ title, empty, items }: { title: string; empty: string; items: Array<{ id: string; title: string; text: string; date: string }> }) {
  return <section className="history-list"><h3>{title}</h3>{items.length ? items.map((item) => <article key={item.id}><div><strong>{item.title}</strong><time>{formatDate(item.date)}</time></div>{item.text && <p>{item.text}</p>}</article>) : <p className="muted">{empty}</p>}</section>;
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
  const searchRequestId = useRef(0);

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
      if (target === 'reports') {
        const [nextReports, nextOverview] = await Promise.all([
          callAdmin<unknown, ReportItem[]>('getReportedContent', {}),
          callAdmin<unknown, Overview>('getAdminOverview', {}),
        ]);
        setReports(nextReports);
        setOverview(nextOverview);
        return nextReports;
      }
      if (target === 'venues') {
        const requestId = ++searchRequestId.current;
        const nextVenues = await callAdmin<unknown, AdminVenue[]>('searchAdminVenues', { query: search });
        if (requestId === searchRequestId.current) setVenues(nextVenues);
      }
      if (target === 'users') {
        const requestId = ++searchRequestId.current;
        const nextUsers = await callAdmin<unknown, AdminUser[]>('searchUsers', { query: search });
        if (requestId === searchRequestId.current) setUsers(nextUsers);
      }
    } catch (error) { setNotice(errorMessage(error)); } finally { setBusy(false); }
  }, [query, view]);

  useEffect(() => { if (user && role) void refresh(); }, [user, role, view]);

  async function run(name: string, input: unknown) {
    setBusy(true); setNotice('');
    try {
      await callAdmin(name, input);
      setNotice(successMessage(name, input));
      const refreshedReports = await refresh();
      if (reportActionNames.has(name)) {
        const reportId = (input as { reportId?: unknown })?.reportId;
        if (typeof reportId === 'string') {
          const pending = (refreshedReports ?? reports).filter((report) => report.id !== reportId);
          setReports(pending);
          setOverview((currentOverview) => ({ ...currentOverview, pendingReports: pending.length }));
        }
      }
      return true;
    }
    catch (error) { setNotice(errorMessage(error)); setBusy(false); return false; }
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
      <header><div><p className="eyebrow">TASTES CONTROL CENTER</p><h1>{titles[view][0]}</h1><p>{titles[view][1]}</p></div>{view !== 'overview' && <form className="search" onSubmit={(event) => { event.preventDefault(); void refresh(view, query); }}><Icon name="search"/><input value={query} onChange={(event) => { const nextQuery = event.target.value; setQuery(nextQuery); if (!nextQuery.trim()) void refresh(view, ''); }} placeholder={`Search ${view}…`}/></form>}</header>
      {notice && <button className="notice" onClick={() => setNotice('')}>{notice}<span>×</span></button>}
      <div className={busy ? 'view busy' : 'view'}>
        {view === 'overview' && <OverviewView data={overview}/>}
        {view === 'reports' && <ReportsView reports={reports} run={run}/>}
        {view === 'venues' && <VenuesView venues={venues} isAdmin={role === 'admin'} refresh={async () => { await refresh('venues', query); }} run={run}/>}
        {view === 'users' && <UsersView users={users} run={run}/>}
      </div>
    </main>
  </div>;
}
