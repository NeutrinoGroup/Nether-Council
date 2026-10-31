import QRCode from "qrcode";
import type { IdentityResult, Locale } from "@nether/contracts";
import { getCharacter } from "@nether/party-core";

export interface CardRenderOptions {
  result: IdentityResult;
  nickname: string;
  hideVerdict: boolean;
  locale: Locale;
  shareUrl: string;
}

function wrapLines(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const lines: string[] = [];
  const tokens = Array.from(text);
  let currentLine = "";

  for (let i = 0; i < tokens.length; i++) {
    const char = tokens[i];
    const testLine = currentLine + char;
    const metrics = ctx.measureText(testLine);
    if (metrics.width > maxWidth && currentLine !== "") {
      lines.push(currentLine);
      currentLine = char;
    } else {
      currentLine = testLine;
    }
  }
  if (currentLine) lines.push(currentLine);
  return lines;
}

export async function generateQrDataUrl(url: string): Promise<string> {
  return QRCode.toDataURL(url, {
    errorCorrectionLevel: "M",
    margin: 2,
    color: {
      dark: "#0a0709",
      light: "#f8f3ea",
    },
    width: 240,
  });
}

export async function renderCardToCanvas(
  canvas: HTMLCanvasElement,
  options: CardRenderOptions
): Promise<void> {
  const { result, nickname, hideVerdict, locale, shareUrl } = options;
  const width = 1080;
  const height = 1440;
  canvas.width = width;
  canvas.height = height;

  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("CANVAS_CONTEXT_UNAVAILABLE");

  const meta = getCharacter(result.characterId);
  const theme = meta.cardTheme;

  // Ensure fonts are ready before drawing
  if (typeof document !== "undefined" && document.fonts) {
    try {
      await document.fonts.ready;
    } catch {}
  }

  // 1. Background gradient
  const bg = ctx.createLinearGradient(0, 0, 0, height);
  bg.addColorStop(0, theme.bgGradient[0]);
  bg.addColorStop(0.5, theme.bgGradient[1]);
  bg.addColorStop(1, "#070406");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, width, height);

  // 2. Subtle radial glow behind the title
  const glow = ctx.createRadialGradient(width / 2, 450, 40, width / 2, 450, 480);
  glow.addColorStop(0, theme.glow);
  glow.addColorStop(1, "rgba(0, 0, 0, 0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, width, height);

  // 3. Borders & Frames
  ctx.strokeStyle = "#2f2228";
  ctx.lineWidth = 4;
  ctx.strokeRect(36, 36, width - 72, height - 72);

  ctx.strokeStyle = theme.border;
  ctx.lineWidth = 1.5;
  ctx.strokeRect(46, 46, width - 92, height - 92);

  // Corner accents
  const corners = [
    [52, 52],
    [width - 52, 52],
    [52, height - 52],
    [width - 52, height - 52],
  ];
  ctx.fillStyle = theme.accent;
  for (const [cx, cy] of corners) {
    ctx.beginPath();
    ctx.arc(cx, cy, 4, 0, Math.PI * 2);
    ctx.fill();
  }

  // 4. Header: Brand
  ctx.textAlign = "center";
  ctx.fillStyle = "#b5a4ab";
  ctx.font = "600 22px system-ui, -apple-system, sans-serif";
  ctx.fillText("NETHER COUNCIL · 黄泉议会", width / 2, 110);

  ctx.fillStyle = "#7b6871";
  ctx.font = "500 16px system-ui, -apple-system, sans-serif";
  ctx.fillText("AFTERLIFE HALLOWEEN ENCOUNTER · 2026", width / 2, 140);

  // Decorative separator
  ctx.strokeStyle = "#38232c";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(180, 168);
  ctx.lineTo(width - 180, 168);
  ctx.stroke();

  // 5. Character badge
  ctx.fillStyle = theme.accent;
  ctx.font = "650 26px system-ui, -apple-system, sans-serif";
  ctx.fillText(`✦ ${meta.name.zh} · ${meta.name.en.toUpperCase()} ✦`, width / 2, 215);

  ctx.fillStyle = "#a8909b";
  ctx.font = "18px system-ui, -apple-system, sans-serif";
  ctx.fillText(
    meta.role[locale],
    width / 2,
    245
  );

  // 6. Guest Nickname
  const displayName = nickname.trim() || (locale === "zh" ? "今晚的来宾" : "Tonight's Guest");
  ctx.fillStyle = "#f8f3ea";
  ctx.font = "600 28px system-ui, -apple-system, sans-serif";
  ctx.fillText(locale === "zh" ? `【 来宾：${displayName} 】` : `[ Guest: ${displayName} ]`, width / 2, 305);

  // 7. Identity Title (Hero display)
  const titleText = result.title[locale];
  const subTitleText = result.title[locale === "zh" ? "en" : "zh"];
  ctx.fillStyle = theme.accent;
  ctx.font = locale === "zh" ? "800 64px 'Ma Shan Zheng', cursive, system-ui" : "800 52px 'Bungee', cursive, system-ui";
  ctx.fillText(titleText, width / 2, 410);

  ctx.fillStyle = theme.badgeColor;
  ctx.font = "500 24px system-ui, -apple-system, sans-serif";
  ctx.fillText(subTitleText, width / 2, 455);

  // 8. Tags
  const tagList = result.tags.map(t => t[locale]);
  const tagWidth = 160;
  const tagGap = 20;
  const totalTagsWidth = tagList.length * tagWidth + (tagList.length - 1) * tagGap;
  let startX = (width - totalTagsWidth) / 2;
  const tagY = 495;

  for (const tag of tagList) {
    ctx.fillStyle = theme.badgeBg;
    ctx.strokeStyle = theme.border;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.roundRect(startX, tagY, tagWidth, 42, 21);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = "#f8f3ea";
    ctx.font = "600 18px system-ui, -apple-system, sans-serif";
    ctx.fillText(tag, startX + tagWidth / 2, tagY + 27);
    startX += tagWidth + tagGap;
  }

  // 9. Verdict Box (Witty observation)
  const verdictBoxY = 580;
  const verdictBoxWidth = width - 180;
  const verdictBoxX = 90;

  ctx.fillStyle = "#120910";
  ctx.strokeStyle = "#38232c";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.roundRect(verdictBoxX, verdictBoxY, verdictBoxWidth, 240, 16);
  ctx.fill();
  ctx.stroke();

  // Verdict content
  ctx.textAlign = "center";
  if (!hideVerdict) {
    ctx.fillStyle = theme.accent;
    ctx.font = "600 18px system-ui, -apple-system, sans-serif";
    ctx.fillText(
      locale === "zh" ? `— ${meta.name.zh} 批注 —` : `— ${meta.name.en}'s Observation —`,
      width / 2,
      verdictBoxY + 45
    );

    ctx.fillStyle = "#f8f3ea";
    ctx.font = "400 24px system-ui, -apple-system, sans-serif";
    const verdictLines = wrapLines(ctx, `“${result.verdict[locale]}”`, verdictBoxWidth - 64);
    let lineY = verdictBoxY + 95;
    for (const line of verdictLines.slice(0, 4)) {
      ctx.fillText(line, width / 2, lineY);
      lineY += 36;
    }
  } else {
    ctx.fillStyle = "#8a757e";
    ctx.font = "italic 22px system-ui, -apple-system, sans-serif";
    ctx.fillText(
      locale === "zh" ? "【 来宾选择隐藏具体经历评价 】" : "[ Guest chose to keep story details private ]",
      width / 2,
      verdictBoxY + 125
    );
  }

  // 10. Warm Closing Speech
  const closingY = 875;
  ctx.fillStyle = theme.badgeColor;
  ctx.font = "italic 24px system-ui, -apple-system, sans-serif";
  const closingLines = wrapLines(ctx, `“${result.warmClosing[locale]}”`, width - 240);
  let closeLineY = closingY;
  for (const line of closingLines.slice(0, 3)) {
    ctx.fillText(line, width / 2, closeLineY);
    closeLineY += 34;
  }

  // 11. Footer Divider
  ctx.strokeStyle = "#38232c";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(90, 1010);
  ctx.lineTo(width - 90, 1010);
  ctx.stroke();

  // 12. QR Code & Referral Block
  const qrX = 140;
  const qrY = 1055;
  const qrSize = 250;

  try {
    const qrDataUrl = await generateQrDataUrl(shareUrl || "https://nether-council.vercel.app");
    const img = new Image();
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = reject;
      img.src = qrDataUrl;
    });

    // White quiet-zone container for QR code
    ctx.fillStyle = "#f8f3ea";
    ctx.fillRect(qrX - 12, qrY - 12, qrSize + 24, qrSize + 24);
    ctx.drawImage(img, qrX, qrY, qrSize, qrSize);
  } catch {
    ctx.fillStyle = "#26131c";
    ctx.fillRect(qrX, qrY, qrSize, qrSize);
    ctx.fillStyle = "#b5a4ab";
    ctx.font = "16px system-ui";
    ctx.fillText(locale === "zh" ? "二维码生成中" : "QR loading", qrX + qrSize / 2, qrY + qrSize / 2);
  }

  // Right side of QR code: explanation & call to action
  const infoX = 450;
  ctx.textAlign = "left";

  ctx.fillStyle = theme.accent;
  ctx.font = "700 26px system-ui, -apple-system, sans-serif";
  ctx.fillText(locale === "zh" ? "扫码领取你的冥界身份" : "Scan to Claim Your Afterlife Identity", infoX, 1105);

  ctx.fillStyle = "#e2d7dc";
  ctx.font = "400 20px system-ui, -apple-system, sans-serif";
  const descLines = locale === "zh"
    ? [
        "黄泉议会万圣节限时奇遇",
        "与冥界神怪全双工实时语音对话",
        "领取属于你的专属身份与暖心批注",
      ]
    : [
        "Nether Council Halloween Special",
        "Duplex voice encounter with afterlife deities",
        "Discover your custom title & warm verdict",
      ];

  let descY = 1150;
  for (const line of descLines) {
    ctx.fillText(line, infoX, descY);
    descY += 32;
  }

  ctx.fillStyle = "#755d66";
  ctx.font = "500 15px system-ui, -apple-system, sans-serif";
  ctx.fillText("nether-council.vercel.app · 7 DAYS VALID INVITE", infoX, 1270);

  // Bottom footer disclaimer
  ctx.textAlign = "center";
  ctx.fillStyle = "#614e56";
  ctx.font = "14px system-ui, -apple-system, sans-serif";
  ctx.fillText(
    locale === "zh"
      ? "本卡片由全双工语音实时生成 · 故事细节仅保留在本地 · 祝你万圣狂欢夜安"
      : "Generated live via duplex voice · Story details kept private · Happy Halloween",
    width / 2,
    1390
  );
}

export function exportCardPngBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(blob => {
      if (blob) resolve(blob);
      else reject(new Error("CANVAS_BLOB_EXPORT_FAILED"));
    }, "image/png");
  });
}
