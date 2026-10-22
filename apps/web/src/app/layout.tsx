import type { Metadata } from "next";
import {
  SITE_DESCRIPTION,
  SITE_NAME,
  SITE_URL,
  serializeJsonLd,
  siteStructuredData,
} from "@/shared/config/seo";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  applicationName: SITE_NAME,
  title: { default: "Loom AI · 连接智能，织就未来", template: "%s · Loom AI" },
  description: SITE_DESCRIPTION,
  verification: { google: "URwgNlwD6Yutc7w_L-YBUPlDlw1dFsqONwf5sMi72Cs" },
  icons: { icon: "/loom.png", apple: "/loom.png" },
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true, "max-image-preview": "large", "max-snippet": -1 },
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN" className="loom-dark scroll-smooth motion-reduce:scroll-auto">
      <head>
        <link rel="describedby" type="text/plain" href="/llms.txt" />
      </head>
      <body>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: serializeJsonLd(siteStructuredData) }}
        />
        {children}
      </body>
    </html>
  );
}
