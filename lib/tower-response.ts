import { gzipSync } from 'node:zlib';

/** Keep nationwide portfolio responses below common serverless response-size limits. */
export function towerResponse(data: unknown): Response {
  const json = JSON.stringify(data);
  if (Buffer.byteLength(json) < 512 * 1024) return new Response(json, { headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
  return new Response(new Uint8Array(gzipSync(json)), { headers: {
    'Content-Type': 'application/json', 'Content-Encoding': 'gzip', 'Cache-Control': 'no-store',
  } });
}
