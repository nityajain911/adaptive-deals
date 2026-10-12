import { describe, expect, it } from "vitest";
import { commercialMemoryForDeal } from "@/lib/commercial-memory-view";

describe("Commercial Memory deal evidence", () => {
  it("returns dated buyer history and exact merchant evidence for requested services", () => {
    const view = commercialMemoryForDeal({ merchantId: "merchant-pinecone", buyerId: "buyer-harbour-fresh", asOf: "2026-10-08", serviceIds: ["website-fixes", "search-marketing"] });
    expect(view.history).toMatchObject({ sourceTitle: "Harbour Fresh purchase history", effectiveFrom: "2026-06-12" });
    expect(view.history?.quote).toContain("purchased website maintenance as a separate service");
    expect(view.merchantEvidence).toEqual(expect.arrayContaining([
      expect.objectContaining({ serviceId: "website-fixes", kind: "price", quote: "Website fixes,24000,one time" }),
      expect.objectContaining({ serviceId: "website-fixes", kind: "cost", quote: "Website fixes,12000,start of delivery month" }),
      expect.objectContaining({ serviceId: "search-marketing", kind: "price" }),
      expect.objectContaining({ serviceId: "search-marketing", kind: "cost" }),
    ]));
    expect(view.merchantEvidence.every((item) => item.sourceId !== "source-saffron-rate-card")).toBe(true);
  });

  it("does not return Harbour Fresh history for another buyer", () => {
    const view = commercialMemoryForDeal({ merchantId: "merchant-pinecone", buyerId: "buyer-northstar", asOf: "2026-10-08", serviceIds: ["website-fixes"] });
    expect(view.history).toBeNull();
  });
});
