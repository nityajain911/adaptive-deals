/**
 * Injectable clock. Domain code never reads the system clock; callers pass a Clock.
 * Timestamps are ISO-8601 strings with an explicit offset.
 */
export interface Clock {
  now(): string;
}

/** Anchor used by fixtures, tests, replays and demo mode. */
export const DEMO_ANCHOR = "2026-10-01T09:00:00+05:30";

export class FixedClock implements Clock {
  constructor(private readonly instant: string = DEMO_ANCHOR) {
    assertIsoTimestamp(instant);
  }
  now(): string {
    return this.instant;
  }
}

export interface ClockAdvance {
  from: string;
  to: string;
  reason: string;
  /** Always true: an advance is a staged demo action, never real elapsed time. */
  simulated: true;
}

/**
 * Demo clock: starts at the anchor and only moves through explicit, recorded advances.
 * Each advance is returned so the caller can store it in the run record.
 */
export class SimulatedClock implements Clock {
  private current: string;
  private readonly log: ClockAdvance[] = [];

  constructor(start: string = DEMO_ANCHOR, history: ClockAdvance[] = []) {
    assertIsoTimestamp(start);
    this.current = start;
    for (const a of history) this.applyAdvance(a);
  }

  now(): string {
    return this.current;
  }

  get advances(): readonly ClockAdvance[] {
    return this.log;
  }

  get isSimulated(): boolean {
    return this.log.length > 0;
  }

  advanceTo(to: string, reason: string): ClockAdvance {
    const advance: ClockAdvance = { from: this.current, to, reason, simulated: true };
    this.applyAdvance(advance);
    return advance;
  }

  private applyAdvance(a: ClockAdvance) {
    assertIsoTimestamp(a.to);
    if (Date.parse(a.to) < Date.parse(this.current)) {
      throw new Error(`Simulated clock cannot move backwards (${this.current} → ${a.to})`);
    }
    this.current = a.to;
    this.log.push(a);
  }
}

const ISO_WITH_OFFSET = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/;

export function assertIsoTimestamp(value: string): void {
  if (!ISO_WITH_OFFSET.test(value) || Number.isNaN(Date.parse(value))) {
    throw new Error(`Expected ISO timestamp with offset, got "${value}"`);
  }
}
