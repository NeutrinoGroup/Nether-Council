"use client";
import { useSyncExternalStore } from "react";
import type { Locale } from "@nether/contracts";

const emptySubscribe = () => () => {};
const getInAppSnapshot = () => {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent || "";
  return /MicroMessenger|xhs|XhsMediaPlatform|Weibo/i.test(ua);
};
const getServerSnapshot = () => false;

export function InAppBrowserBanner({ locale }: { locale: Locale }) {
  const inApp = useSyncExternalStore(emptySubscribe, getInAppSnapshot, getServerSnapshot);

  if (!inApp) return null;

  return (
    <aside className="inapp-browser-warning" role="alert">
      <span className="warning-icon" aria-hidden="true">⚠️</span>
      <p>
        {locale === "zh"
          ? "检测到您正在应用内置浏览器中打开，麦克风与音频权限受限。请点击右上角「…」选择「在浏览器中打开」以体验完整全双工实时对话。"
          : "Microphone access is restricted in in-app browsers. Please tap '…' at the top right and select 'Open in Browser' for full duplex voice."}
      </p>
    </aside>
  );
}
