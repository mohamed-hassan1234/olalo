import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { contentSchema, defaultContent, type ContentIssue } from '@lattice/shared';
import { api, ApiError, RANK, setCsrf, type Me, type Report, type User } from './api';

type Section = 'overview' | 'feedback' | 'content' | 'users' | 'audit' | 'settings' | 'account';
const today = () => new Date(Date.now() + 3 * 3_600_000).toISOString().slice(0, 10);
const addDays = (d: string, n: number) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
const fmt = (n: number | undefined) => (n ?? 0).toLocaleString('en-US');
const ms = (v: number | null) => (v === null ? '—' : v === -1 ? '> 8000 ms' : `≤ ${v} ms`);
const msg = (e: unknown) => (e instanceof ApiError ? e.message : 'Something went wrong.');

function useAsync<T>(fn: () => Promise<T>, deps: unknown[]) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const run = useCallback(() => {
    setLoading(true);
    fn()
      .then((d) => {
        setData(d);
        setError('');
      })
      .catch((e) => setError(msg(e)))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  useEffect(run, [run]);
  return { data, error, loading, reload: run };
}

// ------------------------------------------------------------------ Login
function Login({ onDone }: { onDone: (m: Me) => void }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [totp, setTotp] = useState('');
  const [needTotp, setNeedTotp] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const r = await api<{ user: User; csrfToken: string }>('/auth/login', { method: 'POST', body: { email, password, ...(totp ? { totp } : {}) } });
      setCsrf(r.csrfToken);
      onDone(await api<Me>('/auth/me'));
    } catch (err) {
      if (err instanceof ApiError && err.code === 'totp_required') setNeedTotp(true);
      setError(msg(err));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="wrap" style={{ maxWidth: 420, paddingTop: 80 }}>
      <span className="hud muted">Lattice Admin · private</span>
      <h1>Sign in</h1>
      <form onSubmit={submit} className="card" aria-label="Sign in">
        <label className="field">
          Email
          <input type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        <label className="field">
          Password
          <input type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
        </label>
        {needTotp && (
          <label className="field">
            6-digit authentication code
            <input inputMode="numeric" autoComplete="one-time-code" pattern="\d{6}" value={totp} onChange={(e) => setTotp(e.target.value)} />
          </label>
        )}
        {error && <p className="err" role="alert">{error}</p>}
        <button className="btn primary" disabled={busy} type="submit">
          Sign in
        </button>
      </form>
      <p className="small muted">There is no default account. Accounts are created by an owner or with the documented CLI.</p>
    </div>
  );
}

// ------------------------------------------------------------------ Charts (hand-drawn SVG; grey data, one blue accent)
function DaysChart({ days }: { days: Report['days'] }) {
  const w = 680;
  const h = 200;
  const max = Math.max(1, ...days.map((d) => d.pageViews));
  const peak = days.reduce((a, b) => (b.pageViews > a.pageViews ? b : a), days[0] ?? { day: '', pageViews: 0, uniqueEst: 0 });
  const band = w / Math.max(days.length, 1);
  return (
    <svg viewBox={`0 0 ${w} ${h + 30}`} width="100%" role="img" aria-label={`Visits per day, peak ${peak.pageViews} on ${peak.day}`}>
      <line x1="0" y1={h} x2={w} y2={h} stroke="#2A3B63" />
      {days.map((d, i) => {
        const bh = (d.pageViews / max) * (h - 24);
        const isPeak = d === peak && d.pageViews > 0;
        return (
          <g key={d.day}>
            <rect x={i * band + band * 0.15} y={h - bh} width={band * 0.7} height={bh} rx="3" fill={isPeak ? '#2E8BFF' : '#3A4A66'}>
              <title>{`${d.day}: ${d.pageViews} page views, ≈${d.uniqueEst} new browsers`}</title>
            </rect>
            {isPeak && (
              <text x={i * band + band / 2} y={h - bh - 6} fill="#F2F6FF" fontSize="11" textAnchor="middle">
                {d.pageViews}
              </text>
            )}
            {(i % Math.ceil(days.length / 7) === 0 || i === days.length - 1) && (
              <text x={i * band + band / 2} y={h + 18} fill="#A9B6CC" fontSize="11" textAnchor="middle">
                {d.day.slice(5)}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}

function Bars({ rows, accent }: { rows: { label: string; value: number; note?: string }[]; accent?: string }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {rows.map((r) => (
        <div key={r.label} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <div className="row between" style={{ fontSize: 13 }}>
            <span>{r.label}</span>
            <span className="muted">
              {fmt(r.value)}
              {r.note ? ` · ${r.note}` : ''}
            </span>
          </div>
          <div className="bar">
            <div style={{ width: `${(r.value / max) * 100}%`, background: r.label === accent ? '#2E8BFF' : '#5B6B82' }} />
          </div>
        </div>
      ))}
    </div>
  );
}

// ------------------------------------------------------------------ Overview
function Overview({ me }: { me: Me }) {
  const [range, setRange] = useState(14);
  const to = today();
  const from = addDays(to, -(range - 1));
  const { data: r, error, loading, reload } = useAsync(() => api<Report>(`/reports/summary?from=${from}&to=${to}`), [from, to]);
  const refresh = async () => {
    await api('/reports/refresh', { method: 'POST', body: {} });
    reload();
  };
  if (error) return <p className="err">{error}</p>;
  if (!r) return <p className="muted">{loading ? 'Loading…' : ''}</p>;
  const n = (k: string) => r.totals[k] ?? 0;
  const pv = n('page_view');
  const pct = (a: number, b: number) => (b ? `${Math.round((a / b) * 100)}%` : '—');
  const mobileFcp = r.perf.find((p) => p.deviceClass === 'mobile' && p.metric === 'fcp');
  const hub = r.funnel.find((f) => f.stage === 'Reached hub')?.count ?? 0;
  const first = r.funnel.find((f) => f.stage === 'Opened 1+ world')?.count ?? 0;
  const all3 = r.funnel.find((f) => f.stage === 'Opened all 3 worlds')?.count ?? 0;
  const kpis = [
    { label: 'Page views', value: fmt(pv), note: `${r.from} → ${r.to}` },
    { label: 'Est. unique browsers', value: `≈ ${fmt(n('uniqueEst'))}`, note: 'browsers, not people · ±20–30%' },
    { label: 'Intro completion', value: pct(n('awakening_completed'), n('enter_pressed')), note: `skipped ${pct(n('awakening_skipped'), n('enter_pressed'))}` },
    { label: 'Opened any world', value: pct(first, hub), note: 'of visitors who reached the hub' },
    { label: 'p75 first paint, mobile', value: mobileFcp?.p75 === -1 ? '> 8 s' : mobileFcp?.p75 ? `≤ ${(mobileFcp.p75 / 1000).toFixed(1)} s` : '—', note: 'histogram bucket · target 2.5 s' },
    { label: 'Errors / 1,000 views', value: String(r.errorsPer1000), note: 'WebGL, assets, context loss' },
  ];
  const fb = r.feedback;
  return (
    <>
      <div className="row between">
        <div className="row">
          <h1>Overview</h1>
          {r.containsDemoData && <span className="banner-demo hud">DEMO DATA · not real visitors</span>}
        </div>
        <div className="row" role="group" aria-label="Date range">
          {[1, 7, 14, 30].map((d) => (
            <button key={d} className="chip" aria-pressed={range === d} onClick={() => setRange(d)}>
              {d === 1 ? 'Today' : `${d} days`}
            </button>
          ))}
          <button className="btn" onClick={refresh} title="Aggregate the latest raw events now">
            Refresh
          </button>
        </div>
      </div>
      <div className="grid">
        {kpis.map((k) => (
          <div key={k.label} className="card" style={{ gap: 6 }}>
            <span className="muted" style={{ fontSize: 13 }}>{k.label}</span>
            <span className="kpi">{k.value}</span>
            <span className="small muted">{k.note}</span>
          </div>
        ))}
      </div>
      <div className="grid2">
        <section className="card">
          <h2>Visits per day</h2>
          <DaysChart days={r.days} />
          <span className="small muted">Page views per local day (Mogadishu time). Hover a bar for the new-browser estimate.</span>
        </section>
        <section className="card">
          <h2>{hub ? `${pct(all3, hub)} of hub visitors open all three worlds` : 'Journey funnel'}</h2>
          <Bars rows={r.funnel.map((f) => ({ label: f.stage, value: f.count, note: pct(f.count, pv) }))} accent="Opened all 3 worlds" />
        </section>
      </div>
      <div className="grid2">
        <section className="card">
          <h2>World opens</h2>
          <Bars rows={Object.entries(r.worlds).map(([k, v]) => ({ label: k, value: v }))} />
          <h2 style={{ marginTop: 8 }}>Station opens</h2>
          <Bars rows={r.stations.sort((a, b) => b.count - a.count).slice(0, 8).map((s) => ({ label: `${s.world} / ${s.station}`, value: s.count }))} />
        </section>
        <section className="card">
          <h2>Loading performance</h2>
          <div className="scroll">
            <table>
              <thead>
                <tr>
                  <th>Device</th>
                  <th>Metric</th>
                  <th>Samples</th>
                  <th>p50</th>
                  <th>p75</th>
                </tr>
              </thead>
              <tbody>
                {r.perf.map((p) => (
                  <tr key={`${p.deviceClass}${p.metric}`}>
                    <td>{p.deviceClass}</td>
                    <td>{p.metric === 'fcp' ? 'First paint' : 'ENTER → hub'}</td>
                    <td>{fmt(p.samples)}</td>
                    <td>{ms(p.p50)}</td>
                    <td style={{ color: p.metric === 'fcp' && ((p.p75 ?? 0) > 2500 || p.p75 === -1) ? '#F2B544' : undefined }}>{ms(p.p75)}</td>
                  </tr>
                ))}
                {!r.perf.length && (
                  <tr>
                    <td colSpan={5} className="muted">No performance samples yet.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <h2>Quality profiles</h2>
          <Bars rows={Object.entries(r.profiles).map(([k, v]) => ({ label: k, value: v }))} />
          <p className="small muted">
            Errors: no WebGL {fmt(n('webgl_unavailable'))} · context lost {fmt(n('context_lost'))} · asset errors {fmt(n('asset_error'))} · downgrades {fmt(n('quality_downgraded'))}
          </p>
        </section>
        <section className="card">
          <h2>Website clarity · {fb.total ? pct(fb.haa, fb.total) : '—'} said Haa</h2>
          <div style={{ display: 'flex', height: 28, borderRadius: 4, overflow: 'hidden', background: '#16264D' }} role="img" aria-label={`Haa ${fb.haa}, Qayb ahaan ${fb.qayb}, Maya ${fb.maya}`}>
            {(
              [
                ['Haa', fb.haa, '#2E8BFF'],
                ['Qayb ahaan', fb.qayb, '#7FB8FF'],
                ['Maya', fb.maya, '#5B6B82'],
              ] as const
            ).map(([label, v, c]) => (
              <div key={label} style={{ width: `${fb.total ? (v / fb.total) * 100 : 0}%`, background: c }} title={`${label}: ${v}`} />
            ))}
          </div>
          <p style={{ fontSize: 13, margin: 0 }}>
            Haa {fmt(fb.haa)} · Qayb ahaan {fmt(fb.qayb)} · Maya {fmt(fb.maya)} · {fmt(fb.comments)} comments
          </p>
          <p className="small muted" style={{ margin: 0 }}>
            n = {fmt(fb.total)} voluntary answers. Measures presentation clarity, not voting intent. Self-selected sample; never cross-filtered with any other data.
          </p>
        </section>
        <section className="card">
          <h2>Traffic source and devices</h2>
          <Bars rows={Object.entries(r.sources).map(([k, v]) => ({ label: k === 'direct' ? 'direct / link' : `QR: ${k}`, value: v }))} />
          <Bars rows={Object.entries(r.devices).map(([k, v]) => ({ label: k, value: v }))} />
        </section>
      </div>
      <section className="card">
        <h2>Operational alerts</h2>
        <div className="row" style={{ alignItems: 'stretch' }}>
          {r.alerts.map((a) => (
            <div key={a.title} className={`alert ${a.level}`}>
              <strong style={{ fontSize: 13 }}>{a.title}</strong>
              <span className="small muted">{a.detail}</span>
            </div>
          ))}
        </div>
      </section>
      <p className="small muted">Signed in as {me.user.email} ({me.user.role}). Totals only: no per-visitor view, no session replay, no raw export exists.</p>
    </>
  );
}

// ------------------------------------------------------------------ Feedback comments
function Feedback({ me }: { me: Me }) {
  const { data, error, reload } = useAsync(() => api<{ items: { id: string; day: string; answer: string; comment: string; reviewed: boolean }[] }>('/feedback/comments'), []);
  const mark = async (id: string) => {
    await api(`/feedback/comments/${id}/reviewed`, { method: 'POST', body: {} });
    reload();
  };
  return (
    <section className="card">
      <h1>Feedback comments</h1>
      <p className="small muted">Comments are scrubbed of numbers, emails and links before storage and deleted after the retention period. They are never linked to any other data.</p>
      {error && <p className="err">{error}</p>}
      <div className="scroll">
        <table>
          <thead>
            <tr>
              <th>Day</th>
              <th>Answer</th>
              <th>Comment</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {data?.items.map((c) => (
              <tr key={c.id}>
                <td>{c.day}</td>
                <td>{c.answer}</td>
                <td>{c.comment}</td>
                <td>{c.reviewed ? <span className="muted small">reviewed</span> : RANK[me.user.role] >= RANK.editor && <button className="btn" onClick={() => mark(c.id)}>Mark reviewed</button>}</td>
              </tr>
            ))}
            {data && !data.items.length && (
              <tr>
                <td colSpan={4} className="muted">No comments.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

// ------------------------------------------------------------------ Content
interface Version {
  version: number;
  status: string;
  note: string;
  createdAt: string;
  createdByEmail: string;
  publishedAt?: string;
  rollbackOf?: number;
}
function Issues({ issues }: { issues: ContentIssue[] }) {
  const errors = issues.filter((i) => i.severity === 'error');
  const warnings = issues.filter((i) => i.severity === 'warning');
  return (
    <div style={{ fontSize: 13 }}>
      {errors.length > 0 && (
        <ul className="err">
          {errors.map((i, k) => (
            <li key={k}>
              <code>{i.path}</code>: {i.message}
            </li>
          ))}
        </ul>
      )}
      <p className="muted">
        {errors.length} blocking · {warnings.length} placeholder / unverified warnings
      </p>
    </div>
  );
}

function Content({ me }: { me: Me }) {
  const list = useAsync(() => api<{ items: Version[] }>('/content'), []);
  const [selected, setSelected] = useState<{ version: number; status: string; content: unknown; issues: ContentIssue[] } | null>(null);
  const [draft, setDraft] = useState('');
  const [note, setNote] = useState('');
  const [result, setResult] = useState<{ ok: boolean; text: string; issues?: ContentIssue[] } | null>(null);
  const canEdit = RANK[me.user.role] >= RANK.editor;
  const canPublish = RANK[me.user.role] >= RANK.publisher;

  const open = async (v: number) => {
    const d = await api<{ version: number; status: string; content: unknown; issues: ContentIssue[] }>(`/content/${v}`);
    setSelected(d);
  };
  const startFrom = (c: unknown) => setDraft(JSON.stringify(c, null, 2));
  const save = async () => {
    setResult(null);
    let parsed: unknown;
    try {
      parsed = JSON.parse(draft);
    } catch {
      setResult({ ok: false, text: 'The draft is not valid JSON.' });
      return;
    }
    const schema = contentSchema.safeParse(parsed);
    if (!schema.success) {
      setResult({ ok: false, text: `Schema: ${schema.error.issues.slice(0, 3).map((i) => `${i.path.join('.')} ${i.message}`).join('; ')}` });
      return;
    }
    try {
      const r = await api<{ version: number; issues: ContentIssue[] }>('/content/drafts', { method: 'POST', body: { content: parsed, note } });
      setResult({ ok: true, text: `Draft v${r.version} saved. A different publisher must publish it.`, issues: r.issues });
      list.reload();
    } catch (e) {
      setResult({ ok: false, text: msg(e), issues: e instanceof ApiError ? (e.details as ContentIssue[]) : undefined });
    }
  };
  const act = async (path: string, label: string) => {
    try {
      const r = await api<{ version: number }>(path, { method: 'POST', body: {} });
      setResult({ ok: true, text: `${label}: now live as v${r.version}.` });
      list.reload();
    } catch (e) {
      setResult({ ok: false, text: msg(e), issues: e instanceof ApiError && Array.isArray(e.details) ? (e.details as ContentIssue[]) : undefined });
    }
  };

  return (
    <>
      <h1>Content</h1>
      <p className="small muted">
        Workflow: an editor saves a draft → a <strong>different</strong> publisher (with 2FA) publishes it → the public site loads the new snapshot within about a minute. Before
        post-election mode only “Proposed” and “Needs approval” statuses can be published, and unverified facts appear only as labelled placeholders.
      </p>
      {result && (
        <div className={`alert ${result.ok ? 'ok' : 'warning'}`}>
          <strong style={{ fontSize: 13 }}>{result.text}</strong>
          {result.issues && <Issues issues={result.issues} />}
        </div>
      )}
      <div className="grid2">
        <section className="card">
          <h2>Versions</h2>
          <div className="scroll">
            <table>
              <thead>
                <tr>
                  <th>v</th>
                  <th>Status</th>
                  <th>Note</th>
                  <th>By</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {list.data?.items.map((v) => (
                  <tr key={v.version}>
                    <td>{v.version}</td>
                    <td style={{ color: v.status === 'published' ? '#5BE3B8' : undefined }}>{v.status}</td>
                    <td>{v.note || (v.rollbackOf ? `rollback of v${v.rollbackOf}` : '')}</td>
                    <td className="small">{v.createdByEmail}</td>
                    <td className="row" style={{ gap: 6 }}>
                      <button className="btn" onClick={() => open(v.version)}>
                        View
                      </button>
                      {canPublish && v.status === 'draft' && (
                        <button className="btn primary" onClick={() => act(`/content/${v.version}/publish`, 'Published')}>
                          Publish
                        </button>
                      )}
                      {canPublish && v.status === 'superseded' && (
                        <button className="btn" onClick={() => act(`/content/${v.version}/rollback`, 'Rolled back')}>
                          Restore
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
                {list.data && !list.data.items.length && (
                  <tr>
                    <td colSpan={5} className="muted">Nothing published yet: the site shows the bundled placeholder content.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          {selected && (
            <div className="card" style={{ background: '#0A1230' }}>
              <div className="row between">
                <h2>
                  v{selected.version} · {selected.status}
                </h2>
                {canEdit && (
                  <button className="btn" onClick={() => startFrom(selected.content)}>
                    Use as new draft
                  </button>
                )}
              </div>
              <Issues issues={selected.issues} />
              <pre>{JSON.stringify(selected.content, null, 2)}</pre>
            </div>
          )}
        </section>
        {canEdit && (
          <section className="card">
            <h2>New draft</h2>
            <div className="row">
              <button className="btn" onClick={() => startFrom(defaultContent)}>
                Start from placeholder structure
              </button>
            </div>
            <label className="field">
              Content JSON (Somali and English)
              <textarea rows={18} value={draft} onChange={(e) => setDraft(e.target.value)} spellCheck={false} style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 12 }} />
            </label>
            <label className="field">
              Note for reviewers
              <input value={note} maxLength={300} onChange={(e) => setNote(e.target.value)} />
            </label>
            <button className="btn primary" onClick={save} disabled={!draft.trim()}>
              Validate and save draft
            </button>
          </section>
        )}
      </div>
    </>
  );
}

// ------------------------------------------------------------------ Users
function Users({ me }: { me: Me }) {
  const { data, error, reload } = useAsync(() => api<{ items: (User & { disabled: boolean; lastLoginAt?: string })[] }>('/users'), []);
  const [form, setForm] = useState({ email: '', role: 'viewer', initialPassword: '' });
  const [res, setRes] = useState('');
  const create = async (e: FormEvent) => {
    e.preventDefault();
    try {
      await api('/users', { method: 'POST', body: form });
      setRes(`Created ${form.email}. They must change the password at first sign-in.`);
      setForm({ email: '', role: 'viewer', initialPassword: '' });
      reload();
    } catch (err) {
      setRes(msg(err));
    }
  };
  const patch = async (id: string, body: object) => {
    try {
      await api(`/users/${id}`, { method: 'PATCH', body });
      reload();
    } catch (err) {
      setRes(msg(err));
    }
  };
  return (
    <>
      <h1>Admin users</h1>
      {error && <p className="err">{error}</p>}
      {res && <p className="small">{res}</p>}
      <section className="card scroll">
        <table>
          <thead>
            <tr>
              <th>Email</th>
              <th>Role</th>
              <th>2FA</th>
              <th>Last sign-in</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {data?.items.map((u) => (
              <tr key={u.id} style={{ opacity: u.disabled ? 0.5 : 1 }}>
                <td>{u.email}</td>
                <td>
                  <select aria-label={`Role for ${u.email}`} value={u.role} disabled={u.id === me.user.id} onChange={(e) => patch(u.id, { role: e.target.value })}>
                    {['viewer', 'editor', 'publisher', 'owner'].map((r) => (
                      <option key={r}>{r}</option>
                    ))}
                  </select>
                </td>
                <td>{u.totpEnabled ? 'on' : 'off'}</td>
                <td className="small">{u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleString() : '—'}</td>
                <td className="row" style={{ gap: 6 }}>
                  {u.id !== me.user.id && (
                    <button className="btn danger" onClick={() => patch(u.id, { disabled: !u.disabled })}>
                      {u.disabled ? 'Enable' : 'Disable'}
                    </button>
                  )}
                  {u.totpEnabled && u.id !== me.user.id && (
                    <button className="btn" onClick={() => patch(u.id, { resetTotp: true })}>
                      Reset 2FA
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      <form className="card" onSubmit={create} aria-label="Invite admin">
        <h2>Add an admin (keep the team small)</h2>
        <div className="grid">
          <label className="field">
            Email
            <input type="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          </label>
          <label className="field">
            Role
            <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
              {['viewer', 'editor', 'publisher', 'owner'].map((r) => (
                <option key={r}>{r}</option>
              ))}
            </select>
          </label>
          <label className="field">
            One-time initial password (≥ 12 chars)
            <input type="password" autoComplete="new-password" required minLength={12} value={form.initialPassword} onChange={(e) => setForm({ ...form, initialPassword: e.target.value })} />
          </label>
        </div>
        <button className="btn primary" type="submit">
          Create account
        </button>
      </form>
    </>
  );
}

// ------------------------------------------------------------------ Audit
function Audit() {
  const { data, error } = useAsync(() => api<{ items: { ts: string; actor: string | null; action: string; target: string | null; summary: string | null; ipPrefix: string }[] }>('/audit'), []);
  return (
    <section className="card">
      <h1>Audit log</h1>
      <p className="small muted">Append-only. Kept for one year. IP addresses are truncated.</p>
      {error && <p className="err">{error}</p>}
      <div className="scroll">
        <table>
          <thead>
            <tr>
              <th>Time</th>
              <th>Actor</th>
              <th>Action</th>
              <th>Target</th>
              <th>Detail</th>
            </tr>
          </thead>
          <tbody>
            {data?.items.map((a, i) => (
              <tr key={i}>
                <td className="small">{new Date(a.ts).toLocaleString()}</td>
                <td>{a.actor ?? '—'}</td>
                <td>
                  <code>{a.action}</code>
                </td>
                <td>{a.target ?? ''}</td>
                <td className="small muted">{a.summary ?? ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

// ------------------------------------------------------------------ Settings
interface SettingsT {
  postElectionMode: boolean;
  publishLock: boolean;
  containsDemoData: boolean;
  rawRetentionDays: number;
  hourlyRetentionDays: number;
  dailyRetentionDays: number;
  commentRetentionDays: number;
  updatedAt: string;
  updatedBy?: string;
}
function Settings({ me }: { me: Me }) {
  const { data, error, reload } = useAsync(() => api<{ settings: SettingsT }>('/settings'), []);
  const [res, setRes] = useState('');
  const owner = me.user.role === 'owner';
  const save = async (body: Partial<SettingsT>) => {
    try {
      await api('/settings', { method: 'PUT', body });
      setRes('Saved and recorded in the audit log.');
      reload();
    } catch (e) {
      setRes(msg(e));
    }
  };
  if (error) return <p className="err">{error}</p>;
  if (!data) return <p className="muted">Loading…</p>;
  const s = data.settings;
  const num = (k: keyof SettingsT, label: string, min: number, max: number) => (
    <label className="field">
      {label}
      <input type="number" min={min} max={max} defaultValue={s[k] as number} disabled={!owner} onBlur={(e) => Number(e.target.value) !== s[k] && save({ [k]: Number(e.target.value) })} />
    </label>
  );
  return (
    <>
      <h1>Settings and retention</h1>
      {res && <p className="small">{res}</p>}
      <section className="card">
        <h2>Publishing</h2>
        <label className="row">
          <input type="checkbox" checked={s.publishLock} disabled={!owner} onChange={(e) => save({ publishLock: e.target.checked })} /> Publish lock (campaign silence
          period)
        </label>
        <label className="row">
          <input
            type="checkbox"
            checked={s.postElectionMode}
            disabled={!owner}
            onChange={(e) => {
              if (e.target.checked && !window.confirm('Unlock post-election statuses (In progress, Completed, Not pursued)? Only do this after the election result.')) return;
              save({ postElectionMode: e.target.checked });
            }}
          />
          Post-election mode (allows In progress / Completed / Not pursued, each with evidence)
        </label>
      </section>
      <section className="card">
        <h2>Retention (days)</h2>
        <div className="grid">
          {num('rawRetentionDays', 'Raw events', 1, 30)}
          {num('hourlyRetentionDays', 'Hourly totals', 7, 180)}
          {num('dailyRetentionDays', 'Daily totals', 30, 730)}
          {num('commentRetentionDays', 'Feedback comments', 7, 180)}
        </div>
        <p className="small muted">
          Last changed {new Date(s.updatedAt).toLocaleString()} {s.updatedBy ? `by ${s.updatedBy}` : ''}. {s.containsDemoData ? 'This database contains DEMO DATA.' : ''}
        </p>
        {owner && (
          <button className="btn" onClick={async () => setRes(JSON.stringify(await api('/retention/run', { method: 'POST', body: {} })))}>
            Run retention now
          </button>
        )}
      </section>
    </>
  );
}

// ------------------------------------------------------------------ Account (password + 2FA)
function Account({ me, onChanged }: { me: Me; onChanged: () => void }) {
  const [pw, setPw] = useState({ current: '', next: '' });
  const [setup, setSetup] = useState<{ secret: string; otpauthUri: string } | null>(null);
  const [code, setCode] = useState('');
  const [res, setRes] = useState('');
  return (
    <>
      <h1>Your account</h1>
      {res && <p className="small" role="status">{res}</p>}
      {me.user.mustChangePassword && <p className="banner-demo">Change your one-time password before continuing.</p>}
      <form
        className="card"
        onSubmit={async (e) => {
          e.preventDefault();
          try {
            await api('/auth/password', { method: 'POST', body: pw });
            setRes('Password changed. Other sessions were signed out.');
            setPw({ current: '', next: '' });
            onChanged();
          } catch (err) {
            setRes(msg(err));
          }
        }}
      >
        <h2>Change password</h2>
        <label className="field">
          Current password
          <input type="password" autoComplete="current-password" value={pw.current} onChange={(e) => setPw({ ...pw, current: e.target.value })} required />
        </label>
        <label className="field">
          New password (≥ 12 characters, not common)
          <input type="password" autoComplete="new-password" value={pw.next} onChange={(e) => setPw({ ...pw, next: e.target.value })} required minLength={12} />
        </label>
        <button className="btn primary" type="submit">
          Change password
        </button>
      </form>
      <section className="card">
        <h2>Two-factor authentication</h2>
        {me.user.totpEnabled ? (
          <p className="small">On. {me.totpVerified ? 'This session is 2FA-verified.' : 'Sign in again with your code to use publisher actions.'}</p>
        ) : (
          <>
            <p className="small muted">Required for publishing, user management and settings. Add the secret to an authenticator app, then enter a code.</p>
            {!setup ? (
              <button className="btn" onClick={async () => setSetup(await api('/auth/totp/setup', { method: 'POST', body: {} }))}>
                Set up 2FA
              </button>
            ) : (
              <>
                <p className="small">
                  Secret: <code style={{ userSelect: 'all' }}>{setup.secret}</code>
                </p>
                <p className="small muted" style={{ wordBreak: 'break-all' }}>
                  {setup.otpauthUri}
                </p>
                <label className="field">
                  6-digit code
                  <input inputMode="numeric" pattern="\d{6}" value={code} onChange={(e) => setCode(e.target.value)} />
                </label>
                <button
                  className="btn primary"
                  onClick={async () => {
                    try {
                      await api('/auth/totp/enable', { method: 'POST', body: { code } });
                      setRes('Two-factor authentication is on.');
                      setSetup(null);
                      onChanged();
                    } catch (err) {
                      setRes(msg(err));
                    }
                  }}
                >
                  Confirm
                </button>
              </>
            )}
          </>
        )}
      </section>
    </>
  );
}

// ------------------------------------------------------------------ Shell
export function App() {
  const [me, setMe] = useState<Me | null>(null);
  const [checked, setChecked] = useState(false);
  const [section, setSection] = useState<Section>('overview');
  const loadMe = useCallback(async () => {
    try {
      const m = await api<Me>('/auth/me');
      setCsrf(m.csrfToken);
      setMe(m);
      if (m.user.mustChangePassword) setSection('account');
    } catch {
      setMe(null);
    } finally {
      setChecked(true);
    }
  }, []);
  useEffect(() => {
    void loadMe();
  }, [loadMe]);

  if (!checked) return <p className="wrap muted">Loading…</p>;
  if (!me)
    return (
      <Login
        onDone={(m) => {
          setCsrf(m.csrfToken);
          setMe(m);
          if (m.user.mustChangePassword) setSection('account');
        }}
      />
    );

  const rank = RANK[me.user.role];
  const items: { id: Section; label: string; min: number }[] = [
    { id: 'overview', label: 'Overview', min: 1 },
    { id: 'feedback', label: 'Feedback', min: 1 },
    { id: 'content', label: 'Content', min: 1 },
    { id: 'users', label: 'Users', min: 4 },
    { id: 'audit', label: 'Audit log', min: 4 },
    { id: 'settings', label: 'Settings', min: 1 },
    { id: 'account', label: 'Your account', min: 1 },
  ];
  const needs2fa = me.require2fa && rank >= RANK.publisher && !(me.user.totpEnabled && me.totpVerified);
  let body: ReactNode;
  if (me.user.mustChangePassword) body = <Account me={me} onChanged={loadMe} />;
  else if (section === 'overview') body = <Overview me={me} />;
  else if (section === 'feedback') body = <Feedback me={me} />;
  else if (section === 'content') body = <Content me={me} />;
  else if (section === 'users') body = <Users me={me} />;
  else if (section === 'audit') body = <Audit />;
  else if (section === 'settings') body = <Settings me={me} />;
  else body = <Account me={me} onChanged={loadMe} />;

  return (
    <div className="wrap">
      <header className="row between">
        <div className="row">
          <svg width="28" height="28" viewBox="0 0 120 120" aria-hidden="true">
            <polygon points="60,14 106,96 14,96" fill="none" stroke="#7FB8FF" strokeWidth="6" />
            <g stroke="#F2F6FF" strokeWidth="6">
              <line x1="60" y1="69" x2="60" y2="14" />
              <line x1="60" y1="69" x2="106" y2="96" />
              <line x1="60" y1="69" x2="14" y2="96" />
            </g>
            <circle cx="60" cy="69" r="11" fill="#F2F6FF" />
          </svg>
          <strong style={{ fontFamily: 'Space Grotesk, sans-serif', fontSize: 18 }}>Lattice Admin</strong>
        </div>
        <div className="row">
          <span className="small muted">
            {me.user.email} · {me.user.role} · 2FA {me.user.totpEnabled ? 'on' : 'off'}
          </span>
          <button
            className="btn"
            onClick={async () => {
              await api('/auth/logout', { method: 'POST', body: {} }).catch(() => undefined);
              setMe(null);
            }}
          >
            Sign out
          </button>
        </div>
      </header>
      {needs2fa && (
        <p className="alert warning small">Publisher and owner actions need two-factor authentication. Set it up under “Your account”, then sign in again with your code.</p>
      )}
      <div className="layout">
        <nav aria-label="Admin sections">
          {items
            .filter((i) => rank >= i.min)
            .map((i) => (
              <button key={i.id} className="navbtn" aria-current={section === i.id ? 'page' : undefined} onClick={() => setSection(i.id)}>
                {i.label}
              </button>
            ))}
        </nav>
        <main>{body}</main>
      </div>
    </div>
  );
}
