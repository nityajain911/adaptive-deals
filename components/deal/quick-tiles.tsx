import Link from "next/link";
import { CreditCard, FileText, Wallet, type LucideIcon } from "lucide-react";

export interface QuickTile {
  href: string;
  label: string;
  hint?: string;
  icon: "prices" | "deal" | "payments";
  testId: string;
}

const ICONS: Record<QuickTile["icon"], LucideIcon> = { prices: Wallet, deal: FileText, payments: CreditCard };

/**
 * Shortcuts in the style of "Recommended for you" on the Razorpay home: white tiles, a blue icon and a
 * blue label. Each tile is a plain link, so nothing here changes anything.
 */
export function QuickTiles({ tiles }: { tiles: QuickTile[] }) {
  return (
    <nav aria-label="Shortcuts" data-testid="quick-tiles">
      <h2 className="text-[13px] font-semibold uppercase tracking-wide text-muted">Jump to</h2>
      <ul className="mt-2 flex flex-wrap gap-3">
        {tiles.map((tile) => {
          const Icon = ICONS[tile.icon];
          return (
            <li key={tile.testId}>
              <Link
                href={tile.href}
                data-testid={tile.testId}
                className="group flex min-w-[148px] flex-col gap-2 rounded-xl border border-line bg-surface px-4 py-3 shadow-[var(--shadow-card)] transition hover:-translate-y-0.5 hover:border-[#c7d3ff] hover:shadow-[0_6px_18px_rgba(45,91,255,0.12)]"
              >
                <Icon aria-hidden className="h-5 w-5 text-blue" />
                <span className="text-[15px] font-semibold text-blue">{tile.label}</span>
                {tile.hint ? <span className="text-[12px] text-muted">{tile.hint}</span> : null}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
