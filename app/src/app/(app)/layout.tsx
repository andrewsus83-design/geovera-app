import BottomNav from "@/components/nav/BottomNav";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <main style={{ paddingBottom: "calc(60px + env(safe-area-inset-bottom))" }}>
        {children}
      </main>
      <BottomNav />
    </>
  );
}
