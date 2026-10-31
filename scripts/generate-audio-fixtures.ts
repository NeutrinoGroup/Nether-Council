import { mkdirSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";

const samples = [
  { id: "zh_turn1", voice: "Tingting", text: "你好，孟婆，我今天工作有点累，想听一个关于黄泉的故事。" },
  { id: "zh_turn2", voice: "Tingting", text: "听起来很有意思，今夜的派对上还有哪些其他的朋友在这里呢？" },
  { id: "zh_turn3", voice: "Tingting", text: "谢谢你的陪伴，今晚这一杯忘忧汤，敬所有努力活着的人。" },
  { id: "en_turn1", voice: "Samantha", text: "Hello Meng Po, I had a long week and I am ready for the underworld party." },
  { id: "en_turn2", voice: "Samantha", text: "That sounds wonderful, tell me about the other creatures gathered tonight." },
  { id: "en_turn3", voice: "Samantha", text: "Thank you for the warm words, cheers to everyone celebrating in the council." },
];

mkdirSync("tests/fixtures/audio", { recursive: true });

for (const s of samples) {
  const tmpWav = `/tmp/fixture_${s.id}.wav`;
  execSync(`say -v "${s.voice}" "${s.text}" -o "${tmpWav}" --data-format=LEI16@16000`);
  const buf = execSync(`node -e 'const fs = require("fs"); const b = fs.readFileSync("${tmpWav}"); const offset = b.indexOf(Buffer.from("data")) + 8; process.stdout.write(b.subarray(offset));'`);
  writeFileSync(`tests/fixtures/audio/${s.id}.pcm`, buf);
  console.log(`Generated tests/fixtures/audio/${s.id}.pcm (${buf.length} bytes, ~${(buf.length / 32000).toFixed(1)}s)`);
}
