import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({ variable: "--font-inter", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Adaptive Deals · Razorpay (prototype)",
  description: "Prototype for the Razorpay × ISB AI PM Build Challenge. Synthetic data; simulated and test-mode payments only.",
};

/**
 * Root layout: document shell only. The merchant dashboard chrome lives in app/(deal)/layout.tsx;
 * the buyer proposal has its own clean layout in app/proposal/layout.tsx.
 */
export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${inter.variable} h-full`}>
      <body className="flex min-h-full flex-col">
        <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-3 focus:z-50 focus:rounded-md focus:bg-white focus:px-3 focus:py-2 focus:text-ink">
          Skip to content
        </a>
        {children}
      </body>
    </html>
  );
}
