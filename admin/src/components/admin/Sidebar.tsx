'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  LayoutDashboard, Building2, PlusCircle, Gauge,
  FileText, BarChart3, Scale, Settings, LogOut, Sparkles,
} from 'lucide-react';
import { createClient } from '@/lib/supabase/client';

const NAV_SECTIONS = [
  {
    label: 'Overview',
    items: [
      { href: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
    ],
  },
  {
    label: 'Brand Management',
    items: [
      { href: '/brands', icon: Building2, label: 'Daftar Brand' },
      { href: '/brands/new', icon: PlusCircle, label: 'Tambah Brand Baru' },
      { href: '/quota', icon: Gauge, label: 'Kelola Quota' },
    ],
  },
  {
    label: 'Content',
    items: [
      { href: '/generated-content', icon: Sparkles, label: 'Generated Content' },
      { href: '/blog', icon: FileText, label: 'Blog Posts' },
      { href: '/reports', icon: BarChart3, label: 'Buat Report' },
      { href: '/legal', icon: Scale, label: 'Legal Pages' },
    ],
  },
  {
    label: 'System',
    items: [
      { href: '/settings', icon: Settings, label: 'Pengaturan' },
    ],
  },
];

export default function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();

  const handleLogout = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push('/login');
  };

  return (
    <aside className="fixed left-0 top-0 bottom-0 w-[var(--sidebar)] bg-[var(--base)] border-r border-[var(--b1)] flex flex-col z-40">
      {/* Logo */}
      <div className="px-5 h-[var(--topbar-h)] flex items-center gap-2 border-b border-[var(--b0)]">
        <span className="text-[var(--fs-sm)] font-bold text-[var(--t1)]">Geo</span>
        <span className="text-[var(--fs-sm)] font-bold text-[var(--g5)] italic">Vera</span>
        <span className="ml-2 px-1.5 py-0.5 text-[9px] font-semibold bg-[var(--ga15)] text-[var(--g4)] rounded-[var(--r2)] uppercase tracking-wider">
          Admin
        </span>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-6">
        {NAV_SECTIONS.map((section) => (
          <div key={section.label}>
            <p className="px-3 mb-2 text-[10px] font-semibold text-[var(--t3)] uppercase tracking-widest">
              {section.label}
            </p>
            <div className="space-y-0.5">
              {section.items.map((item) => {
                const isActive = pathname === item.href || pathname.startsWith(item.href + '/');
                const Icon = item.icon;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`
                      flex items-center gap-3 px-3 py-2 rounded-[var(--r4)] text-[var(--fs-2xs)]
                      transition-colors duration-150
                      ${isActive
                        ? 'bg-[var(--ga8)] text-[var(--g4)] font-semibold'
                        : 'text-[var(--t2)] hover:bg-[var(--s1)] hover:text-[var(--t1)]'
                      }
                    `}
                  >
                    <Icon className="w-4 h-4" />
                    {item.label}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      {/* Footer */}
      <div className="px-4 py-4 border-t border-[var(--b0)]">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-[var(--s3)] flex items-center justify-center text-[var(--fs-3xs)] font-semibold text-[var(--t2)]">
            AG
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[var(--fs-3xs)] font-medium text-[var(--t1)] truncate">Admin GeoVera</p>
            <p className="text-[10px] text-[var(--t3)]">Super Admin</p>
          </div>
          <button
            onClick={handleLogout}
            className="p-1.5 rounded-[var(--r2)] text-[var(--t3)] hover:text-[var(--red)] hover:bg-[rgba(248,113,113,.1)] transition-colors"
            title="Logout"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>
    </aside>
  );
}
