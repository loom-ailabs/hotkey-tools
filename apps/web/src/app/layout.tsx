import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Hotkey Tools",
  description: "快捷键整理与管理工具",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
