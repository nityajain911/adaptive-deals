import { STRATEGY_LABEL, type StrategyId } from "@/domain/strategy";

/** A shared outcome is a computed tie, rather than a reason to alter the price. */
export function priorityResultNote(rows: { id: StrategyId; leaderId: string | null }[], current: StrategyId): string | null {
  const leader = rows.find((row) => row.id === current)?.leaderId;
  if (!leader) return null;
  const matches = rows.filter((row) => row.leaderId === leader);
  if (matches.length === 4) return "All four priorities lead to the same offer for this deal. Its price and payment schedule stay the same.";
  const others = matches.filter((row) => row.id !== current);
  return others.length ? `This offer also leads for ${others.map((row) => STRATEGY_LABEL[row.id]).join(" and ")}.` : null;
}
