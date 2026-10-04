import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "Marginloom · AI reliability workbench",
  description:
    "Measure confidence. Inspect failures. Decide when a model should defer to a person.",
  icons: { icon: "/favicon.svg", shortcut: "/favicon.svg" },
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
