/** macOS synthetic voices only; never records a microphone. */
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
const lines = {
  soul_zh_turn1: "老板今天又让我重改需求我写的代码全白写了真是气死我了",
  soul_zh_turn2: "最烦的是每次下班前突然加需求害得我昨晚又没有好好睡觉",
  soul_zh_turn3: "其实说出来舒服多了我想放下这些烦恼喝一碗热汤了",
  soul_anxiety_zh_turn1: "我最近总是特别焦虑晚上睡不着觉觉得自己什么事都做不好",
  soul_anxiety_zh_turn2: "听你说完我心里好多了已经没什么想说的了想喝汤放下烦恼",
};
mkdirSync("artifacts/soul-soup", { recursive: true });
for (const [id, text] of Object.entries(lines)) {
  const wavPath = `artifacts/soul-soup/${id}.wav`;
  execFileSync("say", ["-v", "Tingting", "--file-format=WAVE", "--data-format=LEI16@16000", "-o", wavPath, text]);
  const wave = readFileSync(wavPath);
  let offset = 12;
  while (offset + 8 <= wave.length && wave.toString("ascii", offset, offset + 4) !== "data") {
    const bytes = wave.readUInt32LE(offset + 4); offset += 8 + bytes + bytes % 2;
  }
  if (offset + 8 > wave.length) throw new Error("No PCM data chunk");
  writeFileSync(`tests/fixtures/audio/${id}.pcm`, wave.subarray(offset + 8, offset + 8 + wave.readUInt32LE(offset + 4)));
}
