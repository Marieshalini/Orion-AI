import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Orion AI — Business Strategy Command Center",
  description: "AI-powered multi-agent business strategy simulator. Get insights from Sales, Marketing, Finance, and Operations agents.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="noise">{children}</body>
    </html>
  );
}
