import Sidebar from './Sidebar';
import Topbar from './Topbar';

export default function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-[var(--void)]">
      <Sidebar />
      <Topbar />
      <main
        className="pt-[var(--topbar-h)] min-h-screen"
        style={{ marginLeft: 'var(--sidebar)' }}
      >
        <div className="p-6">{children}</div>
      </main>
    </div>
  );
}
