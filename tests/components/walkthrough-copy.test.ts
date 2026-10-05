import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { describe, expect, it } from "vitest";
import { MerchantHeader } from "@/components/merchant-header";
import { WalkthroughProgress } from "@/components/walkthrough/walkthrough-progress";
import type { WalkthroughView } from "@/lib/walkthrough";

const view: WalkthroughView = {
  version: "buildathon.v1",
  objectives: [
    {
      id: "choose_case",
      actor: "merchant",
      title: "Choose a buyer situation",
      instruction: "Choose one case to start the walkthrough.",
      notice: "Different buyer constraints lead to different commercial decisions.",
      href: "/deals",
      anchorId: "case-picker",
      optional: false,
      capability: "case_picker",
    },
    {
      id: "understand_buyer",
      actor: "ai",
      title: "Understand the buyer",
      instruction: "Review the extracted constraints and evidence.",
      notice: "AI structures the conversation; code preserves uncertainty.",
      href: "/deals/hero/understand",
      anchorId: "buyer-conversation",
      optional: false,
      capability: "current_offer",
    },
  ],
  currentObjectiveId: "understand_buyer",
  completedObjectiveIds: ["choose_case"],
  currentAction: {
    id: "send_questions",
    actor: "merchant",
    type: "merchant",
    label: "Send questions",
    href: "/deals/hero/understand",
    systemAction: null,
    usesReplyControl: false,
    consequence: "Merchant action · send questions",
  },
  terminalOutcome: null,
  provenance: "live_groq_replay",
  stepLabel: "Step 2 of 4",
};

describe("buildathon walkthrough presentation", () => {
  it("shows one focused instruction, actor and trust explanation", () => {
    const html = renderToStaticMarkup(createElement(WalkthroughProgress, {
      view,
      displayedObjectiveId: "understand_buyer",
      primaryLabel: "Complete this in the product",
      primaryDisabled: false,
      onPrimary: () => undefined,
      onBack: () => undefined,
      onNext: () => undefined,
      onHide: () => undefined,
      onRestart: () => undefined,
    }));
    expect(html).toContain("DEMO WALKTHROUGH");
    expect(html).toContain("STEP 2 OF 2");
    expect(html).toContain("Understand the buyer");
    expect(html).toContain("Review the extracted constraints and evidence.");
    expect(html).toContain("What to notice");
    expect(html).toContain("Merchant action");
    expect(html.match(/data-walkthrough-primary=/g)).toHaveLength(1);
    expect(html).not.toMatch(/₹|contribution|invoice_[A-Za-z0-9]|model confidence/i);
  });

  it("declares an anchor for every enabled objective", () => {
    expect(view.objectives.every((objective) => objective.anchorId.length > 0)).toBe(true);
    expect(view.objectives.map((objective) => objective.anchorId)).toEqual(["case-picker", "buyer-conversation"]);
  });

  it("shows the reviewed explanation's position without rewinding deal progress", () => {
    const html = renderToStaticMarkup(createElement(WalkthroughProgress, {
      view,
      displayedObjectiveId: "choose_case",
      primaryLabel: "Take me there",
      primaryDisabled: false,
      onPrimary: () => undefined,
      onBack: () => undefined,
      onNext: () => undefined,
      onHide: () => undefined,
      onRestart: () => undefined,
    }));
    expect(html).toContain("STEP 1 OF 2");
    expect(html).toContain("Choose a buyer situation");
    expect(html).not.toContain("Replay of an actual Groq run");
  });

  it("keeps the walkthrough permanently reachable from the merchant header", () => {
    expect(renderToStaticMarkup(createElement(MerchantHeader))).toContain("Walkthrough");
  });

  it("states the actor and consequence before a simulation control", () => {
    const systemView: WalkthroughView = {
      ...view,
      currentAction: {
        id: "pay_upfront_link",
        actor: "system",
        type: "system",
        label: "Simulate: buyer pays the upfront link",
        href: "/deals/hero/track",
        systemAction: "pay_upfront_link",
        usesReplyControl: false,
        consequence: "Simulated system event · buyer pays the upfront link",
      },
    };
    const html = renderToStaticMarkup(createElement(WalkthroughProgress, {
      view: systemView,
      displayedObjectiveId: systemView.currentObjectiveId,
      primaryLabel: "Run simulated event",
      primaryDisabled: false,
      onPrimary: () => undefined,
      onBack: () => undefined,
      onNext: () => undefined,
      onHide: () => undefined,
      onRestart: () => undefined,
    }));
    expect(html).toContain("Simulated system action");
    expect(html).toContain("Simulated system event · buyer pays the upfront link");
  });
});
