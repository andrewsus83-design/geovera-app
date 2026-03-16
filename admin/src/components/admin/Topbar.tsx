'use client';

import { usePathname } from 'next/navigation';
import { Bell } from 'lucide-react';

const LABELS: Record<string, string> = {
  '/dashboard': 'Dashboard',
  '/brands': 'Daftar Brand',
  '/brands/new': 'Tambah Brand Baru',
  '/quota': 'Kelola Quota',
  '/quota/overrides': 'Override Quota',
  '/blog': 'Blog Posts',
  '/blog/new': 'Buat Post Baru',
  '/reports': 'Buat Report',
  '/reports/history': 'Riwayat Report',
  '/legal': 'Legal Pages',
  '/settings': 'Pengaturan',
};

function getBreadcrumb(pathname: string): string[] {
  const parts: string[] = [];

  if (LABELS[pathname]) {
    parts.push(LABELS[pathname]);
  } else if (pathname.startsWith('/brands/') && pathname !== '/brands/new') {
    parts.push('Daftar Brand');
    if (pathname.includes('/api-keys')) parts.push('API Keys');
    else if (pathname.includes('/assets')) parts.push('Assets');
    else parts.push('Edit Brand');
  } else if (pathname.startsWith('/blog/') && pathname !== '/blog/new') {
    parts.push('Blog Posts', 'Edit Post');
  } else {
    parts.push(pathname.slice(1).replace(/\//g, ' › '));
  }

  return parts;
}

export default function Topbar() {
  const pathname = usePathname();
  const crumbs = getBreadcrumb(pathname);

  return (
    <header
      className="fixed top-0 right-0 h-[var(--topbar-h)] bg-[var(--base)]/80 backdrop-blur-md border-b border-[var(--b1)] z-30 flex items-center justify-between px-6"
      style={{ left: 'var(--sidebar)' }}
    >
      <div className="flex items-center gap-2 text-[var(--fs-2xs)]">
        {crumbs.map((crumb, i) => (
          <span key={i} className="flex items-center gap-2">
            {i > 0 && <span className="text-[var(--t3)]">/</span>}
            <span className={i === crumbs.length - 1 ? 'text-[var(--t1)] font-medium' : 'text-[var(--t3)]'}>
              {crumb}
            </span>
          </span>
        ))}
      </div>

      <div className="flex items-center gap-3">
        <button className="p-2 rounded-[var(--r4)] text-[var(--t3)] hover:text-[var(--t2)] hover:bg-[var(--s1)] transition-colors relative">
          <Bell className="w-4 h-4" />
        </button>
        <div className="w-8 h-8 rounded-full bg-[var(--s3)] flex items-center justify-center text-[var(--fs-3xs)] font-semibold text-[var(--t2)]">
          AG
        </div>
      </div>
    </header>
  );
}
