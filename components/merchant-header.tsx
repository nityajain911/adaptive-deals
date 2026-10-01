import { Handshake } from "lucide-react";

/** Razorpay-style dark dashboard header for the merchant views only. */
export function MerchantHeader() {
  return (
    <header className="bg-header text-white">
      <div className="mx-auto flex h-14 max-w-[1440px] items-center gap-6 px-4 sm:px-6">
        <span className="text-[19px] font-extrabold italic tracking-tight" aria-label="Razorpay">
          <span className="text-[#3d6bff]">/</span>Razorpay
        </span>
        <nav aria-label="Products" className="flex h-full items-center">
          <span aria-current="page" className="relative flex h-full items-center gap-1.5 px-1 text-[14px] font-semibold text-white">
            <Handshake aria-hidden className="h-4 w-4" />
            Adaptive Deals
            <span aria-hidden className="absolute inset-x-0 bottom-0 h-[3px] rounded-t bg-[#3d6bff] shadow-[0_0_14px_#3d6bff]" />
          </span>
        </nav>
        <div className="ml-auto flex items-center gap-3">
          <span className="hidden rounded-md border border-white/20 px-2 py-0.5 text-[12px] font-medium text-white/80 sm:inline">Prototype · synthetic data</span>
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-[#1d1d1f] text-[12px] font-bold" title="Pinecone Media Works (fictional merchant)" aria-label="Merchant: Pinecone Media Works (fictional)">
            PM
          </span>
        </div>
      </div>
    </header>
  );
}
