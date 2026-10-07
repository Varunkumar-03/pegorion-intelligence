export async function requestAi(body: Record<string, unknown>): Promise<unknown> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error('Configure OPENAI_API_KEY on the server to enable AI analysis.');
  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: process.env.OPENAI_MODEL || 'gpt-4.1-mini', ...body }),
    signal: AbortSignal.timeout(120000), cache: 'no-store',
  });
  const data = await response.json();
  if (!response.ok) throw new Error(`AI analysis failed (${response.status}). ${data.error?.message || 'Check the API configuration.'}`);
  if (data.status === 'incomplete') throw new Error('AI analysis exceeded its response limit. Please use a shorter document or increase the model response limit.');
  const text = data.output?.flatMap((item: { content?: { type: string; text?: string }[] }) => item.content || [])
    .filter((item: { type: string }) => item.type === 'output_text').map((item: { text: string }) => item.text).join('');
  if (!text) throw new Error('The AI provider returned no usable answer.');
  try { return JSON.parse(text); } catch { throw new Error('The AI provider returned an invalid analysis. Please retry.'); }
}
