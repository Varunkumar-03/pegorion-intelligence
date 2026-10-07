import { MAX_TOWERS, normalizeTowers, type TowerPortfolio } from './tower-data';

export const VERTICAL_BRIDGE_LAYER = 'https://services7.arcgis.com/7dCtZoMa8eN1Heza/arcgis/rest/services/Vertical_Bridge/FeatureServer/0';
export const VERTICAL_BRIDGE_ITEM = 'https://www.arcgis.com/home/item.html?id=0a23db42950442fcb9eedfd58b90ce9c';
export const VERTICAL_BRIDGE_PORTAL = 'https://portal.verticalbridge.com/';
export const SNAPSHOT_WARNING = 'Historical public layer last edited in November 2019. This is not the complete current Vertical Bridge portfolio. Operational telemetry, occupancy and financial data are not included.';

type ArcFeature = { attributes: Record<string, unknown>; geometry?: { x: number; y: number } };
async function readArcGis(url: string, parameters?: Record<string, string>) {
  const response = await fetch(parameters ? `${url}/query` : `${url}?f=json`, {
    ...(parameters ? { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ f: 'json', ...parameters }) } : {}),
    cache: 'no-store', signal: AbortSignal.timeout(30000),
  });
  if (!response.ok) throw new Error(`The public Vertical Bridge layer returned HTTP ${response.status}.`);
  const result = await response.json();
  if (result.error) throw new Error(`The public layer could not be read: ${result.error.message || result.error.code}`);
  return result;
}
export async function fetchVerticalBridgeSnapshot(): Promise<TowerPortfolio> {
  const metadata = await readArcGis(VERTICAL_BRIDGE_LAYER);
  const result = await readArcGis(VERTICAL_BRIDGE_LAYER, { where: "SiteCategory = 'Tower'", returnIdsOnly: 'true' });
  if (!Array.isArray(result.objectIds) || !result.objectIds.length) throw new Error('The public layer returned no tower locations.');
  const ids = Array.from(new Set<number>(result.objectIds)).sort((a, b) => a - b);
  if (ids.length > MAX_TOWERS) throw new Error(`The source exceeds the ${MAX_TOWERS.toLocaleString()}-site portfolio limit.`);
  const features: ArcFeature[] = [];
  const objectIdField = result.objectIdFieldName || metadata.objectIdField || 'ObjectId';
  const seen = new Set<number>();
  for (let offset = 0; offset < ids.length; offset += 1000) {
    const batchIds = ids.slice(offset, offset + 1000);
    const page = await readArcGis(VERTICAL_BRIDGE_LAYER, {
      objectIds: batchIds.join(','), outFields: `${objectIdField},SiteNo,SiteName,SiteCategory,SiteType,SiteCity,SiteStateOrProvince,SiteAddress,SitePostalCode,ASRNumber,AGL`,
      outSR: '4326', returnGeometry: 'true',
    });
    if (!Array.isArray(page.features) || page.exceededTransferLimit) throw new Error('The source returned a truncated tower batch. Please retry the import.');
    const requested = new Set(batchIds);
    for (const feature of page.features as ArcFeature[]) {
      const objectId = Number(feature.attributes[objectIdField]);
      if (!requested.has(objectId) || seen.has(objectId)) throw new Error('The source returned inconsistent or duplicate tower records. Please retry.');
      seen.add(objectId); features.push(feature);
    }
    if (page.features.length !== batchIds.length) throw new Error('The source changed while loading. Please retry to fetch a complete snapshot.');
  }
  if (seen.size !== ids.length) throw new Error('The source returned an incomplete tower portfolio. Please retry.');
  const modified = metadata.editingInfo?.dataLastEditDate || metadata.editingInfo?.lastEditDate;
  const sourceUpdatedAt = typeof modified === 'number' ? new Date(modified).toISOString() : '';
  const sites = normalizeTowers(features.map(({ attributes, geometry }) => ({
    id: attributes.SiteNo, siteName: attributes.SiteName, city: attributes.SiteCity, state: attributes.SiteStateOrProvince,
    latitude: geometry?.y, longitude: geometry?.x, towerType: attributes.SiteType,
    address: attributes.SiteAddress, asrNumber: attributes.ASRNumber,
    dataSource: 'Public Vertical Bridge ArcGIS snapshot', sourceUrl: VERTICAL_BRIDGE_ITEM, sourceUpdatedAt,
    // AGL units are not documented by the public layer. Preserve the raw value without assuming feet.
    sourceProperties: attributes,
  })));
  return { sites, source: { name: 'Vertical Bridge public tower locations', format: 'ArcGIS', importedAt: new Date().toISOString(),
    url: VERTICAL_BRIDGE_ITEM, updatedAt: sourceUpdatedAt, warning: SNAPSHOT_WARNING, publisher: 'Public ArcGIS item by dfiedler', count: sites.length } };
}

let cached: TowerPortfolio | undefined;
let pending: Promise<TowerPortfolio> | undefined;
export function loadVerticalBridgeSnapshot(): Promise<TowerPortfolio> {
  if (cached && Date.now() - Date.parse(cached.source.importedAt) < 60 * 60 * 1000) return Promise.resolve(cached);
  if (pending) return pending;
  pending = fetchVerticalBridgeSnapshot().then((portfolio) => { cached = portfolio; return portfolio; }).finally(() => { pending = undefined; });
  return pending;
}
