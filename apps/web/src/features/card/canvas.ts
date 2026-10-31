import QRCode from "qrcode";
import type { IdentityResult, Locale } from "@nether/contracts";

export interface CardRenderOptions {
  result: IdentityResult;
  nickname: string;
  hideVerdict: boolean;
  locale: Locale;
  shareUrl: string;
}

function wrapLines(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const lines: string[] = [];
  // Support both CJK characters and space-separated Latin words
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

  // Ensure fonts are ready before drawing
  if (typeof document !== "undefined" && document.fonts) {
    try {
      await document.fonts.ready;
    } catch {}
  }

  // 1. Background gradient
  const bg = ctx.createLinearGradient(0, 0, 0, height);
  bg.addColorStop(0, "#160d13");
  bg.addColorStop(0.4, "#0f090d");
  bg.addColorStop(1, "#070406");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, width, height);

  // 2. Subtle radial glow behind the title
  const glow = ctx.createRadialGradient(width / 2, 450, 40, width / 2, 450, 480);
  glow.addColorStop(0, "rgba(255, 106, 39, 0.18)");
  glow.addColorStop(1, "rgba(255, 106, 39, 0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, width, height);

  // 3. Borders & Frames
  ctx.strokeStyle = "#38232c";
  ctx.lineWidth = 4;
  ctx.strokeRect(36, 36, width - 72, height - 72);

  ctx.strokeStyle = "#ff6a27";
  ctx.lineWidth = 1.5;
  ctx.strokeRect(46, 46, width - 92, height - 92);

  // Corner accents
  const corners = [
    [52, 52],
    [width - 52, 52],
    [52, height - 52],
    [width - 52, height - 52],
  ];
  ctx.fillStyle = "#ff6a27";
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

  ctx.fillStyle = "#6b545d";
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
  ctx.fillStyle = "#ff6a27";
  ctx.font = "650 26px system-ui, -apple-system, sans-serif";
  ctx.fillText("✦ 孟婆 · MENG PO ✦", width / 2, 215);

  ctx.fillStyle = "#9c828d";
  ctx.font = "18px system-ui, -apple-system, sans-serif";
  ctx.fillText(
    locale === "zh" ? "忘忧酒保亲授专属身份" : "Title conferred by the Afterlife Bartender",
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
  ctx.fillStyle = "#ff6a27";
  ctx.font = locale === "zh" ? "800 64px 'Ma Shan Zheng', cursive, system-ui" : "800 52px 'Bungee', cursive, system-ui";
  ctx.fillText(titleText, width / 2, 410);

  ctx.fillStyle = "#ffaa6e";
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
    ctx.fillStyle = "#27151e";
    ctx.strokeStyle = "#4d2938";
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

  ctx.fillStyle = "#160c12";
  ctx.strokeStyle = "#38232c";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.roundRect(verdictBoxX, verdictBoxY, verdictBoxWidth, 240, 16);
  ctx.fill();
  ctx.stroke();

  // Verdict content
  ctx.textAlign = "center";
  if (!hideVerdict) {
    ctx.fillStyle = "#ff6a27";
    ctx.font = "600 18px system-ui, -apple-system, sans-serif";
    ctx.fillText(locale === "zh" ? "— 孟婆批注 —" : "— Meng Po's Observation —", width / 2, verdictBoxY + 45);

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
  ctx.fillStyle = "#ffaa6e";
  ctx.font = "italic 24px system-ui, -apple-system, sans-serif";
  const closingLines = wrapLines(ctx, `“${result.warmClosing[locale]}”`, width - 240);
  let closeLineY = closingY;
  for (const line of closingLines.slice(0, 3)) {
    ctx.fillText(line, width / 2, closeLineY);
    closeLineY += 34;
  }

  // 11. Bottom Card with QR Code and share invitation
  const bottomCardY = 990;
  const bottomCardHeight = 340;
  ctx.fillStyle = "#f8f3ea";
  ctx.beginPath();
  ctx.roundRect(110, bottomCardY, width - 220, bottomCardHeight, 20);
  ctx.fill();

  // Draw QR code inside bottom card
  const qrDataUrl = await generateQrDataUrl(shareUrl);
  const qrImg = new Image();
  qrImg.src = qrDataUrl;
  await new Promise<void>((resolve, reject) => {
    qrImg.onload = () => resolve();
    qrImg.onerror = reject;
  });

  const qrSize = 220;
  const qrX = 160;
  const qrY = bottomCardY + (bottomCardHeight - qrSize) / 2;
  ctx.drawImage(qrImg, qrX, qrY, qrSize, qrSize);

  // Text next to QR code
  ctx.textAlign = "left";
  const textLeft = qrX + qrSize + 40;
  ctx.fillStyle = "#0a0709";
  ctx.font = "750 30px system-ui, -apple-system, sans-serif";
  ctx.fillText(locale === "zh" ? "扫码开启黄泉奇遇" : "Scan to Enter Party", textLeft, bottomCardY + 110);

  ctx.fillStyle = "#5c4951";
  ctx.font = "500 20px system-ui, -apple-system, sans-serif";
  ctx.fillText(
    locale === "zh" ? "讲一件离谱事 · 测你的专属身份" : "Tell a story · Claim your afterlife title",
    textLeft,
    bottomCardY + 155
  );

  ctx.fillStyle = "#ff6a27";
  ctx.font = "650 18px system-ui, -apple-system, sans-serif";
  ctx.fillText("ghost.oodai.space", textLeft, bottomCardY + 205);

  ctx.fillStyle = "#8a757e";
  ctx.font = "400 15px system-ui, -apple-system, sans-serif";
  ctx.fillText(locale === "zh" ? "凭此卡扫码免手填入场码" : "Direct access without code", textLeft, bottomCardY + 240);

  // 12. Footnote / watermark
  ctx.textAlign = "center";
  ctx.fillStyle = "#59424b";
  ctx.font = "14px system-ui, -apple-system, sans-serif";
  const dateStr = new Date(result.generatedAt).toISOString().slice(0, 10);
  ctx.fillText(`SESSION ${result.sessionId.slice(0, 8)} · ${dateStr} · NETHER COUNCIL`, width / 2, height - 20);
}

export async function exportCardPngBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(blob => {
      if (blob) resolve(blob);
      else reject(new Error("CANVAS_TO_BLOB_FAILED"));
    }, "image/png");
  });
}
