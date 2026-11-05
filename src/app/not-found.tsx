import Link from "next/link";

export default function NotFound() {
  return (
    <main className="grid min-h-[60vh] place-items-center px-4 text-center">
      <div>
        <h1 className="text-lg font-semibold">Page not found</h1>
        <Link href="/" className="mt-3 inline-block text-sm text-brand">Back to overview</Link>
      </div>
    </main>
  );
}
