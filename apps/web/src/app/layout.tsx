import "./globals.css";
import type { Metadata } from "next";
import type { ReactNode } from "react";
import { GoogleAuthCallback } from "@/features/auth/GoogleAuthCallback";

export const metadata: Metadata = { title: "黄泉议会 · Nether Council", description: "Bring your wildest story. Leave with a Halloween identity." };
export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="zh-CN">
      <body>
        <GoogleAuthCallback />
        {children}
      </body>
    </html>
  );
}
