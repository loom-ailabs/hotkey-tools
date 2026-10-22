import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Loom AI · 账号与访问权限",
  description:
    "登录 Loom AI，管理账号与工作区访问权限。Connecting Intelligence. Crafting Tomorrow.",
  icons: { icon: "/loom.png", apple: "/loom.png" },
  robots: { index: false, follow: false, noarchive: true },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN" className="loom-dark">
      <body>{children}</body>
    </html>
  );
}
