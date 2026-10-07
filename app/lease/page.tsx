'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { AlertCircle, ArrowRight, BarChart3, CalendarClock, Check, ChevronRight, ClipboardCheck, CloudUpload, Download, FileCheck2, FileText, FolderOpen, LayoutDashboard, MessageSquareText, Search, ShieldAlert, Upload, Users, X } from 'lucide-react';
import { analyzeLease, analysisStages, MAX_PDF_BYTES } from '../../lib/lease-analysis';
import { daysUntil, fieldLabels, formatCurrency, formatLeaseDate, refreshLease, type LeaseField, type LeaseObligation, type LeaseRecord, type SourceReference } from '../../lib/lease-data';
import { downloadJson, loadDocument, loadLeases, saveLease } from '../../lib/storage';
import IntelligenceAssistant from '../../components/intelligence-assistant';
import VerticalBridgeBrand from '../../components/vertical-bridge-brand';
import styles from './lease.module.css';

type Section = 'overview' | 'review' | 'dates' | 'obligations' | 'risk' | 'portfolio' | 'documents';
const navItems = [
  { id: 'overview', label: 'Overview', icon: LayoutDashboard }, { id: 'portfolio', label: 'Lease Portfolio', icon: BarChart3 },
  { id: 'review', label: 'Lease Review', icon: FileCheck2 }, { id: 'obligations', label: 'Obligations', icon: ClipboardCheck },
  { id: 'dates', label: 'Important Dates', icon: CalendarClock }, { id: 'risk', label: 'Risk', icon: ShieldAlert },
  { id: 'documents', label: 'Documents', icon: FolderOpen },
] as const;
const titles: Record<Section, string> = {
  overview: 'Turn lease documents into decisions.', portfolio: 'Visibility across your lease portfolio.',
  review: 'Source-backed lease intelligence.', obligations: 'Accountable lease operations.',
  dates: 'Track contractual deadlines.', risk: 'Understand where review is needed.', documents: 'Source documents and comparisons.',
};

export default function LeaseIntelligence() {
  const [records, setRecords] = useState<LeaseRecord[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [section, setSection] = useState<Section>('overview');
  const [selectedId, setSelectedId] = useState('');
  const [search, setSearch] = useState('');
  const [assistantOpen, setAssistantOpen] = useState(false);
  const [sourcePage, setSourcePage] = useState(1);
  const [error, setError] = useState('');
  const [clock, setClock] = useState(0);
  const recordsRef = useRef(records);
  const saveQueue = useRef(Promise.resolve());
  useEffect(() => { recordsRef.current = records; }, [records]);
  useEffect(() => {
    const reload = () => { void loadLeases().then((leases) => { setRecords(leases); setLoaded(true); }).catch((err) => { setError(err.message); setLoaded(true); }); };
    reload();
    const channel = new BroadcastChannel('vertical-bridge-leases');
    channel.onmessage = reload;
    const timer = setInterval(() => setClock(Date.now()), 60000);
    return () => { channel.close(); clearInterval(timer); };
  }, []);
  const portfolio = useMemo(() => records.map(refreshLease), [records, clock]);
  const selected = portfolio.find((lease) => lease.id === selectedId) || portfolio[0];
  const upload = () => document.getElementById('lease-upload')?.click();
  const notify = () => { const channel = new BroadcastChannel('vertical-bridge-leases'); channel.postMessage('updated'); channel.close(); };
  const openLease = (id: string) => { setSelectedId(id); setSection('review'); setSourcePage(1); };
  const updateObligation = async (id: string, changes: Partial<LeaseObligation>) => {
    if (!selected) return;
    const leaseId = selected.id;
    saveQueue.current = saveQueue.current.catch(() => {}).then(async () => {
      const original = recordsRef.current.find((lease) => lease.id === leaseId);
      if (!original) return;
      const updated = refreshLease({ ...original, obligations: original.obligations.map((item) => item.id === id ? { ...item, ...changes } : item) });
      await saveLease(updated);
      recordsRef.current = recordsRef.current.map((item) => item.id === updated.id ? updated : item);
      setRecords(recordsRef.current); notify();
    });
    try { await saveQueue.current; }
    catch (err) { setError(err instanceof Error ? err.message : 'Could not save the obligation.'); }
  };
  return <div className={styles.shell}>
    <aside className={styles.sidebar}>
      <VerticalBridgeBrand product="Lease Intelligence" />
      <div className={styles.workspace}>LEASE OPERATIONS</div>
      <nav className={styles.nav} aria-label="Lease navigation">{navItems.map((item) => <button key={item.id} className={`${styles.navItem} ${section === item.id ? styles.navActive : ''}`} onClick={() => setSection(item.id)}><item.icon size={16} /><span>{item.label}</span></button>)}</nav>
      <div className={styles.sidebarBottom}><div className={styles.demoNotice}><span className={styles.demoDot} /><div><strong>Document intelligence</strong><small>{portfolio.length} saved leases</small></div></div><div className={styles.sideFoot}><FolderOpen size={14} /> Records and source PDFs saved in this browser</div></div>
    </aside>
    <main className={styles.main}>
      <header className={styles.topbar}><div className={styles.breadcrumb}><span>Vertical Bridge</span><ChevronRight size={13} /><strong>Lease Intelligence</strong></div><div className={styles.topActions}><label className={styles.search}><Search size={15} /><input aria-label="Search leases" value={search} onChange={(event) => { setSearch(event.target.value); setSection('portfolio'); }} placeholder="Search leases, sites, parties" /></label><span className={styles.demoBadge}>DOCUMENT DATA</span><span className={styles.avatar}>VB</span></div></header>
      <div className={styles.content}>
        <div className={styles.pageHeader}><div><div className={styles.eyebrow}>{navItems.find((item) => item.id === section)?.label}</div><h1>{titles[section]}</h1><p>Extract and manage terms, dates and obligations from your lease PDFs.</p></div><div className={styles.headerButtons}><button className={styles.ghostButton} disabled={!selected} onClick={() => setAssistantOpen(true)}><MessageSquareText size={15} /> Ask Intelligence</button><button className={styles.primaryButton} onClick={upload}><Upload size={15} /> Upload Lease</button></div></div>
        {error && <div className="data-error" role="alert">{error}<button onClick={() => setError('')} aria-label="Dismiss error"><X size={14} /></button></div>}
        {!loaded ? <Panel title="Loading saved leases"><p>Opening your document portfolio…</p></Panel> : !selected ? <Panel title="Upload your first lease"><button className={styles.dropZone} onClick={upload} onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); const input = document.getElementById('lease-upload') as HTMLInputElement; input.files = event.dataTransfer.files; input.dispatchEvent(new Event('change', { bubbles: true })); }}><CloudUpload size={36} /><h2>Drop a lease PDF or choose a file</h2><p>Extract parties, premises, rent, escalation, renewal, dates and obligations with source references. Text PDFs work immediately. Scanned PDFs require server AI configuration.</p><span>PDF · up to 4 MB</span></button></Panel> : <>
          {section === 'overview' && <Overview leases={portfolio} selected={selected} onOpen={openLease} />}
          {section === 'portfolio' && <Portfolio leases={portfolio} query={search} onOpen={openLease} />}
          {section === 'review' && <Review lease={selected} page={sourcePage} setPage={setSourcePage} />}
          {section === 'dates' && <Dates lease={selected} />}
          {section === 'obligations' && <Obligations key={selected.id} lease={selected} onUpdate={updateObligation} />}
          {section === 'risk' && <Risk lease={selected} />}
          {section === 'documents' && <Documents leases={portfolio} lease={selected} onUpload={upload} onOpen={openLease} />}
        </>}
        {selected && section !== 'portfolio' && section !== 'overview' && <label className={styles.leaseSelector}>Selected document <select value={selected.id} onChange={(event) => { setSelectedId(event.target.value); setSourcePage(1); }}>{portfolio.map((lease) => <option key={lease.id} value={lease.id}>{lease.siteId} · {lease.documentName}</option>)}</select></label>}
      </div>
    </main>
    <UploadLease onComplete={(lease) => { setRecords((current) => [lease, ...current.filter((item) => item.id !== lease.id)]); openLease(lease.id); notify(); }} />
    {assistantOpen && selected && <IntelligenceAssistant key={selected.id} lease={selected} onClose={() => setAssistantOpen(false)} />}
  </div>;
}

function Overview({ leases, selected, onOpen }: { leases: LeaseRecord[]; selected: LeaseRecord; onOpen: (id: string) => void }) {
  const dates = leases.flatMap((lease) => lease.dates.filter((date) => date.status !== 'Completed').map((date) => ({ ...date, lease }))).sort((a, b) => a.daysRemaining - b.daysRemaining).slice(0, 5);
  const horizons = [0, 180, 365, 730];
  return <>
    <section className={styles.heroCard}><div><div className={styles.heroEyebrow}>SELECTED LEASE</div><h2>{selected.siteId} · {selected.property}</h2><p>{selected.summary}</p><div className={styles.heroMeta}><span><strong>Base monthly rent</strong>{formatCurrency(selected.monthlyRent)}</span><span><strong>Expiration</strong>{formatLeaseDate(selected.expirationDate)}</span><span><strong>Review score</strong>{selected.riskScore} / 100</span></div></div><button className={styles.heroAction} onClick={() => onOpen(selected.id)}>Open lease <ArrowRight size={15} /></button></section>
    <div className={styles.kpiGrid}>
      <Metric label="Total leases" value={leases.length} icon={BarChart3} /><Metric label="Expiring in 24 months" value={leases.filter((lease) => lease.expirationDate && daysUntil(lease.expirationDate) >= 0 && daysUntil(lease.expirationDate) <= 730).length} icon={CalendarClock} />
      <Metric label="Escalation identified" value={leases.filter((lease) => lease.fields.escalation.value !== 'Not found').length} icon={BarChart3} /><Metric label="Open obligations" value={leases.reduce((sum, lease) => sum + lease.obligations.filter((item) => item.status !== 'Completed').length, 0)} icon={ClipboardCheck} />
      <Metric label="High review scores" value={leases.filter((lease) => lease.riskScore >= 75).length} icon={ShieldAlert} /><Metric label="Fields need review" value={leases.filter((lease) => lease.hasUncertainInfo).length} icon={AlertCircle} />
    </div>
    <div className={styles.twoCol}><Panel title="Upcoming and overdue deadlines" subtitle="Calculated from uploaded documents">{dates.length ? dates.map((date) => <button className={styles.actionRow} key={`${date.lease.id}-${date.id}`} onClick={() => onOpen(date.lease.id)}><CalendarClock size={17} /><span><strong>{date.event}</strong><small>{date.lease.siteId} · {formatLeaseDate(date.date)} · {date.daysRemaining < 0 ? `${-date.daysRemaining} days overdue` : `${date.daysRemaining} days remaining`}</small></span><ChevronRight size={15} /></button>) : <p>No contractual deadlines identified.</p>}</Panel>
      <Panel title="Expiration horizon" subtitle="Based on the current date">{horizons.map((low, index) => { const high = horizons[index + 1] ?? Infinity; const count = leases.filter((lease) => lease.expirationDate && daysUntil(lease.expirationDate) >= low && daysUntil(lease.expirationDate) < high).length; return <div className={styles.horizonRow} key={low}><span>{['0–6 months', '6–12 months', '12–24 months', '24+ months'][index]}</span><div><i className={styles.horizonblue} style={{ width: `${count / leases.length * 100}%` }} /></div><b>{count}</b></div>; })}<p className={styles.summary}>{leases.filter((lease) => !lease.expirationDate).length} unknown expiration dates · {leases.filter((lease) => lease.status === 'Expired').length} expired leases</p></Panel></div>
  </>;
}

function Review({ lease, page, setPage }: { lease: LeaseRecord; page: number; setPage: (page: number) => void }) {
  const [url, setUrl] = useState('');
  const [showPdf, setShowPdf] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true, objectUrl = '';
    setUrl(''); setError('');
    void loadDocument(lease.id).then((blob) => { if (blob && active) { objectUrl = URL.createObjectURL(blob); setUrl(objectUrl); } }).catch((err) => { if (active) setError(err.message); });
    return () => { active = false; if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [lease.id]);
  const sourceText = lease.pages.find((item) => item.page === page)?.text;
  return <>
    <div className={styles.reviewToolbar}><div><FileText size={19} /><span><strong>{lease.documentName}</strong><small>{lease.pageCount} pages · {lease.method} · {new Date(lease.analyzedAt).toLocaleString()}</small></span></div><button className={styles.ghostButton} onClick={() => downloadJson(`${lease.documentName.replace(/\.pdf$/i, '')}_extracted.json`, lease)}><Download size={15} /> Export all fields</button></div>
    {lease.warnings.map((warning) => <div className={styles.noteBanner} key={warning}><AlertCircle size={16} />{warning}</div>)}
    <div className={styles.reviewGrid}>
      <div className={styles.documentPane}><div className={styles.docBar}><button className={styles.ghostButton} onClick={() => setShowPdf(!showPdf)}>{showPdf ? 'Extracted text' : 'Original PDF'}</button><span className={styles.pageControl}><button aria-label="Previous page" onClick={() => setPage(Math.max(1, page - 1))}>‹</button>Page {page} of {lease.pageCount}<button aria-label="Next page" onClick={() => setPage(Math.min(lease.pageCount, page + 1))}>›</button></span></div>{error && <p role="alert">{error}</p>}
        {showPdf && url ? <iframe key={`${lease.id}-${page}`} className={styles.pdfPreview} src={`${url}#page=${page}`} title={`Source PDF page ${page}`} /> : <div className={styles.realDocumentText}><h3>Page {page}</h3><pre>{sourceText || 'No text was available for this page. Open the original PDF to review the source.'}</pre></div>}
        {url && <a className={styles.pdfLink} href={url} target="_blank" rel="noreferrer">Open original PDF in a new tab</a>}
      </div>
      <div className={styles.insightPane}><div className={styles.panelTitle}><div><div className={styles.eyebrow}>EXTRACTED INTELLIGENCE</div><h2>All required fields</h2></div></div><p className={styles.summary}>{lease.summary}</p><div className={styles.fieldGrid}>{Object.entries(lease.fields).map(([key, field]) => <button className={styles.fieldCard} key={key} onClick={() => field.page && setPage(field.page)}><span>{fieldLabels[key as keyof typeof fieldLabels]}</span><strong>{field.value}</strong><Source source={field} /><Confidence field={field} />{field.quote && <small className={styles.fieldQuote}>“{field.quote}”</small>}</button>)}</div></div>
    </div>
    <Panel title="Extracted lease terms" subtitle="Click a source reference to review the original page">{lease.terms.length ? lease.terms.map((term, index) => <div className={styles.termRow} key={index}><b>{term.category} · {term.term}</b><p>{term.value}</p><button className={styles.textLink} onClick={() => setPage(term.source.page)}><Source source={term.source} /></button><em>{term.confidence}</em></div>) : <p>No additional clauses were identified.</p>}</Panel>
  </>;
}

function Dates({ lease }: { lease: LeaseRecord }) {
  const [filter, setFilter] = useState('all');
  const dates = lease.dates.filter((item) => filter === 'all' || filter === '90' && item.daysRemaining >= 0 && item.daysRemaining <= 90 || filter === 'overdue' && item.status === 'Overdue');
  return <Panel title={`Important dates · ${lease.siteId}`} subtitle="Deadlines update against today's date"><div className={styles.filterBar}><div>{['all', '90', 'overdue'].map((value) => <button key={value} className={filter === value ? styles.filterActive : ''} onClick={() => setFilter(value)}>{value === 'all' ? 'All dates' : value === '90' ? 'Next 90 days' : 'Overdue'}</button>)}</div></div><div className={styles.dateTable}><div className={styles.dateHead}><span>Event</span><span>Date</span><span>Source</span><span>Days remaining</span><span>Status</span></div>{dates.map((item) => <div className={styles.dateRow} key={item.id}><strong>{item.event}</strong><b>{formatLeaseDate(item.date)}</b><Source source={item} /><b>{item.status === 'Completed' ? 'Completed' : item.daysRemaining < 0 ? `${-item.daysRemaining} days overdue` : `${item.daysRemaining} days`}</b><Status status={item.status} /></div>)}</div>{!dates.length && <p>No matching dates found.</p>}</Panel>;
}

function Obligations({ lease, onUpdate }: { lease: LeaseRecord; onUpdate: (id: string, changes: Partial<LeaseObligation>) => Promise<void> }) {
  return <><div className={styles.obligationSummary}><Metric label="Open obligations" value={lease.obligations.filter((item) => item.status !== 'Completed').length} icon={ClipboardCheck} /><Metric label="Overdue obligations" value={lease.obligations.filter((item) => item.status === 'Overdue').length} icon={ShieldAlert} /><Metric label="Assigned owners" value={lease.obligations.filter((item) => item.owner !== 'Unassigned').length} icon={Users} /></div>
    {(['Tenant', 'Landlord', 'Joint / Other'] as const).map((party) => <Panel key={party} title={`${party} obligations`}>{lease.obligations.filter((item) => item.party === party).map((item) => <div className={styles.obligationCard} key={item.id}><div className={`${styles.obligationCheck} ${item.status === 'Completed' ? styles.completed : ''}`}><button aria-label={`Toggle completion: ${item.obligation}`} onClick={() => void onUpdate(item.id, { status: item.status === 'Completed' ? 'Open' : 'Completed' })}>{item.status === 'Completed' && <Check size={14} />}</button></div><div className={styles.obligationMain}><Status status={item.status} /><h3>{item.obligation}</h3><div className={styles.obligationMeta}><span><strong>Frequency</strong>{item.frequency}</span><span><strong>Due</strong>{item.deadline ? formatLeaseDate(item.deadline) : 'No explicit date'}</span><Source source={item} /></div><label className={styles.ownerLabel}>Owner<input key={`${item.id}-${item.owner}`} defaultValue={item.owner === 'Unassigned' ? '' : item.owner} placeholder="Assign a person or team" onBlur={(event) => { const owner = event.target.value.trim() || 'Unassigned'; if (owner !== item.owner) void onUpdate(item.id, { owner }); }} /></label>{item.note && <p>{item.note}</p>}</div></div>)}{!lease.obligations.some((item) => item.party === party) && <p>No obligations identified for this party.</p>}</Panel>)}</>;
}

function Risk({ lease }: { lease: LeaseRecord }) {
  return <><section className={styles.riskHero}><div className={styles.riskScoreRing}><strong>{lease.riskScore}</strong><span>/100</span></div><div><div className={styles.eyebrow}>REVIEW PRIORITY SCORE</div><h2>{lease.riskScore >= 75 ? 'High-priority review' : lease.riskScore >= 50 ? 'Review recommended' : 'Lower review priority'}</h2><p>Calculated from documentation completeness (50%), deadline urgency (35%) and unassigned obligations (15%). This score measures workflow review needs.</p></div></section><div className={styles.riskGrid}>{lease.risks.map((risk) => <div className={styles.riskCard} key={risk.category}><div className={styles.riskCardTop}><span>{risk.category}</span><strong>{risk.score}</strong></div><div className={styles.riskBar}><i className={styles.barmedium} style={{ width: `${risk.score}%` }} /></div><p>{risk.explanation}</p></div>)}</div><Panel title="Fields requiring review">{Object.entries(lease.fields).filter(([, field]) => field.confidence === 'Needs review').map(([key, field]) => <div className={styles.termRow} key={key}><b>{fieldLabels[key as keyof typeof fieldLabels]}</b><p>{field.value}</p><Source source={field} /></div>)}</Panel></>;
}

function Portfolio({ leases, query, onOpen }: { leases: LeaseRecord[]; query: string; onOpen: (id: string) => void }) {
  const [filter, setFilter] = useState('All leases');
  const filtered = leases.filter((lease) => `${lease.siteId} ${lease.documentName} ${lease.property} ${lease.market} ${lease.landlord} ${lease.tenant} ${lease.terms.map((term) => term.value).join(' ')}`.toLowerCase().includes(query.toLowerCase()) && (filter === 'All leases' || filter === 'Needs review' && lease.hasUncertainInfo || filter === 'Renewal review' && lease.status === 'Renewal review'));
  return <Panel title="Lease portfolio" subtitle={`${filtered.length} of ${leases.length} uploaded documents`} action={<select value={filter} onChange={(event) => setFilter(event.target.value)}><option>All leases</option><option>Needs review</option><option>Renewal review</option></select>}><div className={styles.portfolioTable}><div className={styles.portfolioHead}><span>Lease / site</span><span>Property</span><span>Expiration</span><span>Base rent / mo</span><span>Review</span><span>Open items</span><span>Status</span></div>{filtered.map((lease) => <button className={styles.portfolioRow} key={lease.id} onClick={() => onOpen(lease.id)}><span><strong>{lease.siteId}</strong><small>{lease.documentName}</small></span><span>{lease.property}</span><b>{formatLeaseDate(lease.expirationDate)}</b><b>{formatCurrency(lease.monthlyRent)}</b><strong>{lease.riskScore}</strong><span>{lease.obligations.filter((item) => item.status !== 'Completed').length}</span><Status status={lease.status} /></button>)}</div>{!filtered.length && <p>No documents match this search.</p>}</Panel>;
}

function Documents({ leases, lease, onUpload, onOpen }: { leases: LeaseRecord[]; lease: LeaseRecord; onUpload: () => void; onOpen: (id: string) => void }) {
  const [compareId, setCompareId] = useState('');
  const previous = leases.find((item) => item.id === compareId && item.id !== lease.id);
  const changes = previous ? Object.entries(lease.fields).filter(([key, field]) => field.value !== previous.fields[key as keyof typeof fieldLabels].value) : [];
  return <><div className={styles.documentGrid}>{leases.map((record) => <button className={styles.documentCard} key={record.id} onClick={() => onOpen(record.id)}><FileText size={20} /><div><span>{record.siteId}</span><strong>{record.documentName}</strong><small>{record.pageCount} pages · {record.method}</small></div><ChevronRight size={16} /></button>)}<button className={styles.addDocument} onClick={onUpload}><CloudUpload size={24} /><strong>Add a lease or amendment</strong><span>Analyze the actual PDF and retain its source.</span></button></div>
    <Panel title="Compare extracted documents" subtitle={`Current document: ${lease.documentName}`}><label className={styles.leaseSelector}>Compare against<select value={previous?.id || ''} onChange={(event) => setCompareId(event.target.value)}><option value="">Choose another uploaded document</option>{leases.filter((item) => item.id !== lease.id).map((item) => <option key={item.id} value={item.id}>{item.documentName}</option>)}</select></label>{previous && <><p>Comparison shows field differences between the selected documents; amendment values are not automatically merged into the base lease.</p>{changes.map(([key, field]) => <div className={styles.termRow} key={key}><b>{fieldLabels[key as keyof typeof fieldLabels]}</b><p>{previous.fields[key as keyof typeof fieldLabels].value} → {field.value}</p><Source source={field} /></div>)}{!changes.length && <p>No differences in extracted fields.</p>}</>}</Panel></>;
}

function UploadLease({ onComplete }: { onComplete: (lease: LeaseRecord) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const controller = useRef<AbortController | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [step, setStep] = useState(-1);
  const [error, setError] = useState('');
  const [open, setOpen] = useState(false);
  useEffect(() => () => controller.current?.abort(), []);
  const choose = async (candidate: File) => {
    controller.current?.abort();
    const abort = new AbortController(); controller.current = abort;
    setOpen(true); setFile(candidate); setError(''); setStep(0);
    try {
      if (!candidate.name.toLowerCase().endsWith('.pdf')) throw new Error('Please choose a PDF file.');
      if (candidate.size > MAX_PDF_BYTES) throw new Error('Please choose a PDF that is 4 MB or smaller.');
      let lease = await analyzeLease(candidate, setStep, abort.signal);
      if (abort.signal.aborted) return;
      const existing = (await loadLeases()).find((record) => record.id === lease.id);
      if (existing) lease = refreshLease({ ...lease, obligations: lease.obligations.map((item) => {
        const saved = existing.obligations.find((previous) => previous.obligation === item.obligation);
        return saved ? { ...item, owner: saved.owner, status: saved.status } : item;
      }) });
      setStep(4); await saveLease(lease, candidate);
      setOpen(false); onComplete(lease);
    } catch (err) { if (!abort.signal.aborted) setError(err instanceof Error ? err.message : 'Lease analysis failed.'); }
  };
  return <><input ref={input} id="lease-upload" className={styles.hiddenInput} type="file" accept="application/pdf,.pdf" onChange={(event) => { const candidate = event.target.files?.[0]; if (candidate) void choose(candidate); event.target.value = ''; }} />
    {open && <div className={styles.modalBackdrop}><div className={styles.uploadModal} role="dialog" aria-modal="true" aria-label="Lease upload"><button className={styles.modalClose} disabled={step === 4 && !error} aria-label="Cancel upload" onClick={() => { controller.current?.abort(); setOpen(false); }}><X size={17} /></button><div className={styles.modalIcon}>{error ? <AlertCircle size={24} /> : <CloudUpload size={24} />}</div><div className={styles.eyebrow}>{error ? 'ANALYSIS NEEDS ATTENTION' : 'DOCUMENT PROCESSING'}</div><h2>{error ? 'Could not analyze this PDF' : 'Analyzing your lease'}</h2><p>{file?.name} · {((file?.size || 0) / 1024 / 1024).toFixed(2)} MB</p>
      {error ? <><p className="data-error" role="alert">{error}</p><button className={styles.primaryButton} onClick={() => input.current?.click()}>Choose another file</button></> : <><div className={styles.progressTrack}><i style={{ width: `${(step + 1) / analysisStages.length * 100}%` }} /></div><div className={styles.stageList} aria-live="polite">{analysisStages.map((stage, index) => <div key={stage} className={index < step ? styles.stageDone : index === step ? styles.stageCurrent : ''}><span>{index < step ? <Check size={12} /> : index + 1}</span>{stage}{index < step && <small>Complete</small>}</div>)}</div></>}
    </div></div>}
  </>;
}

function Panel({ title, subtitle, children, action }: { title: string; subtitle?: string; children: React.ReactNode; action?: React.ReactNode }) { return <section className={styles.panel}><div className={styles.panelHeader}><div><h2>{title}</h2>{subtitle && <span>{subtitle}</span>}</div>{action}</div>{children}</section>; }
function Metric({ label, value, icon: Icon }: { label: string; value: number; icon: typeof BarChart3 }) { return <div className={styles.metric}><span className={styles.metricIcon}><Icon size={17} /></span><span className={styles.metricLabel}>{label}</span><strong>{value}</strong><small>Uploaded document portfolio</small></div>; }
function Source({ source }: { source: SourceReference }) { return <span className={styles.source}><FileText size={11} />{source.page ? `Page ${source.page} · ${source.section}` : 'No source located'}</span>; }
function Confidence({ field }: { field: LeaseField<string> }) { return <em className={`${styles.confidence} ${field.confidence === 'High' ? styles.confidencehigh : field.confidence === 'Medium' ? styles.confidencemedium : styles.confidencereview}`}>{field.confidence}</em>; }
function Status({ status }: { status: string }) { return <em className={`${styles.status} ${styles[`status${status.toLowerCase().replace(/[^a-z]/g, '')}`]}`}>{status}</em>; }
