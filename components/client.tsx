"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition, type ReactNode } from "react";
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

export function DemoGuideButton({ href }: { href: string }) {
  const router = useRouter();
  const { run, pending, error } = useAction();
  return (
    <span className="inline-flex flex-col">
      <Button variant="primary" data-testid="demo-next" disabled={pending} onClick={() => run({ action: "demo_next" }, () => router.push(href))}>
        {pending ? "Working…" : "Do this step"}
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

// ── Approve and send ────────────────────────────────────────────────────────

export function ApproveAndSend({ structureId, label }: { structureId: string; label: string }) {
  const router = useRouter();
  const { run, pending, error } = useAction();
  const [draft, setDraft] = useState<{ version: number; termsHash: string } | null>(null);
  if (!draft)
    return (
      <span className="inline-flex flex-col">
        <Button variant="primary" disabled={pending} data-testid={`prepare-${structureId}`} onClick={() => run({ action: "prepare_agreement", structureId }, (r) => setDraft(r as { version: number; termsHash: string }))}>
          {pending ? "Preparing…" : "Approve and send"}
        </Button>
        <ErrorText error={error} />
      </span>
    );
  return (
    <div role="dialog" aria-label="Confirm approval" className="w-full rounded-xl border border-blue bg-blue-weak p-4 text-[13px]">
      <div className="font-semibold text-ink">Approve version {draft.version} and send to the buyer?</div>
      <div className="mt-1 text-ink-2">{label}</div>
      <div className="mt-2 break-all font-mono text-[12px] text-ink-2" data-testid="draft-hash">
        Terms hash (SHA-256): {draft.termsHash}
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button variant="primary" disabled={pending} data-testid="confirm-approve" onClick={() => run({ action: "approve_and_send", version: draft.version, termsHash: draft.termsHash }, () => router.push("/agreement"))}>
          {pending ? "Approving…" : "Approve this exact version"}
        </Button>
        <Button onClick={() => setDraft(null)} disabled={pending}>
          Cancel
        </Button>
      </div>
      <ErrorText error={error} />
    </div>
  );
}

export function AcceptForm({ action, version, termsHash, needsAuthority }: { action: "accept_agreement" | "accept_amendment"; version: number; termsHash: string; needsAuthority: boolean }) {
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
      {needsAuthority ? (
        <label className="flex items-start gap-2 text-[13px] text-ink-2">
          <input type="checkbox" className="mt-0.5" checked={authority} onChange={(e) => setAuthority(e.target.checked)} data-testid="authority" />
          <span>I confirm I am authorised to purchase this scope on its own. It is a separate purchase with its own value, not part of a larger purchase split to avoid approval.</span>
        </label>
      ) : null}
      <Button variant="primary" type="submit" className="w-full min-h-11 text-[14px]" disabled={pending || (needsAuthority && !authority)} data-testid="accept">
        {pending ? "Accepting…" : action === "accept_amendment" ? "Accept revised proposal" : "Accept proposal"}
      </Button>
      <p className="text-center text-[11px] text-muted">
        You accept version {version} exactly as shown (terms hash {termsHash.slice(0, 12)}…).
      </p>
      <ErrorText error={error} />
    </form>
  );
}

// ── Simulated conversation ──────────────────────────────────────────────────

/** A typed simulated buyer reply. It goes through the same code rules as scripted replies. */
export function TypedReply({ targets }: { targets: { id: string; label: string }[] }) {
  const { run, pending, error } = useAction();
  // Targets change as messages are sent. Keep an explicit choice only while it is still a valid
  // target; otherwise fall back to the latest one, so the shown option and the submitted id agree.
  const [chosen, setChosen] = useState<string | null>(null);
  const [text, setText] = useState("");
  const to = chosen && targets.some((t) => t.id === chosen) ? chosen : (targets.at(-1)?.id ?? "");
  if (!targets.length) return null;
  return (
    <form
      className="mt-4 rounded-xl border border-dashed border-[#ddd5ff] bg-violet-weak/40 p-3"
      data-testid="typed-reply"
      onSubmit={(e) => {
        e.preventDefault();
        run({ action: "buyer_reply_typed", inReplyTo: to, text }, () => setText(""));
      }}
    >
      <div className="text-[12px] font-semibold text-violet">Type a simulated buyer reply</div>
      <p className="mt-0.5 text-[12px] text-ink-2">Read by the same code rules as the scripted replies (reply-rules.v1). No AI reads it, in replay or after Run live.</p>
      <div className="mt-2 grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
        <label className="text-[12px] font-medium text-muted sm:col-span-2">
          In reply to
          <select className="mt-1 block w-full rounded-lg border border-line-strong bg-surface px-2 py-2 text-[13px] text-ink" value={to} onChange={(e) => setChosen(e.target.value)}>
            {targets.map((t) => (
              <option key={t.id} value={t.id}>
                {t.label}
              </option>
            ))}
          </select>
        </label>
        <label className="text-[12px] font-medium text-muted">
          Buyer message
          <input className="mt-1 block w-full rounded-lg border border-line-strong bg-surface px-3 py-2 text-[13px] text-ink" value={text} maxLength={500} onChange={(e) => setText(e.target.value)} placeholder="e.g. Cash is tight till the 20th." />
        </label>
        <Button type="submit" variant="sim" className="self-end" disabled={pending || !text.trim() || !targets.some((t) => t.id === to)}>
          {pending ? "Sending…" : "Send as buyer"}
        </Button>
      </div>
      <ErrorText error={error} />
    </form>
  );
}

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

export function DeclineButton({ version }: { version: number }) {
  const { run, pending, error } = useAction();
  const [confirming, setConfirming] = useState(false);
  if (!confirming)
    return (
      <Button variant="ghost" className="w-full text-ink-2" onClick={() => setConfirming(true)} data-testid="decline">
        Decline
      </Button>
    );
  return (
    <div role="group" aria-label="Confirm decline" className="space-y-2 rounded-xl border border-[#f6cfc9] bg-red-weak p-3 text-[13px]">
      <div className="font-semibold text-ink">Decline version {version}? No payment will be set up.</div>
      <div className="flex gap-2">
        <Button variant="danger" onClick={() => run({ action: "decline", version })} disabled={pending} data-testid="confirm-decline">
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

// ── Applied merchant rules drawer ───────────────────────────────────────────

const OPEN_RULE = "adaptive-deals:open-rule";

/** Opens the rules drawer at one rule. Used next to each seller-side rejection. */
export function RuleLink({ ruleId, children }: { ruleId: string; children: ReactNode }) {
  return (
    <button type="button" className="font-semibold text-blue underline-offset-2 hover:underline" onClick={() => window.dispatchEvent(new CustomEvent(OPEN_RULE, { detail: ruleId }))}>
      {children}
    </button>
  );
}

/** A right-side drawer built on the native modal dialog (focus trap, Escape to close). */
export function RulesDrawer({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  const [focusRule, setFocusRule] = useState<string | null>(null);
  useEffect(() => {
    const onOpen = (e: Event) => {
      setFocusRule((e as CustomEvent<string>).detail ?? null);
      ref.current?.showModal();
    };
    window.addEventListener(OPEN_RULE, onOpen);
    return () => window.removeEventListener(OPEN_RULE, onOpen);
  }, []);
  useEffect(() => {
    if (!focusRule) return;
    const el = ref.current?.querySelector<HTMLElement>(`[data-rule="${focusRule}"]`);
    el?.focus();
    el?.scrollIntoView({ block: "center" });
  }, [focusRule]);
  return (
    <>
      <Button
        onClick={() => {
          setFocusRule(null);
          ref.current?.showModal();
        }}
        data-testid="open-rules"
        aria-haspopup="dialog"
      >
        Applied merchant rules
      </Button>
      <dialog
        ref={ref}
        aria-labelledby="rules-title"
        data-testid="rules-drawer"
        className="rules-drawer m-0 ml-auto h-full max-h-none w-full max-w-[440px] border-l border-line bg-surface p-0 text-ink shadow-2xl backdrop:bg-black/30"
        onClose={() => setFocusRule(null)}
        onClick={(e) => {
          if (e.target === ref.current) ref.current?.close();
        }}
      >
        <div className="flex items-center justify-between border-b border-line px-5 py-4">
          <h2 id="rules-title" className="text-[16px] font-semibold">
            Applied merchant rules
          </h2>
          <Button variant="ghost" onClick={() => ref.current?.close()} aria-label="Close applied merchant rules">
            Close
          </Button>
        </div>
        <div className="space-y-3 p-5" data-focus-rule={focusRule ?? undefined}>
          {children}
        </div>
      </dialog>
    </>
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
      <ErrorText error={error} />
    </form>
  );
}
