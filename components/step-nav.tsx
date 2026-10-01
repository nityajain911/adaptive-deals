"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cx } from "./ui";

const STEPS = [
  ["/workspace", "1", "Deal workspace"],
  ["/clarification", "2", "Clarification"],
  ["/decision", "3", "Decision"],
  ["/agreement", "4", "Agreement"],
  ["/timeline", "5", "Deal timeline"],
] as const;

export function StepNav() {
  const pathname = usePathname();
  return (
    <nav aria-label="Deal views" className="mt-5 overflow-x-auto">
      <ol className="flex min-w-max gap-1 border-b border-line">
        {STEPS.map(([href, n, label]) => {
          const active = pathname === href;
          return (
            <li key={href}>
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={cx("flex items-center gap-2 border-b-2 px-3 py-2.5 text-[14px] font-semibold", active ? "border-blue text-ink" : "border-transparent text-muted hover:text-ink")}
              >
                <span className={cx("grid h-5 w-5 place-items-center rounded-full text-[11px]", active ? "bg-blue text-white" : "bg-[#eef0f3] text-ink-2")}>{n}</span>
                {label}
              </Link>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
