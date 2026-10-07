import './globals.css';
import './working.css';
import type { Metadata } from 'next';
import Link from 'next/link';
import styles from './product-switcher.module.css';

export const metadata: Metadata = { title: 'Vertical Bridge Intelligence', description: 'Tower and lease intelligence for Vertical Bridge. Powered by Pegorion.' };
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="en"><body><div className={styles.switcher}><Link className={styles.link} href="/">Tower Intelligence</Link><Link className={styles.link} href="/lease">Lease Intelligence</Link></div>{children}<footer className="powered-footer">Powered by <strong>Pegorion</strong></footer></body></html>;
}
