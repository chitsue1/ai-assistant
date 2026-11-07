import type { Metadata } from "next";
import "@fontsource-variable/noto-sans-georgian";
import "./globals.css";

export const metadata: Metadata = {
  title: "AI ასისტენტი ბიზნესისთვის",
  description: "ქართულენოვანი AI ასისტენტი კომპანიის საიტისთვის: მზა პასუხები, ცოდნის ბაზა და Claude Haiku.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ka">
      <body>{children}</body>
    </html>
  );
}
