import Link from "next/link";

export default function NotFound() {
  return (
    <div
      className="flex flex-col items-center justify-center min-h-screen p-6 text-center"
      style={{ background: "var(--gv-color-bg-base)" }}
    >
      <div className="max-w-sm w-full">
        <p className="text-7xl font-black mb-4" style={{ color: "var(--gv-color-primary-500)" }}>
          404
        </p>
        <h1 className="text-xl font-bold mb-2" style={{ color: "var(--gv-color-neutral-900)" }}>
          Page Not Found
        </h1>
        <p className="text-sm mb-8" style={{ color: "var(--gv-color-neutral-500)" }}>
          The page you are looking for doesn&apos;t exist or has been moved.
        </p>
        <Link
          href="/"
          className="gv-btn-primary inline-flex items-center justify-center px-6 py-2.5 text-sm font-semibold"
        >
          Back to Home
        </Link>
      </div>
    </div>
  );
}
