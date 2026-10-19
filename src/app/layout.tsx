import type { Metadata, Viewport } from "next";
import { Inter_Tight } from "next/font/google";
import { tenant, fullAddress } from "@/config/tenant";
import "./globals.css";

const interTight = Inter_Tight({ subsets: ["latin"], weight: ["400", "500", "600"], variable: "--font-inter-tight", display: "swap" });

export const metadata: Metadata = {
  metadataBase: process.env.SITE_URL ? new URL(process.env.SITE_URL) : undefined,
  title: `Book with ${tenant.barber} · ${tenant.name}`,
  description: `Book a haircut with ${tenant.barber} at ${tenant.name}, ${fullAddress()}.`,
  openGraph: {
    title: `Book with ${tenant.barber} · ${tenant.name}`,
    description: `${fullAddress()}. ${tenant.payment}`,
    images: [{ url: "/brand/vbarbersz-logo.jpeg", width: 2048, height: 2048 }],
  },
  icons: { icon: "/brand/vbarbersz-logo.jpeg", apple: "/brand/vbarbersz-logo.jpeg" },
};

export const viewport: Viewport = {
  themeColor: "#050505",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

// Runs before first paint: a visitor who has seen the intro this session never
// sees it flash. Storage can throw (private mode, blocked site data), so it's
// wrapped, and the intro simply plays.
// It also marks that JS runs, so scroll-in reveals only hide content when
// something will show it again.
const introFlag = `document.documentElement.classList.add("js");try{if(sessionStorage.getItem("vb:intro"))document.documentElement.setAttribute("data-intro","seen")}catch(e){}`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-AU" className={interTight.variable} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: introFlag }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
