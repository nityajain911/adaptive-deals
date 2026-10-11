"use client";

import { useMemo, useState } from "react";
import { describeChangeRequest, validateChangeRequest, type ChangeRequestContext, type ChangeRequestDetail } from "@/domain/change-request";
import { formatDate } from "@/domain/dates";
import { formatINR } from "@/domain/money";
import { toPaise } from "@/lib/money-input";
import { Button, ErrorText, useAction } from "../client";
import { cx } from "../ui";

type Kind = ChangeRequestDetail["kind"];

const FIELD = "mt-1 block w-full rounded-lg border border-line-strong bg-surface px-3 py-2 text-[15px] font-normal text-ink";

/**
 * The buyer's request for a change, asked as a guided conversation. Each kind of request has its own
 * inputs (an amount, the services, a payment and a date), and the message the merchant will read is
 * built from them and shown to the buyer as their own chat bubble before it is sent.
 */
export function RequestChangeForm({
  version,
  merchantName,
  context,
  label = "Request a change",
  kinds = ["price", "scope", "date", "other"],
}: {
  version: number;
  merchantName: string;
  context: ChangeRequestContext;
  label?: string;
  kinds?: Kind[];
}) {
  const { run, pending, error } = useAction();
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<Kind | null>(null);
  const [amount, setAmount] = useState("");
  const [basis, setBasis] = useState<"including" | "excluding">("including");
  const [packageIds, setPackageIds] = useState<string[]>(context.includedIds);
  const [lineId, setLineId] = useState(context.lines.at(-1)?.id ?? "");
  const [date, setDate] = useState("");
  const [note, setNote] = useState("");

  const detail = useMemo<ChangeRequestDetail | null>(() => {
    if (kind === "price") {
      const paise = toPaise(amount);
      return paise === null ? null : { kind, targetPaise: paise, gstBasis: basis };
    }
    if (kind === "scope") return { kind, packageIds: context.services.map((s) => s.id).filter((id) => packageIds.includes(id)) };
    if (kind === "date") return date ? { kind, lineId, date } : null;
    if (kind === "other") return { kind };
    return null;
  }, [kind, amount, basis, packageIds, lineId, date, context.services]);

  const problem = detail ? validateChangeRequest(detail, context) : null;
  const noteNeeded = kind === "other" && note.trim().length < 2;
  const ready = !!detail && !problem && !noteNeeded;
  const message = detail && !problem && !noteNeeded ? describeChangeRequest(detail, note, context) : null;
  const typedSomething = kind === "price" ? amount.trim() !== "" : kind === "date" ? date !== "" : false;

  if (!open)
    return (
      <Button className="w-full" onClick={() => setOpen(true)} data-testid="request-change" aria-expanded={false}>
        {label}
      </Button>
    );

  const choose = (next: Kind) => {
    setKind(next);
    setNote("");
  };
  const labels: Record<Kind, string> = { price: "A lower price", scope: "Change what's included", date: "A different payment date", other: "Something else" };

  return (
    <form
      className="space-y-3 rounded-2xl border border-line bg-surface-muted p-3"
      data-testid="change-request-form"
      onSubmit={(e) => {
        e.preventDefault();
        if (!ready || !detail) return;
        run({ action: "request_change", version, topic: kind, text: note.trim(), detail }, () => setOpen(false));
      }}
    >
      <fieldset>
        <legend className="text-[14px] font-semibold text-ink">What would you like to change?</legend>
        <div className="mt-2 flex flex-wrap gap-2">
          {kinds.map((k) => (
            <button
              key={k}
              type="button"
              data-testid={`change-starter-${k}`}
              aria-pressed={kind === k}
              onClick={() => choose(k)}
              className={cx("rounded-full border px-3.5 py-2 text-[14px] font-medium", kind === k ? "border-blue bg-blue-weak text-ink" : "border-line-strong bg-surface text-ink hover:bg-surface-muted")}
            >
              {labels[k]}
            </button>
          ))}
        </div>
      </fieldset>

      {kind === "price" ? (
        <div className="space-y-2">
          <label className="block text-[14px] font-semibold text-ink">
            Target total (₹)
            <input className={FIELD} inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="Amount in ₹" data-testid="change-amount" autoFocus />
          </label>
          <div role="radiogroup" aria-label="GST" className="flex gap-4 text-[14px] text-ink">
            {(["including", "excluding"] as const).map((b) => (
              <label key={b} className="flex items-center gap-2">
                <input type="radio" name="gst-basis" checked={basis === b} onChange={() => setBasis(b)} data-testid={`change-gst-${b}`} />
                {b === "including" ? "Including GST" : "Excluding GST"}
              </label>
            ))}
          </div>
          <p className="text-[13px] text-ink-2">The current total is {formatINR(context.currentTotalPaise)} including GST.</p>
        </div>
      ) : null}

      {kind === "scope" ? (
        <fieldset className="space-y-1.5" data-testid="change-services">
          <legend className="text-[14px] font-semibold text-ink">What should be included?</legend>
          {context.services.map((s) => (
            <label key={s.id} className="flex items-center gap-2 text-[14px] text-ink">
              <input
                type="checkbox"
                checked={packageIds.includes(s.id)}
                onChange={(e) => setPackageIds((cur) => (e.target.checked ? [...cur, s.id] : cur.filter((id) => id !== s.id)))}
                data-testid={`change-service-${s.id}`}
              />
              {s.name}
              {context.includedIds.includes(s.id) ? <span className="text-[13px] text-muted">· in this offer</span> : null}
            </label>
          ))}
        </fieldset>
      ) : null}

      {kind === "date" ? (
        <div className="space-y-2">
          <label className="block text-[14px] font-semibold text-ink">
            Which payment?
            <select className={FIELD} value={lineId} onChange={(e) => setLineId(e.target.value)} data-testid="change-line">
              {context.lines.map((l) => (
                <option key={l.id} value={l.id}>
                  {formatDate(l.date)} · {formatINR(l.totalPaise)}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-[14px] font-semibold text-ink">
            Move it to
            <input type="date" className={FIELD} value={date} min={context.today} onChange={(e) => setDate(e.target.value)} data-testid="change-date" />
          </label>
        </div>
      ) : null}

      {kind ? (
        <label className="block text-[14px] font-semibold text-ink">
          {kind === "other" ? "What would you like changed?" : "Anything to add? (optional)"}
          <textarea className={cx(FIELD, "min-h-16")} value={note} maxLength={400} onChange={(e) => setNote(e.target.value)} data-testid="change-note" />
        </label>
      ) : null}

      {kind && problem && typedSomething ? (
        <p role="alert" className="text-[14px] text-red" data-testid="change-problem">
          {problem}
        </p>
      ) : null}

      {kind ? (
        <div aria-live="polite" className="flex justify-end">
          <div className={cx("max-w-[92%] rounded-xl rounded-tr-none px-3 py-2 text-[15px] leading-6 shadow-[0_1px_0.5px_rgba(11,20,26,0.13)]", message ? "bg-[#d9fdd3] text-ink" : "bg-surface text-muted")} data-testid="change-preview">
            {message ?? "Your message to " + merchantName + " will appear here."}
          </div>
        </div>
      ) : null}

      <p className="text-[13px] leading-5 text-ink-2">This sends your request to {merchantName}. They may reply with an updated version. Nothing changes unless you both agree.</p>
      <div className="flex gap-2">
        <Button type="submit" variant="primary" className="min-h-11 flex-1 text-[14px]" disabled={pending || !ready} data-testid="send-change-request">
          {pending ? "Sending…" : `Send to ${merchantName}`}
        </Button>
        <Button type="button" className="min-h-11 text-[14px]" onClick={() => setOpen(false)} disabled={pending}>
          Cancel
        </Button>
      </div>
      <ErrorText error={error} />
    </form>
  );
}
