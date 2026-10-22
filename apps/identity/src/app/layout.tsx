import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Hotkey Tools · 账户中心",
  description: "登录、购买和管理你的 Hotkey Tools 使用权限。",
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
