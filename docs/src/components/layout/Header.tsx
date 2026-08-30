import Link from "next/link";

export function Header() {
  return (
    <header className="border-b bg-white sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
        <Link href="/" className="text-xl font-bold text-blue-600">
          Stellar Privacy Docs
        </Link>
        <nav className="flex items-center gap-6">
          <Link href="/" className="text-sm text-gray-600 hover:text-gray-900">Home</Link>
          <a href="/api" className="text-sm text-gray-600 hover:text-gray-900">API</a>
        </nav>
      </div>
    </header>
  );
}
