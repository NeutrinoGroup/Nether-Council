import type { Locale } from "@nether/contracts";

export const words = {
  zh: {
    home: "黄泉议会",
    title: "孟婆",
    role: "南瓜忘忧汤酒保",
    intro: "今晚，想忘掉哪件离谱事？",
    invitation: "把最近的烦恼倒进汤里。她会追问、接梗，再陪你笑一笑。",
    choose: "用哪种语言聊？",
    start: "开麦，找孟婆聊聊",
    stop: "结束对话",
    mute: "静音麦克风",
    unmute: "恢复麦克风",
    interrupt: "打断孟婆",
    caption: "孟婆的话",
    you: "你刚才说",
    empty: "开麦后，从一件最近的离谱事说起。",
    examples: ["今天开了五场会，工作一点没动。", "朋友又让我“顺便”改个 PPT。", "我把截止日期记成了下个星期。"],
    topic: "不知道怎么开口？",
    hint: "直接说就好。孟婆说话时，你也可以插话。",
    mic: "点击后允许使用麦克风。第一次体验建议戴耳机。",
    invite: "需要活动邀请。请从主持人提供的链接进入。",
    trial: "孟婆语音试场 · 专属身份已开放",
    ended: "这碗汤先聊到这里，想起新故事再来。",
    connection: "连接",
    first: "开场音频",
    states: {
      idle: "准备开聊",
      permission: "正在请求麦克风",
      connecting: "正在接通孟婆",
      listening: "正在听你说",
      speaking: "孟婆正在说话",
      reconnecting: "连接断开，正在恢复",
      ended: "对话已结束",
      error: "暂时没接通",
    },
  },
  en: {
    home: "Nether Council",
    title: "Meng Po",
    role: "Your afterlife bartender",
    intro: "What’s been ridiculous lately?",
    invitation: "Pour a little worry into the pumpkin soup. She’ll ask, tease gently, and help you laugh it off.",
    choose: "Which language?",
    start: "Turn on mic & meet Meng Po",
    stop: "End conversation",
    mute: "Mute microphone",
    unmute: "Unmute microphone",
    interrupt: "Interrupt Meng Po",
    caption: "Meng Po says",
    you: "You just said",
    empty: "Start with one ridiculous thing that happened lately.",
    examples: ["Five meetings today. Zero actual work done.", "A friend asked for “one tiny” slide-deck favor.", "I thought the deadline was next week."],
    topic: "Need an opening line?",
    hint: "Just talk. You can interrupt her while she’s speaking.",
    mic: "Allow microphone access after clicking. Headphones help for a first try.",
    invite: "You need an event invitation. Open the link from your host.",
    trial: "Meng Po voice trial · Identity cards unlocked",
    ended: "That’s one bowl for tonight. Come back with another story.",
    connection: "Connection",
    first: "Opening audio",
    states: {
      idle: "Ready when you are",
      permission: "Requesting microphone",
      connecting: "Connecting to Meng Po",
      listening: "Listening to you",
      speaking: "Meng Po is speaking",
      reconnecting: "Reconnecting",
      ended: "Conversation ended",
      error: "Couldn’t connect",
    },
  },
};

export function errorText(code: string | undefined, locale: Locale) {
  const zh = locale === "zh";
  if (code === "MICROPHONE_DENIED") return zh ? "麦克风被拒绝了。请在地址栏允许麦克风后重试。" : "Microphone access was denied. Allow it in your address bar, then try again.";
  if (code === "FORBIDDEN") return zh ? "活动邀请已失效。请使用主持人提供的新链接。" : "This event invitation is no longer valid. Use a new link from your host.";
  if (code === "VOICE_DISABLED") return zh ? "语音入口暂时关闭，请稍后再来。" : "Voice entry is temporarily closed. Please try later.";
  return zh ? "语音连接遇到问题。请检查网络，再重新开麦。" : "Voice ran into a problem. Check your connection, then start again.";
}
