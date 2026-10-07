'use client';
import { useEffect, useRef, useState } from 'react';
import { loadTowerPortfolio, saveTowerPortfolio } from './storage';
import { normalizeTowers, type TowerPortfolio } from './tower-data';

export type TowerSourceMode = 'live' | 'public' | 'import';
export function useTowerPortfolio() {
  const [imported, setImported] = useState<TowerPortfolio>();
  const [publicPortfolio, setPublicPortfolio] = useState<TowerPortfolio>();
  const [live, setLive] = useState<TowerPortfolio>();
  const [ready, setReady] = useState(false);
  const [mode, changeMode] = useState<TowerSourceMode>('live');
  const [error, setError] = useState('');
  const [refreshId, setRefreshId] = useState(0);
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [configured, setConfigured] = useState(false);
  const [fetchedAt, setFetchedAt] = useState('');
  const loadedPublicRefresh = useRef(0);
  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const [saved, snapshot] = await Promise.all([loadTowerPortfolio(), loadTowerPortfolio('vertical-bridge-public')]);
        if (!active) return;
        if (snapshot) setPublicPortfolio({ ...snapshot, sites: normalizeTowers(snapshot.sites) });
        if (saved) { setImported({ ...saved, sites: normalizeTowers(saved.sites) }); changeMode('import'); }
        else {
          const legacy = localStorage.getItem('vertical-bridge-towers');
          if (legacy) {
            const portfolio = { sites: normalizeTowers(JSON.parse(legacy)), source: { name: 'Previously imported portfolio', format: 'JSON', importedAt: new Date().toISOString() } };
            await saveTowerPortfolio(portfolio);
            if (!active) return;
            setImported(portfolio); changeMode('import'); localStorage.removeItem('vertical-bridge-towers');
          }
        }
      } catch (err) { if (active) setError(err instanceof Error ? err.message : 'Could not load the saved tower portfolio.'); }
      finally { if (active) setReady(true); }
    })();
    return () => { active = false; };
  }, []);
  useEffect(() => {
    if (!ready || mode === 'import') { setLoading(false); return; }
    if (mode === 'public' && publicPortfolio && loadedPublicRefresh.current === refreshId) { setLoading(false); return; }
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    const load = async () => {
      setLoading(true);
      try {
        const response = await fetch(mode === 'public' ? '/api/towers/vertical-bridge' : '/api/towers', { cache: 'no-store', signal: controller.signal });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Could not load tower data.');
        if (controller.signal.aborted) return;
        if (mode === 'public') {
          const portfolio = { sites: normalizeTowers(data.sites), source: data.source };
          await saveTowerPortfolio(portfolio, 'vertical-bridge-public');
          if (controller.signal.aborted) return;
          loadedPublicRefresh.current = refreshId; setPublicPortfolio(portfolio);
        } else {
          setConfigured(data.configured);
          if (!data.configured) { changeMode('public'); return; }
          setLive({ sites: data.sites, source: data.source || { name: 'Connected tower feed', format: 'JSON', importedAt: data.fetchedAt } });
          setFetchedAt(data.fetchedAt || '');
        }
        setError('');
      } catch (err) { if (!controller.signal.aborted) setError(err instanceof Error ? err.message : 'Could not refresh tower data.'); }
      finally {
        if (!controller.signal.aborted) { setLoading(false); if (mode === 'live') timer = setTimeout(() => void load(), 15000); }
      }
    };
    void load();
    return () => { controller.abort(); clearTimeout(timer); };
  }, [mode, ready, refreshId, publicPortfolio]);
  const portfolio = mode === 'live' ? live : mode === 'public' ? publicPortfolio : imported;
  const importFile = async (file: File, merge = false) => {
    if (importing) return;
    setImporting(true); setError('');
    try {
      const { parseTowerFile, mergeTowerSites } = await import('./tower-import');
      const parsed = await parseTowerFile(new Uint8Array(await file.arrayBuffer()), file.name);
      const combined = merge && portfolio ? { sites: mergeTowerSites(portfolio.sites, parsed.sites), source: { ...parsed.source,
        name: `${portfolio.source.name} + ${file.name}`, format: 'Merged', warning: [portfolio.source.warning, parsed.source.warning].filter(Boolean).join(' '), count: undefined } } : parsed;
      combined.source.count = combined.sites.length;
      await saveTowerPortfolio(combined);
      setImported(combined); changeMode('import');
    } catch (err) { setError(err instanceof Error ? err.message : 'Could not import this tower file.'); }
    finally { setImporting(false); }
  };
  return { sites: portfolio?.sites || [], source: portfolio?.source, ready, mode, loading, importing, error, configured, fetchedAt,
    setMode: (value: TowerSourceMode) => { setError(''); changeMode(value); }, refresh: () => setRefreshId(Date.now()), importFile };
}
