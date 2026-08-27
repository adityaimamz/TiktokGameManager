import type { ReactElement } from 'react'

const LINKS = [
  { label: 'Panduan', href: 'https://github.com/adityaimamz/TiktokGameManager#readme' },
  { label: 'Dokumentasi', href: 'https://github.com/adityaimamz/TiktokGameManager/tree/main/docs' },
  { label: 'Laporkan masalah', href: 'https://github.com/adityaimamz/TiktokGameManager/issues' },
]

export function Footer(): ReactElement {
  return (
    <section className="px-1 pb-1.5 pt-0.5">
      <nav className="flex gap-4 text-[11px]">
        {LINKS.map((link) => (
          <a
            className="text-muted no-underline hover:text-signal hover:underline hover:underline-offset-[3px]"
            key={link.label}
            href={link.href}
            target="_blank"
            rel="noreferrer"
          >
            {link.label}
          </a>
        ))}
      </nav>
    </section>
  )
}
