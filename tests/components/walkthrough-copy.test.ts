import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { describe, expect, it, vi } from "vitest";

// The presenter frame reads stored state on the server; this file only renders the header around it.
vi.mock("@/components/presenter/presenter-frame", () => ({ PresenterFrame: () => null }));
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
      notice: "Groq structures the conversation; code preserves uncertainty.",
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
    productLabel: "Send 2 questions to buyer",
  },
  terminalOutcome: null,
  provenance: "recorded_model",
  provenanceLabel: "Recorded Groq output",
  stepLabel: "Step 2 of 6",
  subSteps: null,
  finish: null,
};

describe("buildathon walkthrough presentation", () => {
  const base = { primaryDisabled: false, onPrimary: () => undefined, onBack: () => undefined, onNext: () => undefined, onHide: () => undefined, onRestart: () => undefined };

  it("shows one focused value sentence, action and source disclosure", () => {
    const html = renderToStaticMarkup(createElement(WalkthroughProgress, { ...base, view, displayedObjectiveId: "understand_buyer", primaryLabel: null, yourTurn: { who: "merchant", label: "Send 2 questions to buyer" }, onShowMe: () => undefined }));
    expect(html).toContain("GUIDE · STEP 2 OF 2");
    expect(html).toContain("STEP 2 OF 2");
    expect(html).toContain("Understand the buyer");
    expect(html).toContain("Review the extracted constraints and evidence.");
    expect(html).not.toContain("What to notice");
    expect(html).toContain("Under the hood");
    expect(html).toContain("AI analysis");
    expect(html).toContain("Recorded Groq output");
    expect(html).not.toMatch(/₹|contribution|invoice_[A-Za-z0-9]|model confidence/i);
  });

  it("never offers a guide button for a merchant decision: it names the product's button and offers Show me", () => {
    const html = renderToStaticMarkup(createElement(WalkthroughProgress, { ...base, view, displayedObjectiveId: "understand_buyer", primaryLabel: null, yourTurn: { who: "merchant", label: "Send 2 questions to buyer" }, onShowMe: () => undefined }));
    expect(html).not.toContain("Complete this in the product");
    expect(html).not.toContain("data-walkthrough-primary");
    expect(html).toContain('data-testid="walkthrough-your-turn"');
    expect(html).toContain("Your turn");
    expect(html).toContain("“Send 2 questions to buyer”");
    expect(html).toContain("Show me");
    // A merchant action needs no simulation label.
    expect(html).not.toContain("walkthrough-consequence");
  });

  it("tells the person to play the buyer, on the buyer's page", () => {
    const html = renderToStaticMarkup(createElement(WalkthroughProgress, { ...base, view, displayedObjectiveId: "understand_buyer", primaryLabel: null, yourTurn: { who: "buyer", label: "Accept proposal" }, onShowMe: () => undefined }));
    expect(html).toContain("Play the buyer");
    expect(html).toContain("“Accept proposal”");
    expect(html).toContain("on the buyer&#x27;s page");
  });

  it("keeps stage substeps out of the focused walkthrough panel", () => {
    const withSteps: WalkthroughView = { ...view, subSteps: [{ label: "Send the questions", state: "done" }, { label: "Buyer answers", state: "current" }, { label: "Use the answers", state: "todo" }] };
    const html = renderToStaticMarkup(createElement(WalkthroughProgress, { ...base, view: withSteps, displayedObjectiveId: "understand_buyer", primaryLabel: null }));
    expect(html).not.toContain('aria-label="Actions in this step"');
    expect(html).not.toContain("Send the questions");
    expect(html).not.toContain("Buyer answers");
    expect(html).not.toContain("Use the answers");
  });

  it("ends with a summary and a way to try another case, and no further action", () => {
    const done: WalkthroughView = { ...view, currentAction: null, finish: { title: "Walkthrough complete", lines: ["You walked through: A case.", "Your decisions: approved version 1."] } };
    const html = renderToStaticMarkup(createElement(WalkthroughProgress, { ...base, view: done, displayedObjectiveId: "understand_buyer", primaryLabel: null }));
    expect(html).toContain('data-testid="walkthrough-finish"');
    expect(html).toContain("Walkthrough complete");
    expect(html).toContain("Your decisions: approved version 1.");
    expect(html).toMatch(/href="\/deals"[^>]*>Try another case/);
    expect(html).not.toContain("walkthrough-your-turn");
    expect(html).not.toContain("data-walkthrough-primary");
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

  it("makes a simulation visibly different from a product action: violet, and labelled before it runs", () => {
    const html = renderToStaticMarkup(createElement(WalkthroughProgress, { ...base, view: { ...view, currentAction: { ...view.currentAction!, type: "system", systemAction: "pay_upfront_link", label: "Simulate: buyer pays the upfront link", consequence: "Simulated system event · buyer pays the upfront link", productLabel: null } }, displayedObjectiveId: "understand_buyer", primaryLabel: "Simulate: buyer pays the upfront link", primaryTone: "simulate" }));
    expect(html).toMatch(/data-walkthrough-primary="true"[^>]*class="[^"]*bg-violet-weak[^"]*"[^>]*>.*?Next step.*?Simulate: buyer pays the upfront link/s);
    expect(html).toContain("Simulated system event");
  });

  it("keeps reviewer tools out of the merchant header, and the SIMULATED pill in it", () => {
    const html = renderToStaticMarkup(createElement(MerchantHeader));
    expect(html).not.toContain("For reviewers");
    expect(html).not.toContain("Presenter page");
    expect(html).toContain("SIMULATED");
  });

  it("is one big Next step button that says what it will do, in the dark guide pane", () => {
    const html = renderToStaticMarkup(createElement(WalkthroughProgress, { ...base, view, displayedObjectiveId: "choose_case", primaryLabel: "Take me there" }));
    expect(html).toMatch(/data-walkthrough-primary="true"[^>]*>.*?Next step.*?Take me there/s);
    expect(html).toContain("bg-[#0b1b3f]");
    expect(html.match(/data-walkthrough-primary/g)).toHaveLength(1);
  });

  it("points at a merchant's own button from the same big button, and never offers to click it", () => {
    const html = renderToStaticMarkup(createElement(WalkthroughProgress, { ...base, view, displayedObjectiveId: "understand_buyer", primaryLabel: null, yourTurn: { who: "merchant", label: "Send 2 questions to buyer" }, onShowMe: () => undefined }));
    expect(html).toMatch(/data-walkthrough-show="true"[^>]*>.*?Next step.*?Show me where to click/s);
    expect(html).not.toContain("data-walkthrough-primary");
    expect(html).toContain("The guide never clicks it for you");
  });

  it("makes Restart and Hide quiet text links, and says what produced the step", () => {
    const html = renderToStaticMarkup(createElement(WalkthroughProgress, { ...base, view, displayedObjectiveId: "understand_buyer", primaryLabel: null }));
    expect(html).toMatch(/underline[^>]*>.*?Hide/s);
    expect(html).toContain("Restart");
    expect(html).toContain("A model proposed this, as words and quotes only");
    expect(html).not.toMatch(/vector/i);
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
        productLabel: null,
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
    expect(html).toContain("AI analysis");
    expect(html).toContain("Simulated system event · buyer pays the upfront link");
  });
});

describe("a hand-written sample in the walkthrough", () => {
  it("shows the sample label and actor, with no AI or Groq wording", () => {
    const sampleView: WalkthroughView = {
      ...view,
      objectives: view.objectives.map((objective) => (objective.id === "understand_buyer" ? { ...objective, actor: "sample", notice: "The structured constraints in this case are sample output written by hand; no model ran." } : objective)),
      currentAction: null,
      provenance: "synthetic_replay",
      provenanceLabel: "Sample output written by hand · no model ran",
    };
    const html = renderToStaticMarkup(createElement(WalkthroughProgress, {
      view: sampleView,
      displayedObjectiveId: "understand_buyer",
      primaryLabel: null,
      primaryDisabled: false,
      onPrimary: () => undefined,
      onBack: () => undefined,
      onNext: () => undefined,
      onHide: () => undefined,
      onRestart: () => undefined,
    }));
    expect(html).toContain("Sample analysis · written by hand");
    expect(html).toContain("Sample output written by hand · no model ran");
    expect(html).not.toMatch(/\bAI\b|Groq/);
  });
});
