import { calculateExpansionScore, calculateFutureReadinessScore, calculateHealthScore, calculateMaintenanceRisk } from './scoring';

export type TowerSite = {
  id: string; siteName: string; city: string; state: string; region: string; latitude: number; longitude: number;
  towerType: string; height: number | null; yearBuilt: number | null; ownershipType: string;
  tenants: number | null; maxTenants: number | null; availableTenantPositions: number | null;
  structuralUtilization: number | null; powerCapacityKw: number | null; powerUtilization: number | null;
  peakPowerUtilization: number | null; batteryBackupHours: number | null; generatorAvailable: boolean | null;
  fiberAvailable: boolean | null; backhaulCapacityGbps: number | null; latencyMs: number | null;
  leaseYearsRemaining: number | null; monthlyRevenue: number | null; annualRevenue: number | null;
  potentialRevenue: number | null; maintenanceRisk: 'Low' | 'Medium' | 'High' | 'Unknown';
  energyConsumption: number | null; energyEfficiencyScore: number | null;
  expansionScore: number | null; futureReadinessScore: number | null; healthScore: number | null;
  status: 'Healthy' | 'Attention' | 'Critical' | 'Expansion Opportunity' | 'Needs data';
  equipmentSpace: string; networkDemand: string; lastInspection: string; openWorkOrders: number | null;
  riskType: string; riskScore: number | null; finding: string; recommendation: string; updatedAt: string;
  address: string; asrNumber: string; dataSource: string; sourceUrl: string; sourceUpdatedAt: string;
  sourceProperties: Record<string, string | number | boolean | null>;
};
export type TowerSource = { name: string; format: string; importedAt: string; url?: string; updatedAt?: string; warning?: string; publisher?: string; count?: number; skipped?: number };
export type TowerPortfolio = { sites: TowerSite[]; source: TowerSource };
export const MAX_TOWERS = 50000;
export const towerColumns = ['id', 'siteName', 'city', 'state', 'region', 'latitude', 'longitude', 'towerType', 'height', 'yearBuilt', 'ownershipType', 'tenants', 'maxTenants', 'structuralUtilization', 'powerCapacityKw', 'powerUtilization', 'peakPowerUtilization', 'batteryBackupHours', 'generatorAvailable', 'fiberAvailable', 'backhaulCapacityGbps', 'latencyMs', 'leaseYearsRemaining', 'monthlyRevenue', 'potentialRevenue', 'energyConsumption', 'energyEfficiencyScore', 'equipmentSpace', 'networkDemand', 'lastInspection', 'openWorkOrders', 'riskType', 'finding', 'recommendation', 'updatedAt'];

export function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let row: string[] = [], value = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const character = text[i];
    if (character === '"') {
      if (quoted && text[i + 1] === '"') { value += '"'; i++; }
      else quoted = !quoted;
    } else if (character === ',' && !quoted) { row.push(value); value = ''; }
    else if ((character === '\n' || character === '\r') && !quoted) {
      if (character === '\r' && text[i + 1] === '\n') i++;
      row.push(value); if (row.some((cell) => cell.trim())) rows.push(row); row = []; value = '';
    } else value += character;
  }
  if (quoted) throw new Error('CSV contains an unclosed quoted value.');
  row.push(value); if (row.some((cell) => cell.trim())) rows.push(row);
  const headers = rows.shift()?.map((header) => header.replace(/^\uFEFF/, '').trim()) || [];
  if (new Set(headers).size !== headers.length) throw new Error('CSV contains duplicate column names.');
  return rows.map((cells, index) => {
    if (cells.length !== headers.length) throw new Error(`CSV row ${index + 2} has ${cells.length} values; expected ${headers.length}.`);
    return Object.fromEntries(headers.map((header, i) => [header, cells[i].trim()]));
  });
}

export function normalizeTowers(input: unknown): TowerSite[] {
  const rows = Array.isArray(input) ? input : input && typeof input === 'object' && 'sites' in input ? (input as { sites: unknown }).sites : null;
  if (!Array.isArray(rows)) throw new Error('Provide a JSON array of sites or an object with a sites array.');
  if (rows.length > MAX_TOWERS) throw new Error(`A portfolio can contain up to ${MAX_TOWERS.toLocaleString()} sites.`);
  const ids = new Set<string>();
  return rows.map((raw, index) => {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error(`Site ${index + 1} must be an object.`);
    const data = raw as Record<string, unknown>;
    const str = (key: string) => data[key] == null ? '' : String(data[key]).trim();
    const id = str('id');
    if (!id || ids.has(id)) throw new Error(`Site ${index + 1}: ${id ? `duplicate ID ${id}` : 'id is required'}.`);
    ids.add(id);
    const num = (key: string, min = 0, max = Number.MAX_SAFE_INTEGER) => {
      if (data[key] == null || typeof data[key] === 'string' && !data[key].trim()) return null;
      if (typeof data[key] !== 'string' && typeof data[key] !== 'number') throw new Error(`${id}: ${key} must be numeric.`);
      const value = Number(data[key]);
      if (!Number.isFinite(value) || value < min || value > max) throw new Error(`${id}: ${key} must be between ${min} and ${max}.`);
      return value;
    };
    const bool = (key: string) => {
      if (data[key] == null || typeof data[key] === 'string' && !data[key].trim()) return null;
      if (data[key] === true || data[key] === 1 || /^(true|yes|1)$/i.test(String(data[key]))) return true;
      if (data[key] === false || data[key] === 0 || /^(false|no|0)$/i.test(String(data[key]))) return false;
      throw new Error(`${id}: ${key} must be true or false.`);
    };
    const latitude = num('latitude', -90, 90), longitude = num('longitude', -180, 180);
    if (latitude === null || longitude === null) throw new Error(`${id}: latitude and longitude are required.`);
    const tenants = num('tenants'), maxTenants = num('maxTenants');
    if ([tenants, maxTenants].some((n) => n !== null && !Number.isInteger(n))) throw new Error(`${id}: tenant counts must be whole numbers.`);
    if (tenants !== null && maxTenants !== null && tenants > maxTenants) throw new Error(`${id}: tenants exceeds maxTenants.`);
    const monthlyRevenue = num('monthlyRevenue');
    const updatedAt = str('updatedAt');
    if (updatedAt && Number.isNaN(Date.parse(updatedAt))) throw new Error(`${id}: updatedAt must be a valid timestamp.`);
    const site: TowerSite = {
      id, latitude, longitude, siteName: str('siteName') || id, city: str('city') || 'Unknown', state: str('state') || 'Unknown', region: str('region') || 'Unknown',
      towerType: str('towerType') || 'Unknown', height: num('height'), yearBuilt: num('yearBuilt', 1800, 2200), ownershipType: str('ownershipType') || 'Unknown',
      tenants, maxTenants, availableTenantPositions: tenants !== null && maxTenants !== null ? maxTenants - tenants : null,
      structuralUtilization: num('structuralUtilization', 0, 100), powerCapacityKw: num('powerCapacityKw'), powerUtilization: num('powerUtilization', 0, 100),
      peakPowerUtilization: num('peakPowerUtilization', 0, 100), batteryBackupHours: num('batteryBackupHours'), generatorAvailable: bool('generatorAvailable'),
      fiberAvailable: bool('fiberAvailable'), backhaulCapacityGbps: num('backhaulCapacityGbps'), latencyMs: num('latencyMs'),
      leaseYearsRemaining: num('leaseYearsRemaining'), monthlyRevenue, annualRevenue: monthlyRevenue === null ? null : monthlyRevenue * 12,
      potentialRevenue: num('potentialRevenue'), maintenanceRisk: 'Unknown', energyConsumption: num('energyConsumption'), energyEfficiencyScore: num('energyEfficiencyScore', 0, 100),
      expansionScore: null, futureReadinessScore: null, healthScore: null, status: 'Needs data', equipmentSpace: str('equipmentSpace') || 'Unknown',
      networkDemand: str('networkDemand') || 'Unknown', lastInspection: str('lastInspection'), openWorkOrders: num('openWorkOrders'),
      riskType: str('riskType') || 'Unclassified', riskScore: null, finding: str('finding'), recommendation: str('recommendation'), updatedAt,
      address: str('address'), asrNumber: str('asrNumber'), dataSource: str('dataSource'), sourceUrl: str('sourceUrl'), sourceUpdatedAt: str('sourceUpdatedAt'),
      sourceProperties: data.sourceProperties && typeof data.sourceProperties === 'object' && !Array.isArray(data.sourceProperties) ?
        Object.fromEntries(Object.entries(data.sourceProperties).filter(([, value]) => value === null || ['string', 'number', 'boolean'].includes(typeof value))) : {},
    };
    site.healthScore = calculateHealthScore(site);
    site.expansionScore = calculateExpansionScore(site);
    site.futureReadinessScore = calculateFutureReadinessScore(site);
    site.riskScore = calculateMaintenanceRisk(site);
    site.maintenanceRisk = site.riskScore === null ? 'Unknown' : site.riskScore >= 50 ? 'High' : site.riskScore >= 25 ? 'Medium' : 'Low';
    site.status = site.healthScore === null ? 'Needs data' : site.healthScore < 50 ? 'Critical' : site.maintenanceRisk === 'High' ? 'Attention' :
      site.expansionScore !== null && site.expansionScore >= 75 ? 'Expansion Opportunity' : 'Healthy';
    return site;
  });
}
