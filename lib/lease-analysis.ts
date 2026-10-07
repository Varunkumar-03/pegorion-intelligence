import type { LeaseRecord } from './lease-data';

export const MAX_PDF_BYTES = 4 * 1024 * 1024;
export const analysisStages = ['Reading PDF', 'Extracting document text', 'Identifying terms and obligations', 'Calculating deadlines', 'Saving lease'];

export async function analyzeLease(file: File, onProgress: (stage: number) => void, signal?: AbortSignal): Promise<LeaseRecord> {
  const form = new FormData();
  form.append('file', file);
  const response = await fetch('/api/leases/analyze', { method: 'POST', body: form, signal });
  if (!response.ok) {
    const body = await response.json();
    throw new Error(body.error || 'Lease analysis failed.');
  }
  if (!response.body) throw new Error('The server returned no analysis.');
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let pending = '';
  let result: LeaseRecord | undefined;
  while (true) {
    const { done, value } = await reader.read();
    pending += decoder.decode(value, { stream: !done });
    const lines = pending.split('\n');
    pending = lines.pop() || '';
    for (const line of lines) {
      if (!line.trim()) continue;
      const event = JSON.parse(line);
      if (event.error) throw new Error(event.error);
      if (typeof event.stage === 'number') onProgress(event.stage);
      if (event.lease) result = event.lease;
    }
    if (done) break;
  }
  if (!result) throw new Error('Analysis ended without a lease record. Please retry.');
  return result;
}
