import type { Metadata } from "next";
import type { ReactNode } from "react";
export const metadata: Metadata = { title: "黄泉议会 · Nether Council", description: "Bring your wildest story. Leave with a Halloween identity." };
export default function RootLayout({ children }: { children: ReactNode }) {
  return <html lang="zh-CN"><body>{children}</body></html>;
}
