import type { ReactNode } from "react";
import { ActionButton } from "../client";
import { cx } from "../ui";

interface Card {
  tone: "blue" | "green" | "red";
  label: string;
  title: string;
  body: string;
  actions: { event: string; label: string; testId?: string }[];
}

const CARDS: Card[] = [
  { tone: "blue", label: "Payment events", title: "The buyer pays and sets up auto-pay", body: "The upfront link is paid, then the mandate is confirmed. The deal moves to collecting.", actions: [{ event: "payment_link_paid", label: "Simulate: upfront link paid" }, { event: "mandate_confirmed", label: "Simulate: mandate confirmed" }] },
  { tone: "green", label: "Preventive path", title: "A payment is coming up and the buyer asks for time", body: "Send the advance notice (this moves the demo date), or let the next debit succeed on its due date.", actions: [{ event: "advance_notice", label: "Simulate: send the scheduled notice" }, { event: "debit_succeeded", label: "Simulate: next debit succeeds" }] },
  { tone: "red", label: "After a failure", title: "A debit fails and the buyer replies", body: "The 1 Dec debit fails and an internal retry is scheduled. The amendment is then recorded as after a failed debit, not preventive.", actions: [{ event: "debit_failed", label: "Simulate: failed debit", testId: "presenter-debit-failed" }, { event: "buyer_reply", label: "Simulate: buyer replies" }] },
];

const TONE: Record<Card["tone"], { band: string; chip: string }> = {
  blue: { band: "border-t-[#2d5bff]", chip: "bg-blue-weak text-blue-ink" },
  green: { band: "border-t-green", chip: "bg-green-weak text-green" },
  red: { band: "border-t-red", chip: "bg-red-weak text-red" },
};

/**
 * Large, colour-coded scenario cards for switching between demo situations. The colour is only a cue: every card
 * also says in words which situation it is, and every control is labelled as simulated.
 */
export function ScenarioCards({ children }: { children?: ReactNode }) {
  return (
    <div data-testid="scenario-cards">
      <ul className="grid grid-cols-1 gap-3 lg:grid-cols-3">
        {CARDS.map((card) => (
          <li key={card.label} className={cx("flex flex-col rounded-2xl border border-line border-t-4 bg-surface p-4 shadow-[var(--shadow-card)]", TONE[card.tone].band)} data-testid={`scenario-card-${card.tone}`}>
            <span className={cx("w-fit rounded-full px-2.5 py-1 text-[12px] font-bold", TONE[card.tone].chip)}>{card.label}</span>
            <h3 className="mt-2 text-[16px] font-semibold text-ink">{card.title}</h3>
            <p className="mt-1 flex-1 text-[13px] leading-5 text-ink-2">{card.body}</p>
            <div className="mt-3 flex flex-col items-stretch gap-2 [&_button]:min-h-11 [&_button]:w-full [&_span]:w-full">
              {card.actions.map((action) => <ActionButton key={action.event} body={{ action: "simulate", event: action.event }} variant="sim" testId={action.testId}>{action.label}</ActionButton>)}
            </div>
          </li>
        ))}
      </ul>
      {children}
    </div>
  );
}
