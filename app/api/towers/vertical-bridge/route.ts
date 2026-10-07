import { loadVerticalBridgeSnapshot } from '../../../../lib/vertical-bridge-source';
import { towerResponse } from '../../../../lib/tower-response';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 180;
export async function GET() {
  try {
    const portfolio = await loadVerticalBridgeSnapshot();
    return towerResponse(portfolio);
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : 'Could not load the public tower layer. You can import a KML/KMZ export instead.' }, { status: 502 });
  }
}
