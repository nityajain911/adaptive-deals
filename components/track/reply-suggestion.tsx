"use client";

import { Button, ErrorText, useAction } from "../client";

/**
 * A suggested reading of a reply the rules could not read. It is only a suggestion: nothing moves until the merchant uses
 * it, and they can ignore it and handle the reply as before.
 */
export function ReplySuggestionBlock({ messageId, phrase, until, earliest }: { messageId: string; phrase: string; until: string; earliest: string }) {
  const use = useAction();
  const ignore = useAction();
  return (
    <div className="mt-2 rounded-lg border border-[#c7d3ff] bg-blue-weak/40 px-3 py-2" data-testid={`reply-suggestion-${messageId}`}>
      <p className="text-[13px] text-ink">
        <span className="font-semibold">Suggested reading:</span> unavailable until {until}, from “{phrase}”. The earliest debit would be {earliest}.
      </p>
      <div className="mt-2 flex flex-wrap gap-2">
        <Button variant="primary" disabled={use.pending || ignore.pending} data-testid={`use-suggestion-${messageId}`} onClick={() => use.run({ action: "use_reply_suggestion", messageId })}>
          Use this date
        </Button>
        <Button disabled={use.pending || ignore.pending} data-testid={`ignore-suggestion-${messageId}`} onClick={() => ignore.run({ action: "ignore_reply_suggestion", messageId })}>
          Ignore
        </Button>
      </div>
      <ErrorText error={use.error ?? ignore.error} />
    </div>
  );
}
