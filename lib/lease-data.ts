export type Confidence = 'High' | 'Medium' | 'Needs review';
export type ObligationStatus = 'Open' | 'Upcoming' | 'Active' | 'Completed' | 'Overdue';
export type DateStatus = 'Upcoming' | 'Attention' | 'Completed' | 'Overdue';
export type SourceReference = { page: number; section: string; quote?: string };
export type LeaseField<T> = SourceReference & { value: T; confidence: Confidence };
export type LeaseTerm = { category: string; term: string; value: string; source: SourceReference; confidence: Confidence };
export type LeaseDate = SourceReference & { id: string; date: string; event: string; status: DateStatus; daysRemaining: number };
export type LeaseObligation = SourceReference & {
  id: string; party: 'Tenant' | 'Landlord' | 'Joint / Other'; obligation: string;
  frequency: string; deadline: string | null; status: ObligationStatus;
  risk: 'Low' | 'Medium' | 'High'; owner: string; note: string;
};
export type LeaseRisk = { category: string; score: number; explanation: string };
export const fieldLabels = {
  siteId: 'Site ID', property: 'Property / premises', landlord: 'Landlord', tenant: 'Tenant',
  leaseType: 'Lease type', startDate: 'Commencement date', expirationDate: 'Expiration date',
  monthlyRent: 'Base monthly rent', escalation: 'Rent escalation', renewal: 'Renewal options',
  noticePeriod: 'Renewal notice period', securityDeposit: 'Security deposit',
  market: 'Market / city', state: 'State', rentFrequency: 'Rent frequency',
} as const;
export type FieldKey = keyof typeof fieldLabels;
export type LeaseRecord = {
  id: string; siteId: string; property: string; market: string; state: string; landlord: string; tenant: string;
  leaseType: string; startDate: string; expirationDate: string; monthlyRent: number | null;
  escalationRate: number | null; renewalOptions: string; renewalNoticeDays: number | null;
  securityDeposit: number | null; riskScore: number; status: 'Active' | 'Renewal review' | 'Attention' | 'Expired';
  hasAmendment: boolean; hasUncertainInfo: boolean; documentName: string; summary: string;
  fields: Record<FieldKey, LeaseField<string>>; terms: LeaseTerm[]; dates: LeaseDate[];
  obligations: LeaseObligation[]; risks: LeaseRisk[]; pages: { page: number; text: string }[];
  pageCount: number; analyzedAt: string; method: 'Text extraction' | 'AI document analysis'; warnings: string[];
};
export const formatLeaseDate = (date: string) => {
  const value = new Date(`${date}T00:00:00Z`);
  return Number.isNaN(value.getTime()) ? 'Not found' : new Intl.DateTimeFormat('en-US', {
    month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC',
  }).format(value);
};
export const formatCurrency = (value: number | null) => value === null ? 'Not found' :
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 }).format(value);
export function daysUntil(date: string, now = new Date()): number {
  return Math.ceil((new Date(`${date}T00:00:00Z`).getTime() - Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())) / 86400000);
}
export function refreshLease(lease: LeaseRecord): LeaseRecord {
  const dates = lease.dates.map((item) => {
    const daysRemaining = daysUntil(item.date);
    const status: DateStatus = item.id === 'commencement' && daysRemaining <= 0 ? 'Completed' :
      daysRemaining < 0 ? 'Overdue' : daysRemaining <= 90 ? 'Attention' : 'Upcoming';
    return { ...item, daysRemaining, status };
  });
  const obligations = lease.obligations.map((item) => ({ ...item, status: item.status === 'Completed' ? item.status :
    item.deadline && daysUntil(item.deadline) < 0 ? 'Overdue' as const : item.status }));
  const documentation = lease.risks.find((risk) => risk.category === 'Documentation review');
  const notice = dates.find((date) => date.id === 'renewal-notice');
  const deadlineScore = !lease.expirationDate ? 100 : daysUntil(lease.expirationDate) < 0 || notice && notice.daysRemaining < 0 ? 100 :
    notice && notice.daysRemaining <= 90 || daysUntil(lease.expirationDate) <= 90 ? 80 : 10;
  const unassigned = obligations.filter((item) => item.status !== 'Completed' && item.owner === 'Unassigned').length;
  const obligationScore = obligations.length ? Math.round(unassigned / obligations.length * 100) : 0;
  const risks = lease.risks.map((risk) => risk.category === 'Deadline urgency' ? { ...risk, score: deadlineScore,
    explanation: !lease.expirationDate ? 'Expiration could not be identified.' : notice ? `Renewal notice deadline: ${notice.date} (${notice.daysRemaining} days from today).` : `Current term expiration: ${lease.expirationDate}. No renewal notice deadline could be identified.` } :
    risk.category === 'Obligation ownership' ? { ...risk, score: obligationScore, explanation: `${unassigned} of ${obligations.length} extracted obligations are open and unassigned.` } : risk);
  const riskScore = Math.round((documentation?.score ?? 100) * .5 + deadlineScore * .35 + obligationScore * .15);
  return { ...lease, dates, obligations, risks, riskScore, status: lease.expirationDate && daysUntil(lease.expirationDate) < 0 ? 'Expired' :
    dates.some((date) => date.id === 'renewal-notice' && date.daysRemaining <= 730) ? 'Renewal review' :
    lease.hasUncertainInfo ? 'Attention' : 'Active' };
}
