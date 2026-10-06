import type { ReactNode } from "react";

export function cx(...xs: (string | false | null | undefined)[]) {
  return xs.filter(Boolean).join(" ");
}

export function Card({ children, className, as: Tag = "section", ...rest }: { children: ReactNode; className?: string; as?: "section" | "div" | "article"; "aria-labelledby"?: string; "data-testid"?: string }) {
  return (
    <Tag className={cx("rounded-[var(--radius-card)] border border-line bg-surface shadow-[var(--shadow-card)]", className)} {...rest}>
      {children}
    </Tag>
  );
}

export function CardHeader({ title, id, meta, actions }: { title: ReactNode; id?: string; meta?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3 border-b border-line px-5 py-4">
      <div className="min-w-0">
        <h2 id={id} className="text-[15px] font-semibold text-ink">
          {title}
        </h2>
        {meta ? <div className="mt-1 flex flex-wrap items-center gap-2 text-[13px] text-muted">{meta}</div> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}

export type Tone = "neutral" | "blue" | "green" | "amber" | "red" | "violet";

const TONES: Record<Tone, string> = {
  neutral: "bg-surface-muted text-ink-2 border-line",
  blue: "bg-blue-weak text-blue-ink border-[#d6defe]",
  green: "bg-green-weak text-green border-[#c9eedd]",
  amber: "bg-amber-weak text-amber border-[#f7dfb4]",
  red: "bg-red-weak text-red border-[#f6cfc9]",
  violet: "bg-violet-weak text-violet border-[#ddd5ff]",
};

export function Badge({ tone = "neutral", children, className, title }: { tone?: Tone; children: ReactNode; className?: string; title?: string }) {
  return (
    <span title={title} className={cx("inline-flex max-w-full items-center gap-1 rounded-full border px-2 py-0.5 text-[12px] font-medium leading-5", TONES[tone], className)}>
      {children}
    </span>
  );
}

/** Compact grey metadata pill, as used for dates and labels in the dashboard. */
export function Pill({ children, className, title }: { children: ReactNode; className?: string; title?: string }) {
  return (
    <span title={title} className={cx("inline-flex items-center gap-1 rounded-md bg-[#eef0f3] px-2 py-0.5 text-[12px] font-medium text-ink-2", className)}>
      {children}
    </span>
  );
}

export function Label({ kind }: { kind: "synthetic" | "simulated" | "synthetic_replay" | "replay_actual" | "live" | "test_mode" | "engine" | "ai" | "code_fallback" | "demo_buyer" }) {
  const map: Record<typeof kind, [Tone, string]> = {
    synthetic: ["neutral", "Synthetic data"],
    simulated: ["violet", "Simulated"],
    synthetic_replay: ["violet", "Synthetic replay"],
    replay_actual: ["blue", "Replay of an actual run"],
    live: ["blue", "Live model"],
    test_mode: ["amber", "Razorpay test mode"],
    engine: ["neutral", "Computed by engine"],
    ai: ["blue", "AI wording"],
    code_fallback: ["neutral", "Code wording (AI unavailable)"],
    demo_buyer: ["amber", "Demo buyer view"],
  };
  const [tone, text] = map[kind];
  return <Badge tone={tone}>{text}</Badge>;
}

export function Stat({ label, value, hint, tone }: { label: string; value: ReactNode; hint?: ReactNode; tone?: "default" | "good" | "warn" | "bad" }) {
  return (
    <div className="min-w-0 rounded-xl border border-line bg-surface px-4 py-3">
      <div className="text-[12px] font-semibold uppercase tracking-wide text-muted">{label}</div>
      <div className={cx("tabular mt-1 text-[18px] font-semibold", tone === "good" && "text-green", tone === "warn" && "text-amber", tone === "bad" && "text-red")}>{value}</div>
      {hint ? <div className="mt-0.5 text-[12px] text-muted">{hint}</div> : null}
    </div>
  );
}

export function SectionTitle({ children, meta, id }: { children: ReactNode; meta?: ReactNode; id?: string }) {
  return (
    <div className="mb-3 flex flex-wrap items-center gap-2">
      <h2 id={id} className="text-[18px] font-semibold tracking-tight text-ink">
        {children}
      </h2>
      {meta}
    </div>
  );
}

export function Table({ head, rows, caption, className, hideOnMobile = [] }: { head: ReactNode[]; rows: ReactNode[][]; caption?: string; className?: string; hideOnMobile?: number[] }) {
  const hide = (i: number) => (hideOnMobile.includes(i) ? "hidden sm:table-cell" : "");
  return (
    <div className={cx("overflow-x-auto", className)}>
      <table className={cx("tabular w-full border-collapse text-[13px]", head.length - hideOnMobile.length > 4 ? "min-w-[420px]" : head.length > 3 && "sm:min-w-[420px]")}>
        {caption ? <caption className="sr-only">{caption}</caption> : null}
        <thead>
          <tr className="border-b border-line text-left text-[12px] uppercase tracking-wide text-muted">
            {head.map((h, i) => (
              <th key={i} scope="col" className={cx("px-2 py-2 font-semibold sm:px-3", i > 0 && "text-right", hide(i))}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-b border-line last:border-0">
              {r.map((c, j) => (
                <td key={j} className={cx("px-2 py-2 align-top sm:px-3", j > 0 && "text-right", hide(j))}>
                  {c}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function Notice({ tone = "neutral", title, children }: { tone?: Tone; title?: ReactNode; children?: ReactNode }) {
  return (
    <div className={cx("rounded-xl border px-4 py-3 text-[13px]", TONES[tone])} role="note">
      {title ? <div className="font-semibold">{title}</div> : null}
      {children ? <div className={cx(title ? "mt-1" : "", "text-ink-2")}>{children}</div> : null}
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="rounded-xl border border-dashed border-line-strong px-4 py-6 text-center text-[13px] text-muted">{children}</div>;
}
