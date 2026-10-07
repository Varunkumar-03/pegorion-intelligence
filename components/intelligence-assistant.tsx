'use client';
import { useState } from 'react';
import { ArrowRight, Sparkles, X } from 'lucide-react';
import type { LeaseRecord } from '../lib/lease-data';
import type { TowerSite, TowerSource } from '../lib/tower-data';
import { towerQuestionContext, type GroundedAnswer } from '../lib/answers';

export default function IntelligenceAssistant({ lease, sites, source, onClose }: { lease?: LeaseRecord; sites?: TowerSite[]; source?: TowerSource; onClose: () => void }) {
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState<GroundedAnswer | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const suggestions = lease ? ['What is the base monthly rent?', 'When does the lease expire?', 'How much notice is required for renewal?', 'What obligations does the tenant have?', 'Why does this lease need attention?'] :
    sites?.every((site) => site.healthScore === null) ? ['How many tower locations are loaded?', 'Show tower locations in TX.', 'How many locations are in CA?', 'What operational data is available?'] : ['Which sites should we prioritize for investment?', 'Which sites have spare capacity?', 'Show the highest maintenance risks.', 'Which sites are most future-ready?', 'Which sites consume the most energy?'];
  const ask = async (value: string) => {
    if (!value.trim() || loading) return;
    setQuestion(value); setLoading(true); setError(''); setAnswer(null);
    try {
      const context = lease ? { lease } : towerQuestionContext(value, sites || [], source);
      const response = await fetch('/api/ask', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ question: value, kind: lease ? 'lease' : 'towers', ...context }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Could not answer this question.');
      setAnswer(result);
    } catch (err) { setError(err instanceof Error ? err.message : 'Question failed.'); }
    finally { setLoading(false); }
  };
  return <aside className="intelligence-assistant" role="dialog" aria-modal="true" aria-label="Intelligence assistant">
    <div className="assistant-heading"><div><div className="eyebrow">VERTICAL BRIDGE ASSIST</div><h2>{lease ? 'Ask about this lease' : 'Ask about your portfolio'}</h2></div><button className="icon-btn" onClick={onClose} aria-label="Close assistant"><X size={18} /></button></div>
    <p>Answers use the supplied records and their source references.</p>
    <div className="assistant-suggestions">{suggestions.map((value) => <button key={value} disabled={loading} onClick={() => void ask(value)}>{value}<ArrowRight size={14} /></button>)}</div>
    <form className="assistant-form" onSubmit={(event) => { event.preventDefault(); void ask(question); }}><input aria-label="Your question" value={question} onChange={(event) => setQuestion(event.target.value)} maxLength={1000} placeholder="Ask a question…" /><button className="primary" disabled={loading || !question.trim()} aria-label="Submit question"><ArrowRight size={16} /></button></form>
    {loading && <p role="status">Analyzing your question…</p>}{error && <p className="data-error" role="alert">{error}</p>}
    {answer && <div className="assistant-answer"><div className="eyebrow"><Sparkles size={13} /> GROUNDED ANSWER</div><p>{answer.text}</p>{answer.sources.length > 0 && <details open><summary>Sources</summary><ul>{answer.sources.map((source, index) => <li key={index}>{source}</li>)}</ul></details>}</div>}
  </aside>;
}
