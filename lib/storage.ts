import type { LeaseRecord } from './lease-data';
import type { TowerPortfolio } from './tower-data';

const DB_NAME = 'vertical-bridge-intelligence';
function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 2);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains('leases')) db.createObjectStore('leases', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('documents')) db.createObjectStore('documents');
      if (!db.objectStoreNames.contains('portfolios')) db.createObjectStore('portfolios');
    };
    request.onsuccess = () => { request.result.onversionchange = () => request.result.close(); resolve(request.result); };
    request.onerror = () => reject(new Error('Could not open local storage. Enable browser storage to save leases.'));
  });
}
export async function loadLeases(): Promise<LeaseRecord[]> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction('leases', 'readonly');
    const request = transaction.objectStore('leases').getAll();
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(new Error('Could not load saved leases.'));
    transaction.oncomplete = () => db.close();
  });
}
export async function saveLease(lease: LeaseRecord, file?: Blob): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(['leases', 'documents'], 'readwrite');
    transaction.objectStore('leases').put(lease);
    if (file) transaction.objectStore('documents').put(file, lease.id);
    transaction.oncomplete = () => { db.close(); resolve(); };
    transaction.onerror = () => { db.close(); reject(new Error('Could not save the document. Check available browser storage.')); };
    transaction.onabort = () => { db.close(); reject(new Error('Document storage was interrupted. Please retry.')); };
  });
}
export async function loadDocument(id: string): Promise<Blob | undefined> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction('documents', 'readonly');
    const request = transaction.objectStore('documents').get(id);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(new Error('Could not load the source PDF.'));
    transaction.oncomplete = () => db.close();
  });
}
export function downloadJson(name: string, value: unknown) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' }));
  const anchor = document.createElement('a');
  anchor.href = url; anchor.download = name; anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export async function loadTowerPortfolio(key = 'towers'): Promise<TowerPortfolio | undefined> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction('portfolios', 'readonly');
    const request = transaction.objectStore('portfolios').get(key);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(new Error('Could not load the saved tower portfolio.'));
    transaction.oncomplete = () => db.close();
  });
}
export async function saveTowerPortfolio(portfolio: TowerPortfolio, key = 'towers'): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction('portfolios', 'readwrite');
    transaction.objectStore('portfolios').put(portfolio, key);
    transaction.oncomplete = () => { db.close(); resolve(); };
    transaction.onerror = transaction.onabort = () => { db.close(); reject(new Error('Could not save the tower portfolio. Check available browser storage.')); };
  });
}
