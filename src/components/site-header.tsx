"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

const NAV = [
  { href: "/catalog", label: "Shop" },
  { href: "/how-it-works", label: "How it works" },
  { href: "/feedback", label: "Request an item" },
];

export function SiteHeader({
  storeName,
  staffLabel,
  staffHref,
}: {
  storeName: string;
  staffLabel: string;
  staffHref: string;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  return (
    <header className="sticky top-0 z-40 border-b border-line/80 bg-cream/90 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-5xl items-center gap-4 px-4">
        <Link href="/" className="flex items-center gap-2" onClick={() => setOpen(false)}>
          <span
            aria-hidden="true"
            className="grid size-8 place-items-center rounded-lg bg-brand text-sm font-bold text-white"
          >
            CS
          </span>
          <span className="text-sm font-semibold tracking-tight">{storeName}</span>
        </Link>

        <nav className="ml-auto hidden items-center gap-1 sm:flex" aria-label="Main">
          <Link
            href={staffHref}
            className="rounded-lg px-3 py-1.5 text-xs text-ink-soft transition-colors hover:text-ink"
          >
            {staffLabel}
          </Link>
          {NAV.map((item) => {
            const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={`rounded-lg px-3 py-1.5 text-sm transition-colors ${
                  active ? "bg-white font-medium text-ink" : "text-ink-soft hover:text-ink"
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>

        <button
          type="button"
          aria-label={open ? "Close menu" : "Open menu"}
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
          className="ml-auto rounded-lg p-2 text-ink-soft hover:bg-white sm:hidden"
        >
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
            {open ? (
              <path d="M5 5l10 10M15 5L5 15" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            ) : (
              <path d="M3 6h14M3 10h14M3 14h14" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            )}
          </svg>
        </button>
      </div>

      {open && (
        <nav className="border-t border-line bg-cream px-4 pb-3 sm:hidden" aria-label="Main">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setOpen(false)}
              className="block border-b border-line/60 py-3 text-sm last:border-0"
            >
              {item.label}
            </Link>
          ))}
          <Link
            href={staffHref}
            onClick={() => setOpen(false)}
            className="block py-3 text-xs text-ink-soft"
          >
            {staffLabel}
          </Link>
        </nav>
      )}
    </header>
  );
}
