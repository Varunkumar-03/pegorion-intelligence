import { XMLParser, XMLValidator } from 'fast-xml-parser';
import { strFromU8, unzipSync } from 'fflate';
import { normalizeTowers, parseCsv, towerColumns, type TowerPortfolio, type TowerSite } from './tower-data';

export const MAX_TOWER_FILE_BYTES = 50 * 1024 * 1024;
type Row = Record<string, unknown>;
const keyOf = (key: string) => key.toLowerCase().replace(/[^a-z0-9]/g, '');
const aliases: Record<string, string> = {
  siteno: 'id', sitenumber: 'id', siteid: 'id', towerid: 'id', towernumber: 'id',
  sitename: 'siteName', name: 'siteName', title: 'siteName', sitecity: 'city',
  siteaddress: 'address', addressformatted: 'address', sitestateorprovince: 'state', province: 'state',
  lat: 'latitude', y: 'latitude', lng: 'longitude', lon: 'longitude', long: 'longitude', x: 'longitude',
  sitetype: 'towerType', structuretype: 'towerType', asrnumber: 'asrNumber', registrationnumber: 'asrNumber',
  heightft: 'height', heightfeet: 'height',
};
const canonicalKeys = new Map([...towerColumns, 'address', 'asrNumber', 'dataSource', 'sourceUrl', 'sourceUpdatedAt', 'sourceProperties'].map((key) => [keyOf(key), key]));
export function mapTowerProperties(properties: Row): Row {
  const row: Row = {};
  for (const [key, value] of Object.entries(properties)) {
    const canonical = canonicalKeys.get(keyOf(key)) || aliases[keyOf(key)];
    if (canonical && value !== undefined && value !== '') row[canonical] = value;
  }
  return row;
}
const asText = (value: unknown): string => typeof value === 'string' || typeof value === 'number' ? String(value) :
  value && typeof value === 'object' ? asText((value as Row)['#text']) : '';
const plainText = (html: string) => html.replace(/<[^>]*>/g, ' ').replace(/&nbsp;/gi, ' ').replace(/&amp;/gi, '&').replace(/&lt;/gi, '<').replace(/&gt;/gi, '>').replace(/&quot;/gi, '"').replace(/&#39;/g, "'").replace(/\s+/g, ' ').trim();
function stableId(name: string, latitude: number, longitude: number): string {
  let hash = 2166136261;
  for (const character of `${name}|${latitude}|${longitude}`) hash = Math.imul(hash ^ character.charCodeAt(0), 16777619);
  return `MAP-${(hash >>> 0).toString(16).padStart(8, '0')}`;
}
function walk(value: unknown, visit: (key: string, node: unknown) => void, depth = 0) {
  if (depth > 100) throw new Error('The map file has too many nested folders.');
  if (!value || typeof value !== 'object') return;
  if (Array.isArray(value)) { value.forEach((node) => walk(node, visit, depth + 1)); return; }
  for (const [key, node] of Object.entries(value)) { visit(key, node); walk(node, visit, depth + 1); }
}
export function parseKml(text: string): { rows: Row[]; skipped: number; networkLinks: number } {
  if (/<!DOCTYPE|<!ENTITY/i.test(text)) throw new Error('KML document type declarations are not supported. Export a standard KML file.');
  const validation = XMLValidator.validate(text);
  if (validation !== true) throw new Error(`Invalid KML: ${validation.err.msg}`);
  const tree = new XMLParser({ ignoreAttributes: false, removeNSPrefix: true, parseTagValue: false, parseAttributeValue: false, trimValues: true }).parse(text);
  if (!tree.kml) throw new Error('This XML file is not a KML document.');
  const rows: Row[] = [];
  let skipped = 0, networkLinks = 0;
  walk(tree.kml, (key, node) => {
    if (key === 'NetworkLink') networkLinks += Array.isArray(node) ? node.length : 1;
    if (key !== 'Placemark') return;
    const placemarks = Array.isArray(node) ? node : [node];
    placemarks.forEach((placemark: Row) => {
      const points: Row[] = [];
      walk(placemark, (name, value) => { if (name === 'Point') points.push(...(Array.isArray(value) ? value : [value]) as Row[]); });
      if (points.length !== 1) { skipped++; return; }
      const coordinates = asText(points[0].coordinates).trim().split(/\s+/)[0]?.split(',');
      if (!coordinates || coordinates.length < 2 || !coordinates[0].trim() || !coordinates[1].trim()) throw new Error('A KML placemark has no valid point coordinates.');
      const longitude = Number(coordinates[0]), latitude = Number(coordinates[1]);
      const properties: Row = {};
      walk(placemark.ExtendedData, (name, value) => {
        if (name !== 'Data' && name !== 'SimpleData') return;
        for (const field of (Array.isArray(value) ? value : [value]) as Row[]) {
          const fieldName = asText(field['@_name']);
          if (fieldName) properties[fieldName] = name === 'Data' ? asText(field.value) : asText(field);
        }
      });
      const description = asText(placemark.description);
      for (const match of Array.from(description.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi))) {
        const cells = Array.from(match[1].matchAll(/<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi)).map((cell) => plainText(cell[1]));
        if (cells.length >= 2 && cells[0]) properties[cells[0]] ??= cells[1];
      }
      const row = mapTowerProperties(properties);
      const name = asText(placemark.name) || asText(row.siteName);
      row.id ||= /^[A-Z]{2}(?:-[A-Z]{2})?-\d[\w-]*$/i.test(name) ? name : asText(placemark['@_id']) || stableId(name, latitude, longitude);
      row.siteName ||= name || row.id;
      Object.assign(row, { latitude, longitude, sourceProperties: { ...properties, ...(description ? { description: plainText(description) } : {}) } });
      rows.push(row);
    });
  });
  return { rows, skipped, networkLinks };
}
function parseGeoJson(input: Row): { rows: Row[]; skipped: number } {
  if (input.crs && !/4326|CRS84/i.test(JSON.stringify(input.crs))) throw new Error('Export GeoJSON using WGS84 (EPSG:4326) coordinates.');
  const features = input.type === 'FeatureCollection' ? input.features : input.type === 'Feature' ? [input] : null;
  if (!Array.isArray(features)) throw new Error('Provide a GeoJSON FeatureCollection or point Feature.');
  let skipped = 0;
  const rows: Row[] = [];
  for (const feature of features) {
    if (feature?.geometry?.type !== 'Point') { skipped++; continue; }
    const coordinates = feature.geometry.coordinates;
    if (!Array.isArray(coordinates) || coordinates.length < 2 || typeof coordinates[0] !== 'number' || typeof coordinates[1] !== 'number') throw new Error('GeoJSON point coordinates must be [longitude, latitude].');
    const properties = feature.properties && typeof feature.properties === 'object' ? feature.properties : {};
    const row = mapTowerProperties(properties);
    row.id ||= feature.id == null ? stableId(String(row.siteName || ''), coordinates[1], coordinates[0]) : String(feature.id);
    row.siteName ||= row.id;
    Object.assign(row, { latitude: coordinates[1], longitude: coordinates[0], sourceProperties: properties });
    rows.push(row);
  }
  return { rows, skipped };
}
export async function parseTowerFile(data: Uint8Array, filename: string): Promise<TowerPortfolio> {
  if (data.byteLength > MAX_TOWER_FILE_BYTES) throw new Error('Tower files must be 50 MB or smaller.');
  const extension = filename.toLowerCase().split('.').pop();
  let rows: unknown, skipped = 0, warning = '', format = extension?.toUpperCase() || 'JSON';
  if (extension === 'kmz' || extension === 'kml') {
    let texts: string[];
    if (extension === 'kmz') {
      let total = 0;
      let files: Record<string, Uint8Array>;
      try {
        files = unzipSync(data, { filter: (file) => {
          if (!file.name.toLowerCase().endsWith('.kml')) return false;
          total += file.originalSize;
          if (total > MAX_TOWER_FILE_BYTES) throw new Error('Expanded KML content exceeds 50 MB.');
          return true;
        } });
      } catch (error) { throw new Error(`Could not read KMZ: ${error instanceof Error ? error.message : 'Invalid ZIP archive.'}`); }
      const entries = Object.entries(files).filter(([name]) => name.toLowerCase().endsWith('.kml'));
      if (!entries.length) throw new Error('This KMZ archive contains no KML document.');
      texts = entries.sort(([a], [b]) => a.localeCompare(b)).map(([, content]) => strFromU8(content));
    } else texts = [strFromU8(data)];
    const allRows: Row[] = [];
    let links = 0;
    for (const text of texts) { const parsed = parseKml(text); allRows.push(...parsed.rows); skipped += parsed.skipped; links += parsed.networkLinks; }
    rows = allRows;
    if (links) warning = `${links} network links were not followed. Export the loaded Google Earth placemarks as an embedded KML/KMZ to include those sites.`;
  } else if (extension === 'csv') rows = parseCsv(strFromU8(data)).map(mapTowerProperties);
  else if (extension === 'json' || extension === 'geojson') {
    let input;
    try { input = JSON.parse(strFromU8(data)); } catch { throw new Error('The file contains invalid JSON.'); }
    if (input.type === 'FeatureCollection' || input.type === 'Feature') { const parsed = parseGeoJson(input); rows = parsed.rows; skipped = parsed.skipped; format = 'GeoJSON'; }
    else { const list = Array.isArray(input) ? input : input.sites; if (!Array.isArray(list)) throw new Error('Provide a site array, { sites: [...] }, or a GeoJSON FeatureCollection.'); rows = list.map(mapTowerProperties); }
  } else throw new Error('Choose a KML, KMZ, GeoJSON, CSV or JSON tower file.');
  const sites = normalizeTowers(rows).map((site) => ({ ...site, dataSource: site.dataSource || `${format} import: ${filename}` }));
  if (!sites.length) throw new Error(warning || 'No point locations were found. Export the tower placemarks, not just a map image or polygon.');
  if (skipped) warning = `${skipped} non-point or multi-point features were skipped. ${warning}`.trim();
  return { sites, source: { name: filename, format, importedAt: new Date().toISOString(), count: sites.length, skipped, warning } };
}
export function mergeTowerSites(existing: TowerSite[], incoming: TowerSite[]): TowerSite[] {
  const merged = new Map(existing.map((site) => [site.id, site]));
  for (const site of incoming) {
    const previous = merged.get(site.id);
    if (!previous) { merged.set(site.id, site); continue; }
    const values = Object.fromEntries(Object.entries(site).filter(([key, value]) => value !== null && value !== '' && !['Unknown', 'Unclassified'].includes(String(value)) && !(key === 'siteName' && value === site.id)));
    merged.set(site.id, normalizeTowers([{ ...previous, ...values, sourceProperties: { ...previous.sourceProperties, ...site.sourceProperties } }])[0]);
  }
  return normalizeTowers(Array.from(merged.values()));
}
export function towersToKml(sites: TowerSite[]): string {
  const escape = (value: string) => value.replace(/[<>&'\"]/g, (character) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' }[character]!));
  return `<?xml version="1.0" encoding="UTF-8"?><kml xmlns="http://www.opengis.net/kml/2.2"><Document><name>Vertical Bridge tower locations</name>${sites.map((site) => `<Placemark><name>${escape(site.id)}</name><ExtendedData>${[['SiteNo', site.id], ['SiteName', site.siteName], ['SiteCity', site.city], ['SiteStateOrProvince', site.state], ['SiteType', site.towerType], ['Source', site.dataSource]].map(([key, value]) => `<Data name="${key}"><value>${escape(value || '')}</value></Data>`).join('')}</ExtendedData><Point><coordinates>${site.longitude},${site.latitude},0</coordinates></Point></Placemark>`).join('')}</Document></kml>`;
}
