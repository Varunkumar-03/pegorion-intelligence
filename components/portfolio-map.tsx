'use client';
import { useEffect, useRef } from 'react';
import type { TowerSite } from '../lib/tower-data';
import L from 'leaflet';
import 'leaflet.markercluster';
import 'leaflet/dist/leaflet.css';
import 'leaflet.markercluster/dist/MarkerCluster.css';
import 'leaflet.markercluster/dist/MarkerCluster.Default.css';

export default function PortfolioMap({ sites, onSelect, selectedId, onOpen }: { sites: TowerSite[]; onSelect: (id: string) => void; selectedId: string; onOpen: (id: string) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markers = useRef<L.MarkerClusterGroup | null>(null);
  const fittedSource = useRef('');
  useEffect(() => {
    if (!ref.current) return;
    const map = L.map(ref.current, { zoomControl: false }).setView([38.7, -96.2], 4);
    L.control.zoom({ position: 'bottomright' }).addTo(map);
    const street = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '© OpenStreetMap contributors' }).addTo(map);
    const satellite = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', { attribution: 'Imagery © Esri and contributors', maxZoom: 19 });
    L.control.layers({ 'Street map': street, 'Satellite imagery': satellite }, {}, { position: 'bottomright' }).addTo(map);
    mapRef.current = map;
    return () => { map.remove(); mapRef.current = null; markers.current = null; fittedSource.current = ''; };
  }, []);
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (markers.current) map.removeLayer(markers.current);
    const group = L.markerClusterGroup({ chunkedLoading: true, chunkInterval: 25, chunkDelay: 5, maxClusterRadius: 55, showCoverageOnHover: false });
    markers.current = group;
    group.addTo(map);
    const layers = sites.map((site) => {
      const color = site.status === 'Critical' ? '#d35f5f' : site.status === 'Attention' ? '#d79b37' : site.status === 'Expansion Opportunity' ? '#477de0' : site.status === 'Needs data' ? '#8997ac' : '#2f9e78';
      const icon = L.divIcon({ className: 'tower-marker', html: `<span style="background:${color}"></span>`, iconSize: [14, 14], iconAnchor: [7, 7] });
      const marker = L.marker([site.latitude, site.longitude], { icon });
      marker.on('click', () => onSelect(site.id));
      const tooltip = document.createElement('span'); tooltip.textContent = `${site.id} · ${site.city}, ${site.state}`;
      marker.bindTooltip(tooltip, { direction: 'top', offset: [0, -6] });
      return marker;
    });
    group.addLayers(layers);
    const sourceKey = `${sites.length}:${sites[0]?.id}:${sites[sites.length - 1]?.id}`;
    if (fittedSource.current !== sourceKey && sites.length) {
      if (sites[0].dataSource?.includes('Vertical Bridge ArcGIS')) map.setView([38.7, -96.2], 4);
      else map.fitBounds(L.latLngBounds(sites.map((site) => [site.latitude, site.longitude])), { padding: [35, 35], maxZoom: 10 });
      fittedSource.current = sourceKey;
    }
  }, [sites, onSelect]);
  const selected = sites.find((site) => site.id === selectedId);
  const fitAll = () => { if (sites.length) mapRef.current?.fitBounds(L.latLngBounds(sites.map((site) => [site.latitude, site.longitude])), { padding: [35, 35], maxZoom: 10 }); };
  return <div className="map-shell"><div ref={ref} className="map" /><div className="map-overlay"><div className="map-title"><div><div className="eyebrow">PORTFOLIO MAP</div><strong>{sites.length.toLocaleString()} supplied sites</strong><span>Actual site coordinates</span></div><button className="ask-button" onClick={fitAll}>Fit all locations</button></div>{selected && <div className="map-card"><div className="map-card-head"><div><div className="eyebrow">SELECTED SITE</div><h3>{selected.id}</h3><span>{selected.city}, {selected.state} · {selected.towerType}</span></div></div><div className="map-card-metrics"><div><span>Health</span><strong>{selected.healthScore ?? 'Unknown'}</strong></div><div><span>Positions</span><strong>{selected.availableTenantPositions ?? 'Unknown'}</strong></div></div><button className="primary" onClick={() => onOpen(selected.id)}>Open Tower 360</button></div>}</div></div>;
}
