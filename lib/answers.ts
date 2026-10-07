import { fieldLabels, type FieldKey, type LeaseRecord } from './lease-data';
import { calculateInvestmentScore } from './scoring';
import type { TowerSite, TowerSource } from './tower-data';
export type GroundedAnswer = { text: string; sources: string[] };
export function answerLease(question: string, lease: LeaseRecord): GroundedAnswer {
  const q = question.toLowerCase();
  let keys: FieldKey[] = [];
  if (/rent|payment/.test(q)) keys = ['monthlyRent', 'rentFrequency', 'escalation'];
  else if (/expir|end date/.test(q)) keys = ['expirationDate'];
  else if (/notice/.test(q)) keys = ['noticePeriod', 'expirationDate'];
  else if (/renew/.test(q)) keys = ['renewal', 'noticePeriod'];
  else if (/landlord|lessor/.test(q) && !/obligation/.test(q)) keys = ['landlord'];
  else if (/tenant|lessee/.test(q) && !/obligation/.test(q)) keys = ['tenant'];
  else if (/start|commenc/.test(q)) keys = ['startDate'];
  else if (/deposit/.test(q)) keys = ['securityDeposit'];
  if (keys.length) return {
    text: keys.map((key) => `${fieldLabels[key]}: ${lease.fields[key].value}.`).join('\n'),
    sources: keys.filter((key) => lease.fields[key].page).map((key) => `Page ${lease.fields[key].page}: ${lease.fields[key].quote || lease.fields[key].section}`),
  };
  if (/risk|attention/.test(q)) return { text: lease.risks.map((risk) => `${risk.category} (${risk.score}/100): ${risk.explanation}`).join('\n'), sources: ['Calculated from extracted fields, deadlines and obligation ownership.'] };
  if (/obligation|responsib|must|shall/.test(q)) {
    const party = /landlord|lessor/.test(q) ? 'Landlord' : /tenant|lessee/.test(q) ? 'Tenant' : '';
    const items = lease.obligations.filter((item) => !party || item.party === party);
    return { text: items.length ? items.map((item) => `${item.party}: ${item.obligation}`).join('\n') : 'No matching obligations were identified in this document.',
      sources: items.map((item) => `Page ${item.page}: ${item.quote || item.section}`) };
  }
  const words = q.match(/[a-z]{4,}/g)?.filter((word) => !['what', 'does', 'this', 'lease', 'about', 'with', 'have'].includes(word)) || [];
  const terms = lease.terms.filter((term) => words.some((word) => `${term.category} ${term.value}`.toLowerCase().includes(word))).slice(0, 6);
  return { text: terms.length ? terms.map((term) => `${term.category}: ${term.value}`).join('\n') : 'No matching information was found in the extracted clauses. Review the source PDF or configure AI for broader document questions.',
    sources: terms.map((term) => `Page ${term.source.page}: ${term.source.quote || term.source.section}`) };
}
export function answerTowers(question: string, sites: TowerSite[]): GroundedAnswer {
  if (!sites.length) return { text: 'Import a tower portfolio or connect a live feed to ask questions about your sites.', sources: [] };
  const q = question.toLowerCase();
  const site = sites.filter((item) => q.includes(item.id.toLowerCase())).sort((a, b) => b.id.length - a.id.length)[0];
  const stateTokens = new Set([...(question.match(/\b[A-Z]{2}\b/g) || []), ...Array.from(q.matchAll(/\b(?:in|state|for)\s+([a-z]{2})\b/g)).map((match) => match[1].toUpperCase())]);
  const states = sites.filter((item) => stateTokens.has(item.state.toUpperCase()));
  const filtered = site ? [site] : states.length ? states : sites;
  let ranked = [...filtered];
  let description = '';
  if (/risk|maintenance|critical/.test(q)) {
    ranked = ranked.filter((item) => item.riskScore !== null).sort((a, b) => (b.riskScore || 0) - (a.riskScore || 0));
    description = ranked.slice(0, 5).map((item) => `${item.id}: risk ${item.riskScore}/100, power utilization ${item.powerUtilization}%, open work orders ${item.openWorkOrders}. ${item.finding}`).join('\n');
  } else if (/future|ready|readiness/.test(q)) {
    ranked = ranked.filter((item) => item.futureReadinessScore !== null).sort((a, b) => (b.futureReadinessScore || 0) - (a.futureReadinessScore || 0));
    description = ranked.slice(0, 5).map((item) => `${item.id}: readiness ${item.futureReadinessScore}/100, fiber ${item.fiberAvailable ? 'available' : 'unavailable'}, backhaul ${item.backhaulCapacityGbps} Gbps.`).join('\n');
  } else if (/capacity|spare|tenant|colocat/.test(q)) {
    ranked = ranked.filter((item) => item.availableTenantPositions !== null).sort((a, b) => (b.availableTenantPositions || 0) - (a.availableTenantPositions || 0));
    description = ranked.slice(0, 5).map((item) => `${item.id}: ${item.availableTenantPositions} available positions; structural ${item.structuralUtilization ?? 'unknown'}%, power ${item.powerUtilization ?? 'unknown'}%.`).join('\n');
  } else if (/invest|prioriti|expan/.test(q)) {
    ranked = ranked.filter((item) => calculateInvestmentScore(item) !== null).sort((a, b) => (calculateInvestmentScore(b) || 0) - (calculateInvestmentScore(a) || 0));
    description = ranked.slice(0, 5).map((item) => `${item.id}: investment ${calculateInvestmentScore(item)}/100, expansion ${item.expansionScore}/100, ${item.availableTenantPositions} available positions, ${item.leaseYearsRemaining} lease years remaining.`).join('\n');
  } else if (/energy|efficien/.test(q)) {
    ranked = ranked.filter((item) => item.energyConsumption !== null).sort((a, b) => (b.energyConsumption || 0) - (a.energyConsumption || 0));
    description = ranked.slice(0, 5).map((item) => `${item.id}: ${item.energyConsumption} kWh/month; reported efficiency ${item.energyEfficiencyScore ?? 'unknown'}/100.`).join('\n');
  } else if (site) description = `${site.id}, ${site.siteName}, ${site.city}, ${site.state}. Coordinates: ${site.latitude}, ${site.longitude}. Type: ${site.towerType}. Address: ${site.address || 'not supplied'}. ASR: ${site.asrNumber || 'not supplied'}. Health: ${site.healthScore ?? 'unknown'}/100.`;
  else description = `${filtered.length.toLocaleString()} sites in the loaded ${states.length ? 'state-filtered ' : ''}portfolio across ${new Set(filtered.map((item) => item.state)).size} state/territory labels. ${filtered.filter((item) => item.healthScore === null).length.toLocaleString()} sites have no operational health inputs. Ask about a site ID, locations, investment, capacity, maintenance or energy.`;
  return { text: description || 'The requested metrics are missing from the supplied data. Import the relevant fields to calculate this assessment.', sources: ranked.slice(0, 5).map((item) => `${item.id}${item.updatedAt ? ` · telemetry timestamp ${item.updatedAt}` : item.sourceUpdatedAt ? ` · dataset edited ${item.sourceUpdatedAt}` : ' · imported portfolio snapshot'}${item.dataSource ? ` · ${item.dataSource}` : ''}`) };
}
export function towerQuestionContext(question: string, sites: TowerSite[], source?: TowerSource) {
  const answer = answerTowers(question, sites);
  const counts = (key: 'state' | 'towerType') => sites.reduce((result, site) => { result[site[key]] = (result[site[key]] || 0) + 1; return result; }, {} as Record<string, number>);
  const referenced = new Set(answer.sources.map((reference) => reference.split(' · ')[0]));
  const relevant = sites.filter((site) => referenced.has(site.id) || question.toLowerCase().includes(site.id.toLowerCase()));
  const contextSites = [...relevant, ...sites.filter((site) => !relevant.includes(site)).slice(0, Math.max(0, 50 - relevant.length))].slice(0, 50);
  return { sites: contextSites, portfolioContext: { answer, totalSites: sites.length, countsByState: counts('state'), countsByType: counts('towerType'), source } };
}
