import type { Metadata } from "next";
import "./globals.css";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";

export const metadata: Metadata = {
  title: { default: "Foothold", template: "%s · Foothold" },
  description: "Find your footing in the job search: ranked matches with a visible breakdown, a grounded copilot, and résumés tailored to each role.",
  // Outbound clicks to employer apply pages must not carry the full /jobs?… URL (saved-filter ids, queries).
  referrer: "strict-origin-when-cross-origin",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="min-h-screen bg-background text-foreground antialiased">
        <TooltipProvider delayDuration={150}>{children}</TooltipProvider>
        <Toaster position="bottom-right" richColors />
      </body>
    </html>
  );
}
