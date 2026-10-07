import { createHash } from 'node:crypto';
import { daysUntil, fieldLabels, refreshLease, type FieldKey, type LeaseField, type LeaseObligation, type LeaseRecord, type LeaseTerm } from './lease-data';

export type DocumentPage = { page: number; text: string };
export type ExtractedValue = { value: string | null; page: number | null; quote: string | null };
export type ExtractedLease = {
  fields: Record<FieldKey, ExtractedValue>;
  terms: { category: string; term: string; value: string; page: number; quote: string }[];
  obligations: { party: LeaseObligation['party']; obligation: string; frequency: string; deadline: string | null; page: number; quote: string }[];
  summary: string;
  pages: DocumentPage[];
};

const emptyValue = (): ExtractedValue => ({ value: null, page: null, quote: null });
const normalized = (text: string) => text.replace(/\s+/g, ' ').trim().toLowerCase();
const moneyValue = (value: string): number | null => {
  const match = value.match(/(?:\$|USD\s*)?([\d,]+(?:\.\d{1,2})?)/i);
  return match ? Number(match[1].replace(/,/g, '')) : null;
};
export function parseDate(value: string): string {
  const cleaned = value.replace(/(\d)(st|nd|rd|th)\b/gi, '$1').trim();
  const match = cleaned.match(/\b(\d{4}-\d{2}-\d{2}|\d{1,2}[/-]\d{1,2}[/-]\d{4}|(?:January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)\.?\s+\d{1,2},?\s+\d{4})\b/i);
  if (!match) return '';
  const raw = match[1];
  let year: number, month: number, day: number;
  if (/^\d{4}-/.test(raw)) [year, month, day] = raw.split('-').map(Number);
  else if (/^\d/.test(raw)) [month, day, year] = raw.split(/[/-]/).map(Number);
  else {
    const parts = raw.replace(/[.,]/g, '').split(/\s+/);
    month = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'].indexOf(parts[0].slice(0, 3).toLowerCase()) + 1;
    day = Number(parts[1]); year = Number(parts[2]);
  }
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day ? date.toISOString().slice(0, 10) : '';
}

const patterns: Partial<Record<FieldKey, RegExp[]>> = {
  siteId: [/\b(?:site|tower|lease)\s*(?:id|number|no\.?|#)\s*[:#-]?\s*([A-Z0-9][A-Z0-9_-]{2,})/i],
  property: [/(?:property address|premises address|site address|location|premises)\s*:\s*([^\n;]+)/i, /(?:located at|property located at)\s+([^\n;]+)/i],
  landlord: [/(?:landlord|lessor)\s*:\s*([^\n;]+)/i, /between\s+(.{2,160}?),?\s*\(?(?:"|“)?(?:landlord|lessor)(?:"|”)?\)?/i],
  tenant: [/(?:tenant|lessee)\s*:\s*([^\n;]+)/i, /\band\s+(.{2,160}?),?\s*\(?(?:"|“)?(?:tenant|lessee)(?:"|”)?\)?/i],
  leaseType: [/\b(Ground Lease|Rooftop Lease|Easement|Small Cell License|Tower Lease|Commercial Lease)\b/i],
  startDate: [/(?:commencement date|start date)\s*[:\-]?\s*([^\n;]+)/i, /(?:commences? on|commencing on|beginning on)\s+([^\n;]+)/i],
  expirationDate: [/(?:expiration date|expiry date|end date)\s*[:\-]?\s*([^\n;]+)/i, /(?:expires? on|expiring on|ending on)\s+([^\n;]+)/i],
  monthlyRent: [/(?:monthly (?:base )?rent|base monthly rent)\s*[:\-]?\s*(\$?\s*[\d,]+(?:\.\d{1,2})?)/i, /(?:rent[^\n$]{0,60})?(\$[\d,]+(?:\.\d{1,2})?)\s*(?:per month|\/\s*month|monthly)/i],
  escalation: [/(?:escalation(?: rate)?|annual (?:rent )?increase)\s*:\s*([^\n;]+)/i, /((?:\d+(?:\.\d+)?\s*%)[^\n;]{0,60}(?:annually|per year|each year))/i],
  renewal: [/(?:renewal options?|option periods?)\s*:\s*([^\n;]+)/i, /((?:\d+|one|two|three|four|five)\s+(?:additional\s+)?(?:\d+|five|ten)[- ]year\s+(?:renewal|extension)\s+(?:options?|periods?))/i],
  noticePeriod: [/(?:renewal notice(?: period)?|notice period)\s*:\s*([^\n;]+)/i, /(?:at least|not less than)\s+((?:\d+|one hundred eighty|one hundred twenty|ninety|sixty)\s+days)[^\n.]{0,90}(?:expir|renew|term)/i],
  securityDeposit: [/(?:security deposit|deposit amount)\s*[:\-]?\s*(\$?\s*[\d,]+(?:\.\d{1,2})?)/i],
  market: [/(?:market|city)\s*:\s*([^\n;]+)/i],
  state: [/\bstate\s*:\s*([A-Z]{2}|[A-Za-z ]+)/i],
  rentFrequency: [/(?:rent frequency|payment frequency)\s*:\s*([^\n;]+)/i],
};

export function extractTextLease(pages: DocumentPage[]): ExtractedLease {
  const fields = Object.fromEntries(Object.keys(fieldLabels).map((key) => [key, emptyValue()])) as ExtractedLease['fields'];
  for (const key of Object.keys(fieldLabels) as FieldKey[]) {
    for (const page of pages) {
      for (const pattern of patterns[key] || []) {
        const match = page.text.match(pattern);
        if (match) { fields[key] = { value: match[1].trim(), page: page.page, quote: match[0].trim() }; break; }
      }
      if (fields[key].value) break;
    }
  }
  // Annual base rent is converted only when the payment cadence is explicit.
  if (!fields.monthlyRent.value) for (const page of pages) {
    const annual = page.text.match(/(?:annual (?:base )?rent)\s*[:\-]?\s*(\$?\s*[\d,]+(?:\.\d{1,2})?)/i);
    if (annual) {
      fields.monthlyRent = { value: String((moneyValue(annual[1]) || 0) / 12), page: page.page, quote: annual[0] };
      fields.rentFrequency = { value: 'Annual base rent converted to monthly equivalent', page: page.page, quote: annual[0] };
      break;
    }
  }
  const terms: ExtractedLease['terms'] = [];
  const obligations: ExtractedLease['obligations'] = [];
  const categories = [ ['Insurance', /\binsurance|liability coverage/i], ['Access', /\baccess|ingress|egress/i],
    ['Maintenance', /\bmaintain|maintenance|repair/i], ['Restoration', /\brestore|restoration|remove improvements/i],
    ['Assignment', /\bassign|sublet|sublease/i], ['Termination', /\bterminat|default|cure period/i],
    ['Taxes', /\btaxes|tax obligations/i], ['Indemnification', /\bindemnif/i], ['Rent', /\brent|escalat/i] ] as const;
  for (const page of pages) {
    const sentences = page.text.split(/\n|(?<=[.;])\s+(?=[A-Z])/).map((line) => line.trim()).filter((line) => line.length > 20);
    for (const sentence of sentences) {
      const category = categories.find(([, pattern]) => pattern.test(sentence));
      if (!category) continue;
      const quote = sentence.slice(0, 1800);
      if (!terms.some((term) => term.quote === quote)) terms.push({ category: category[0], term: category[0], value: quote, page: page.page, quote });
      if (/\b(shall|must|is required to|agrees to)\b/i.test(sentence) && obligations.length < 60) {
        const party = /\b(tenant|lessee)\b/i.test(sentence) ? 'Tenant' : /\b(landlord|lessor)\b/i.test(sentence) ? 'Landlord' : 'Joint / Other';
        obligations.push({ party, obligation: quote, frequency: /annual|each year/i.test(sentence) ? 'Annual' : /monthly|each month/i.test(sentence) ? 'Monthly' : 'As stated in clause', deadline: null, page: page.page, quote });
      }
    }
  }
  return { fields, terms: terms.slice(0, 100), obligations, summary: '', pages: [] };
}

export function buildLeaseRecord(extracted: ExtractedLease, pages: DocumentPage[], fileName: string, buffer: Buffer, method: LeaseRecord['method'], pageCount = pages.length): LeaseRecord {
  const fields = {} as LeaseRecord['fields'];
  const warnings: string[] = [];
  const sourcePages = pages.some((page) => page.text.trim().length > 40) ? pages : extracted.pages.length ? extracted.pages : pages;
  const verified = (page: number | null, quote: string | null) => !!page && !!quote &&
    normalized(sourcePages.find((item) => item.page === page)?.text || '').includes(normalized(quote));
  for (const key of Object.keys(fieldLabels) as FieldKey[]) {
    const raw = extracted.fields[key] || emptyValue();
    const page = typeof raw.page === 'number' && raw.page >= 1 && raw.page <= pageCount ? raw.page : 0;
    const hasEvidence = verified(page, raw.quote);
    fields[key] = { value: raw.value?.trim() || 'Not found', page,
      section: page ? 'Extracted clause' : 'No source located', quote: raw.quote || undefined,
      confidence: !raw.value || !page || !hasEvidence ? 'Needs review' : method === 'Text extraction' ? 'High' : 'Medium' };
  }
  const value = (key: FieldKey) => fields[key].value === 'Not found' ? '' : fields[key].value;
  const startDate = parseDate(value('startDate'));
  const expirationDate = parseDate(value('expirationDate'));
  if (value('startDate') && !startDate) fields.startDate.confidence = 'Needs review';
  if (value('expirationDate') && !expirationDate) fields.expirationDate.confidence = 'Needs review';
  const monthlyRent = value('monthlyRent') ? moneyValue(value('monthlyRent')) : null;
  const escalationMatch = value('escalation').match(/(\d+(?:\.\d+)?)\s*%/);
  const escalationRate = escalationMatch ? Number(escalationMatch[1]) : null;
  const notice = value('noticePeriod').match(/(\d+)\s*days/i);
  const words = { 'one hundred eighty': 180, 'one hundred twenty': 120, ninety: 90, sixty: 60 };
  const noticeWord = Object.entries(words).find(([word]) => value('noticePeriod').toLowerCase().includes(word));
  const renewalNoticeDays = notice ? Number(notice[1]) : noticeWord?.[1] ?? null;
  const id = `LEASE-${createHash('sha256').update(buffer).digest('hex').slice(0, 16)}`;
  const terms: LeaseTerm[] = (extracted.terms || []).filter((term) => term.page >= 1 && term.page <= pageCount).map((term) => ({
    category: term.category, term: term.term, value: term.value,
    source: { page: term.page, section: term.category, quote: term.quote },
    confidence: verified(term.page, term.quote) ? method === 'Text extraction' ? 'High' : 'Medium' : 'Needs review',
  }));
  const obligations: LeaseObligation[] = (extracted.obligations || []).filter((item) => item.page >= 1 && item.page <= pageCount).map((item, index) => ({
    ...item, id: `${id}-OB-${index + 1}`, deadline: item.deadline ? parseDate(item.deadline) || null : null,
    section: 'Obligation clause', status: 'Open', risk: /insurance|indemnif|terminat|default/i.test(item.obligation) ? 'High' : 'Medium',
    owner: 'Unassigned', note: verified(item.page, item.quote) ? '' : 'Source wording needs verification.',
  }));
  const dates: LeaseRecord['dates'] = [];
  const addDate = (date: string, key: FieldKey, event: string, dateId: string) => {
    if (date) dates.push({ id: dateId, date, event, page: fields[key].page, section: fields[key].section,
      quote: fields[key].quote, status: 'Upcoming', daysRemaining: daysUntil(date) });
  };
  addDate(startDate, 'startDate', 'Lease commencement', 'commencement');
  addDate(expirationDate, 'expirationDate', 'Current term expiration', 'expiration');
  if (expirationDate && renewalNoticeDays !== null) {
    const date = new Date(`${expirationDate}T00:00:00Z`);
    date.setUTCDate(date.getUTCDate() - renewalNoticeDays);
    addDate(date.toISOString().slice(0, 10), 'noticePeriod', 'Renewal notice deadline', 'renewal-notice');
  }
  obligations.forEach((item) => { if (item.deadline) dates.push({ id: item.id, date: item.deadline,
    event: item.obligation, page: item.page, section: item.section, quote: item.quote,
    status: 'Upcoming', daysRemaining: daysUntil(item.deadline) }); });
  const missing = Object.values(fields).filter((field) => field.confidence === 'Needs review').length;
  const requiredMissing = (['landlord', 'tenant', 'property', 'startDate', 'expirationDate', 'monthlyRent'] as FieldKey[]).filter((key) => fields[key].confidence === 'Needs review');
  if (requiredMissing.length) warnings.push(`Verify required fields: ${requiredMissing.map((key) => fieldLabels[key]).join(', ')}.`);
  if (method === 'Text extraction') warnings.push('Text extraction recognizes explicit lease wording. Configure OPENAI_API_KEY for broader clause interpretation and scanned PDFs.');
  const renewal = dates.find((date) => date.id === 'renewal-notice');
  const risks = [
    { category: 'Documentation review', score: Math.round(missing / Object.keys(fields).length * 100), explanation: `${missing} of ${Object.keys(fields).length} extracted fields require source verification or are missing.` },
    { category: 'Deadline urgency', score: !expirationDate ? 100 : renewal && renewal.daysRemaining < 0 ? 100 : renewal && renewal.daysRemaining <= 90 ? 80 : daysUntil(expirationDate) <= 90 ? 80 : 10, explanation: !expirationDate ? 'Expiration could not be identified.' : renewal ? `Renewal notice deadline: ${renewal.date} (${renewal.daysRemaining} days from today).` : 'No renewal notice deadline could be calculated from the document.' },
    { category: 'Obligation ownership', score: obligations.length ? 100 : 0, explanation: `${obligations.length} extracted obligations need owner assignment.` },
  ];
  const riskScore = Math.round(risks[0].score * .5 + risks[1].score * .35 + risks[2].score * .15);
  return refreshLease({ id, siteId: value('siteId') || 'Not found', property: value('property') || fileName,
    market: value('market') || 'Not found', state: value('state') || 'Not found', landlord: value('landlord') || 'Not found',
    tenant: value('tenant') || 'Not found', leaseType: value('leaseType') || 'Not found', startDate, expirationDate,
    monthlyRent, escalationRate, renewalOptions: value('renewal') || 'Not found', renewalNoticeDays,
    securityDeposit: value('securityDeposit') ? moneyValue(value('securityDeposit')) : null,
    riskScore, status: 'Active', hasAmendment: /amendment|amended/i.test(sourcePages.map((page) => page.text).join(' ')),
    hasUncertainInfo: missing > 0, documentName: fileName,
    summary: extracted.summary || `${fileName}: ${value('leaseType') || 'lease document'} with ${terms.length} identified clauses and ${obligations.length} obligations. ${requiredMissing.length ? `${requiredMissing.length} core fields need review.` : 'Core fields were located in the document.'}`,
    fields, terms, dates, obligations, risks, pages: sourcePages, pageCount, method, analyzedAt: new Date().toISOString(), warnings });
}

const valueSchema = { type: 'object', properties: { value: { type: ['string', 'null'] }, page: { type: ['integer', 'null'] }, quote: { type: ['string', 'null'] } }, required: ['value', 'page', 'quote'], additionalProperties: false };
const termSchema = { type: 'object', properties: { category: { type: 'string' }, term: { type: 'string' }, value: { type: 'string' }, page: { type: 'integer' }, quote: { type: 'string' } }, required: ['category', 'term', 'value', 'page', 'quote'], additionalProperties: false };
export const leaseExtractionSchema = {
  type: 'object', properties: {
    fields: { type: 'object', properties: Object.fromEntries(Object.keys(fieldLabels).map((key) => [key, valueSchema])), required: Object.keys(fieldLabels), additionalProperties: false },
    summary: { type: 'string' },
    terms: { type: 'array', items: termSchema },
    obligations: { type: 'array', items: { type: 'object', properties: {
      party: { type: 'string', enum: ['Tenant', 'Landlord', 'Joint / Other'] }, obligation: { type: 'string' },
      frequency: { type: 'string' }, deadline: { type: ['string', 'null'] }, page: { type: 'integer' }, quote: { type: 'string' },
    }, required: ['party', 'obligation', 'frequency', 'deadline', 'page', 'quote'], additionalProperties: false } },
    pages: { type: 'array', items: { type: 'object', properties: { page: { type: 'integer' }, text: { type: 'string' } }, required: ['page', 'text'], additionalProperties: false } },
  }, required: ['fields', 'summary', 'terms', 'obligations', 'pages'], additionalProperties: false,
};
