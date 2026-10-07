import { parseTowerFile, MAX_TOWER_FILE_BYTES } from '../../../lib/tower-import';
import { towerResponse } from '../../../lib/tower-response';
export const dynamic = 'force-dynamic';

export async function GET() {
  const url = process.env.TOWER_DATA_URL;
  if (!url) return Response.json({ configured: false, sites: [], fetchedAt: null });
  try {
    const response = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(15000),
      headers: process.env.TOWER_DATA_TOKEN ? { Authorization: `Bearer ${process.env.TOWER_DATA_TOKEN}` } : {} });
    if (!response.ok) throw new Error(`Tower data source returned HTTP ${response.status}.`);
    const content = new Uint8Array(await response.arrayBuffer());
    if (content.byteLength > MAX_TOWER_FILE_BYTES) throw new Error('Tower data response is too large.');
    const type = response.headers.get('content-type') || '';
    const extension = type.includes('kmz') ? 'kmz' : type.includes('kml') ? 'kml' : type.includes('csv') ? 'csv' : /\.(kmz|kml|geojson|csv)(?:\?|$)/i.exec(url)?.[1] || 'json';
    const portfolio = await parseTowerFile(content, `connected-feed.${extension}`);
    return towerResponse({ configured: true, ...portfolio, fetchedAt: new Date().toISOString() });
  } catch (error) { return Response.json({ error: error instanceof Error ? error.message : 'Could not refresh tower data.' }, { status: 502 }); }
}
