"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition, type ReactNode } from "react";
import { BUYER_DECLINE_REASONS, type BuyerDeclineReason } from "@/lib/reason-codes";
import { authorityStatement, CHANGE_STARTERS } from "@/lib/proposal-copy";
import { cx } from "./ui";

type ActionBody = Record<string, unknown> & { action: string };

export function useAction() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const run = (body: ActionBody, after?: (result: unknown) => void) =>
    start(async () => {
      setError(null);
      try {
        const res = await fetch("/api/actions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
        const json = (await res.json()) as { ok: boolean; error?: string; result?: unknown };
        if (!json.ok) {
          setError(json.error ?? "Action failed");
          return;
        }
        after?.(json.result);
        router.refresh();
      } catch {
        setError("Network error");
      }
    });
  return { run, pending, error };
}

const BTN = {
  primary: "bg-blue text-white hover:bg-blue-ink border-blue",
  secondary: "bg-surface text-ink border-line-strong hover:bg-surface-muted",
  ghost: "bg-transparent text-blue border-transparent hover:bg-blue-weak",
  danger: "bg-surface text-red border-[#f2c4bd] hover:bg-red-weak",
  sim: "bg-violet-weak text-violet border-[#ddd5ff] hover:bg-[#e8e2ff]",
} as const;

export function Button({ variant = "secondary", className, children, ...rest }: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: keyof typeof BTN }) {
  return (
    <button {...rest} className={cx("inline-flex min-h-9 items-center justify-center gap-1.5 rounded-lg border px-3.5 text-[13px] font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50", BTN[variant], className)}>
      {children}
    </button>
  );
}

export function ErrorText({ error }: { error: string | null }) {
  if (!error) return null;
  return (
    <p role="alert" className="mt-2 text-[13px] text-red">
      {error}
    </p>
  );
}

/** A button bound to one server action. */
export function ActionButton({ body, children, variant, confirm, testId, disabled }: { body: ActionBody; children: ReactNode; variant?: keyof typeof BTN; confirm?: string; testId?: string; disabled?: boolean }) {
  const { run, pending, error } = useAction();
  return (
    <span className="inline-flex flex-col">
      <Button
        variant={variant}
        disabled={pending || disabled}
        data-testid={testId}
        onClick={() => {
          if (confirm && !window.confirm(confirm)) return;
          run(body);
        }}
      >
        {pending ? "Working…" : children}
      </Button>
      <ErrorText error={error} />
    </span>
  );
}

// ── Clarification answers ───────────────────────────────────────────────────

export interface QuestionInput {
  id: string;
  question: string;
  options: { value: string; label: string; answerText: string }[];
}

export function AnswerForm({ questions }: { questions: QuestionInput[] }) {
  const { run, pending, error } = useAction();
  const [values, setValues] = useState<Record<string, { value: string; answerText: string; via: string }>>(() => Object.fromEntries(questions.map((q) => [q.id, { value: "", answerText: "", via: "" }])));
  const complete = questions.every((q) => values[q.id].value && values[q.id].answerText.trim().length > 1 && values[q.id].via);
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        run({ action: "record_answers", answers: questions.map((q) => ({ questionId: q.id, value: values[q.id].value, answerText: values[q.id].answerText, confirmedByBuyerVia: values[q.id].via })) });
      }}
      className="space-y-4"
    >
      {questions.map((q) => (
        <fieldset key={q.id} className="rounded-xl border border-line p-4" data-testid={`answer-${q.id}`}>
          <legend className="px-1 text-[13px] font-semibold text-ink">{q.question}</legend>
          <div className="mt-2 flex flex-wrap gap-2">
            {q.options.map((o) => (
              <label key={o.value} className={cx("flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-[13px]", values[q.id].value === o.value ? "border-blue bg-blue-weak" : "border-line")}>
                <input
                  type="radio"
                  name={`${q.id}-value`}
                  value={o.value}
                  checked={values[q.id].value === o.value}
                  onChange={() => setValues((v) => ({ ...v, [q.id]: { ...v[q.id], value: o.value, answerText: o.answerText } }))}
                />
                {o.label}
              </label>
            ))}
          </div>
          <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_200px]">
            <label className="text-[12px] font-medium text-muted">
              Answer as recorded
              <input
                className="mt-1 block w-full rounded-lg border border-line-strong px-3 py-2 text-[13px] text-ink"
                value={values[q.id].answerText}
                onChange={(e) => setValues((v) => ({ ...v, [q.id]: { ...v[q.id], answerText: e.target.value } }))}
                required
              />
            </label>
            <label className="text-[12px] font-medium text-muted">
              Confirmed by buyer via
              <select
                className="mt-1 block w-full rounded-lg border border-line-strong bg-surface px-3 py-2 text-[13px] text-ink"
                value={values[q.id].via}
                onChange={(e) => setValues((v) => ({ ...v, [q.id]: { ...v[q.id], via: e.target.value } }))}
                required
              >
                <option value="">Select channel</option>
                <option value="whatsapp">WhatsApp</option>
                <option value="email">Email</option>
                <option value="call">Call</option>
              </select>
            </label>
          </div>
        </fieldset>
      ))}
      <div className="flex items-center gap-3">
        <Button variant="primary" type="submit" disabled={!complete || pending} data-testid="record-answers">
          {pending ? "Re-running engine…" : "Record answers and re-run engine"}
        </Button>
        <span className="text-[12px] text-muted">Answers are entered by the merchant and must be confirmed by the buyer.</span>
      </div>
      <ErrorText error={error} />
    </form>
  );
}

export function AcceptForm({ action, version, termsHash, authorityReason, totalPaise }: { action: "accept_agreement" | "accept_amendment"; version: number; termsHash: string; authorityReason: "phase_scope" | "required_approval" | null; totalPaise: number }) {
  const { run, pending, error } = useAction();
  const [authority, setAuthority] = useState(false);
  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        run(action === "accept_agreement" ? { action, version, termsHash, authorityConfirmed: authority } : { action, termsHash, authorityConfirmed: authority });
      }}
    >
      {authorityReason ? (
        <label className="flex items-start gap-2 text-[13px] text-ink-2">
          <input type="checkbox" className="mt-0.5" checked={authority} onChange={(e) => setAuthority(e.target.checked)} data-testid="authority" />
          <span>
            {authorityStatement(authorityReason, totalPaise).label}
            {authorityStatement(authorityReason, totalPaise).note ? <span className="block text-[12px] text-muted">{authorityStatement(authorityReason, totalPaise).note}</span> : null}
          </span>
        </label>
      ) : null}
      <Button variant="primary" type="submit" className="w-full min-h-11 text-[14px]" disabled={pending || (!!authorityReason && !authority)} data-testid="accept">
        {pending ? "Accepting…" : action === "accept_amendment" ? "Accept revised proposal" : "Accept proposal"}
      </Button>
      <p className="text-center text-[12px] text-muted">
        You accept version {version} exactly as shown (terms hash {termsHash.slice(0, 12)}…).
      </p>
      <ErrorText error={error} />
    </form>
  );
}

// ── Simulated conversation ──────────────────────────────────────────────────

// ── Buyer proposal actions ──────────────────────────────────────────────────

export function RequestChangeForm({ version }: { version: number }) {
  const { run, pending, error } = useAction();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  if (!open)
    return (
      <Button className="w-full" onClick={() => setOpen(true)} data-testid="request-change" aria-expanded={false}>
        Request a change
      </Button>
    );
  return (
    <form
      className="space-y-2 rounded-xl border border-line p-3"
      onSubmit={(e) => {
        e.preventDefault();
        run({ action: "request_change", version, text }, () => {
          setText("");
          setOpen(false);
        });
      }}
    >
      <div className="flex flex-wrap gap-2" role="group" aria-label="What would you like to change?">
        {CHANGE_STARTERS.map((c) => (
          <button key={c.id} type="button" data-testid={`change-starter-${c.id}`} onClick={() => setText(c.text)} className="rounded-full border border-line-strong bg-surface px-3 py-1.5 text-[13px] font-medium text-ink hover:bg-surface-muted">
            {c.label}
          </button>
        ))}
      </div>
      <label className="block text-[13px] font-semibold text-ink">
        What would you like changed?
        <textarea className="mt-1 block min-h-20 w-full rounded-lg border border-line-strong px-3 py-2 text-[14px] font-normal text-ink" value={text} maxLength={500} onChange={(e) => setText(e.target.value)} autoFocus />
      </label>
      <p className="text-[12px] text-muted">Your message goes to Pinecone Media Works in your conversation and refers to version {version}. The proposal itself does not change.</p>
      <div className="flex gap-2">
        <Button type="submit" variant="primary" disabled={pending || text.trim().length < 2} data-testid="send-change-request">
          {pending ? "Sending…" : "Send request"}
        </Button>
        <Button type="button" onClick={() => setOpen(false)} disabled={pending}>
          Cancel
        </Button>
      </div>
      <ErrorText error={error} />
    </form>
  );
}

export function DeclineReasonSelect({ value, onChange, disabled = false }: { value: BuyerDeclineReason | ""; onChange: (value: BuyerDeclineReason | "") => void; disabled?: boolean }) {
  return (
    <label className="block text-[12px] font-medium text-ink-2">
      Reason (optional)
      <select
        className="mt-1 block w-full rounded-lg border border-line-strong bg-surface px-3 py-2 text-[13px] text-ink"
        value={value}
        onChange={(e) => onChange(e.target.value as BuyerDeclineReason | "")}
        disabled={disabled}
        data-testid="decline-reason"
      >
        <option value="">Prefer not to say</option>
        {Object.entries(BUYER_DECLINE_REASONS).map(([code, label]) => (
          <option key={code} value={code}>
            {label}
          </option>
        ))}
      </select>
    </label>
  );
}

export function DeclineButton({ version }: { version: number }) {
  const { run, pending, error } = useAction();
  const [confirming, setConfirming] = useState(false);
  const [reason, setReason] = useState<BuyerDeclineReason | "">("");
  if (!confirming)
    return (
      <Button variant="ghost" className="w-full text-ink-2" onClick={() => setConfirming(true)} data-testid="decline">
        Decline
      </Button>
    );
  return (
    <div role="group" aria-label="Confirm decline" className="space-y-2 rounded-xl border border-[#f6cfc9] bg-red-weak p-3 text-[13px]">
      <div className="font-semibold text-ink">Decline version {version}? No payment will be set up.</div>
      <DeclineReasonSelect value={reason} onChange={setReason} disabled={pending} />
      <div className="flex gap-2">
        <Button variant="danger" onClick={() => run({ action: "decline", version, reason: reason || undefined })} disabled={pending} data-testid="confirm-decline">
          {pending ? "Declining…" : "Yes, decline"}
        </Button>
        <Button onClick={() => setConfirming(false)} disabled={pending}>
          Keep reviewing
        </Button>
      </div>
      <ErrorText error={error} />
    </div>
  );
}

// ── Merchant stages ─────────────────────────────────────────────────────────

/** The stage's single primary action (data-testid="primary-action"). */
export function PrimaryActionButton({ body, children, onDone }: { body: ActionBody; children: ReactNode; onDone?: string }) {
  const router = useRouter();
  const { run, pending, error } = useAction();
  return (
    <span className="inline-flex flex-col">
      <Button variant="primary" className="min-h-10 px-4 text-[14px]" disabled={pending} data-testid="primary-action" onClick={() => run(body, () => (onDone ? router.push(onDone) : undefined))}>
        {pending ? "Working…" : children}
      </Button>
      <ErrorText error={error} />
    </span>
  );
}

/**
 * The merchant interprets a buyer reply the code could not read. Only supported values; the
 * supporting words must be copied verbatim from the buyer's message (checked by code).
 */
export function InterpretForm({ messageId, buyerText, options, primary = false }: { messageId: string; buyerText: string; options: { value: string; label: string }[]; primary?: boolean }) {
  const { run, pending, error } = useAction();
  const [value, setValue] = useState("");
  const [quote, setQuote] = useState("");
  return (
    <form
      className="mt-2 space-y-2 rounded-xl border border-line bg-surface-muted p-3"
      data-testid={`interpret-${messageId}`}
      onSubmit={(e) => {
        e.preventDefault();
        run({ action: "interpret_reply", messageId, value, quote });
      }}
    >
      <p className="text-[13px] text-ink">
        Buyer wrote: <span className="font-medium">“{buyerText}”</span>
      </p>
      <fieldset className="flex flex-wrap gap-2">
        <legend className="sr-only">What did the buyer confirm?</legend>
        {options.map((o) => (
          <label key={o.value} className={cx("flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-1.5 text-[13px]", value === o.value ? "border-blue bg-blue-weak" : "border-line bg-surface")}>
            <input type="radio" name={`v-${messageId}`} value={o.value} checked={value === o.value} onChange={() => setValue(o.value)} />
            {o.label}
          </label>
        ))}
      </fieldset>
      <label className="block text-[12px] font-medium text-muted">
        Supporting words, copied exactly from the buyer&apos;s message
        <input className="mt-1 block w-full rounded-lg border border-line-strong bg-surface px-3 py-2 text-[13px] text-ink" value={quote} maxLength={300} onChange={(e) => setQuote(e.target.value)} />
      </label>
      <p className="text-[12px] text-muted">Code checks these words appear in the buyer&apos;s message. Whether they support the value is your judgement, and is recorded as such.</p>
      <Button type="submit" variant={primary ? "primary" : "secondary"} data-testid={primary ? "primary-action" : undefined} disabled={pending || !value || !quote.trim()}>
        {pending ? "Recording…" : "Interpret buyer's reply"}
      </Button>
      <Button type="button" variant="ghost" data-testid={`ask-again-${messageId}`} disabled={pending} onClick={() => run({ action: "ask_clarification_again", messageId })}>
        Not clear yet · ask buyer again
      </Button>
      <ErrorText error={error} />
    </form>
  );
}

/**
 * The merchant confirms which services the buyer requires when the extraction named a scope that
 * matched no package. At least one service is needed; code validates the choice again.
 */
export function ConfirmServicesForm({ packages, preselected = [], onDone }: { packages: { id: string; name: string }[]; preselected?: string[]; onDone?: string }) {
  const router = useRouter();
  const { run, pending, error } = useAction();
  const [chosen, setChosen] = useState<string[]>(preselected);
  const toggle = (id: string) => setChosen((current) => (current.includes(id) ? current.filter((x) => x !== id) : [...current, id]));
  return (
    <form
      className="mt-3 space-y-3"
      data-testid="confirm-services"
      onSubmit={(e) => {
        e.preventDefault();
        run({ action: "confirm_required_services", packageIds: chosen }, () => (onDone ? router.push(onDone) : undefined));
      }}
    >
      <fieldset className="grid gap-2 sm:grid-cols-2">
        <legend className="sr-only">Services the buyer requires</legend>
        {packages.map((p) => (
          <label key={p.id} className={cx("flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-[13px]", chosen.includes(p.id) ? "border-blue bg-blue-weak" : "border-line bg-surface")}>
            <input type="checkbox" name="service" value={p.id} checked={chosen.includes(p.id)} onChange={() => toggle(p.id)} data-testid={`service-${p.id}`} />
            {p.name}
          </label>
        ))}
      </fieldset>
      <Button type="submit" variant="primary" className="min-h-10 px-4 text-[14px]" data-testid="primary-action" disabled={pending || chosen.length === 0}>
        {pending ? "Confirming…" : "Confirm required services"}
      </Button>
      <ErrorText error={error} />
    </form>
  );
}

/** Opens a collapsed card (<details id=…>) and scrolls to it. Used as the Track Now card's primary action. */
export function RevealButton({ targetId, children }: { targetId: string; children: ReactNode }) {
  return (
    <Button
      variant="primary"
      className="min-h-10 px-4 text-[14px]"
      data-testid="primary-action"
      onClick={() => {
        const el = document.getElementById(targetId);
        if (el instanceof HTMLDetailsElement) el.open = true;
        el?.scrollIntoView({ behavior: "smooth", block: "start" });
        el?.querySelector<HTMLElement>("summary, button, a")?.focus();
      }}
    >
      {children}
    </Button>
  );
}

/** Records that the merchant handled a buyer message outside the prototype. Changes nothing else. */
export function MarkHandledForm({ messageId }: { messageId: string }) {
  const { run, pending, error } = useAction();
  const [note, setNote] = useState("");
  return (
    <form
      className="mt-2 flex flex-wrap items-end gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        run({ action: "mark_message_handled", messageId, note: note.trim() || undefined });
      }}
    >
      <label className="min-w-[200px] flex-1 text-[12px] font-medium text-muted">
        Handling note (optional)
        <input className="mt-1 block w-full rounded-lg border border-line-strong px-3 py-1.5 text-[13px] text-ink" value={note} maxLength={300} onChange={(e) => setNote(e.target.value)} />
      </label>
      <Button type="submit" disabled={pending} data-testid={`mark-handled-${messageId}`}>
        {pending ? "Saving…" : "Mark as handled"}
      </Button>
      <ErrorText error={error} />
    </form>
  );
}

/** Bounded merchant decisions for one unresolved buyer work item. None changes terms or payments. */
export function ReviewWorkForm({ sourceKind, sourceId }: { sourceKind: "message" | "change_request"; sourceId: string }) {
  const { run, pending, error } = useAction();
  const [note, setNote] = useState("");
  const send = (disposition: "keep_current_terms" | "handled_outside" | "follow_up_pending") =>
    run({ action: "review_work", sourceKind, sourceId, disposition, note: note.trim() || undefined });
  return (
    <div className="mt-3 space-y-2">
      <label className="block text-[12px] font-medium text-muted">
        Decision note (optional)
        <input className="mt-1 block w-full rounded-lg border border-line-strong px-3 py-1.5 text-[13px] text-ink" value={note} maxLength={300} onChange={(e) => setNote(e.target.value)} />
      </label>
      <div className="flex flex-wrap gap-2">
        <Button variant="primary" disabled={pending} onClick={() => send("keep_current_terms")} data-testid={`keep-current-${sourceId}`}>
          Keep current terms
        </Button>
        <Button disabled={pending} onClick={() => send("handled_outside")} data-testid={`handled-outside-${sourceId}`}>
          Handle outside Adaptive Deals
        </Button>
        <Button disabled={pending} onClick={() => send("follow_up_pending")} data-testid={`follow-up-${sourceId}`}>
          Follow-up still pending
        </Button>
      </div>
      <ErrorText error={error} />
    </div>
  );
}
