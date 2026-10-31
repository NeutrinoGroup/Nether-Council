import os
from PIL import Image, ImageDraw, ImageFont

os.makedirs("apps/web/public/posters", exist_ok=True)

CHARACTERS = [
    {
        "id": "hei-wuchang",
        "title": "黑无常",
        "subtitle": "HEI WUCHANG",
        "tag": "天下太平 · 夜巡总督",
        "bg_top": (7, 16, 24),
        "bg_bot": (11, 31, 45),
        "accent": (0, 210, 211),
        "border": (84, 160, 255),
        "symbol": "☵",
    },
    {
        "id": "bai-wuchang",
        "title": "白无常",
        "subtitle": "BAI WUCHANG",
        "tag": "一见生财 · 气氛顶流",
        "bg_top": (28, 16, 20),
        "bg_bot": (44, 18, 29),
        "accent": (255, 107, 129),
        "border": (255, 71, 87),
        "symbol": "✦",
    },
    {
        "id": "zhong-kui",
        "title": "钟 馗",
        "subtitle": "ZHONG KUI",
        "tag": "伏魔天师 · 烦恼退散",
        "bg_top": (30, 10, 10),
        "bg_bot": (48, 14, 14),
        "accent": (255, 77, 77),
        "border": (255, 56, 56),
        "symbol": "⚔",
    },
    {
        "id": "frankenstein",
        "title": "怪人弗兰肯斯坦",
        "subtitle": "FRANKENSTEIN",
        "tag": "意外科学 · 翻车哲学",
        "bg_top": (7, 22, 15),
        "bg_bot": (14, 41, 28),
        "accent": (46, 213, 115),
        "border": (16, 172, 132),
        "symbol": "⚡",
    },
    {
        "id": "werewolf",
        "title": "狼 人",
        "subtitle": "WEREWOLF",
        "tag": "月下狂欢 · 释放压力",
        "bg_top": (22, 12, 31),
        "bg_bot": (38, 18, 56),
        "accent": (255, 121, 63),
        "border": (165, 94, 234),
        "symbol": "☽",
    },
    {
        "id": "vampire",
        "title": "吸血鬼",
        "subtitle": "VAMPIRE",
        "tag": "暗夜贵族 · 优雅独行",
        "bg_top": (22, 8, 18),
        "bg_bot": (42, 12, 34),
        "accent": (232, 67, 147),
        "border": (214, 48, 49),
        "symbol": "🍷",
    },
]

def make_gradient(width, height, top, bot):
    base = Image.new("RGBA", (width, height), top + (255,))
    draw = ImageDraw.Draw(base)
    for y in range(height):
        r = int(top[0] + (bot[0] - top[0]) * (y / height))
        g = int(top[1] + (bot[1] - top[1]) * (y / height))
        b = int(top[2] + (bot[2] - top[2]) * (y / height))
        draw.line([(0, y), (width, y)], fill=(r, g, b, 255))
    return base

def try_load_font(size):
    paths = [
        "/System/Library/Fonts/PingFang.ttc",
        "/System/Library/Fonts/STHeiti Light.ttc",
        "/System/Library/Fonts/Hiragino Sans GB.ttc",
        "/Library/Fonts/Arial Unicode.ttf",
    ]
    for p in paths:
        if os.path.exists(p):
            try:
                return ImageFont.truetype(p, size)
            except Exception:
                pass
    return ImageFont.load_default()

for c in CHARACTERS:
    img = make_gradient(512, 512, c["bg_top"], c["bg_bot"])
    draw = ImageDraw.Draw(img)

    # Outer decorative frame
    draw.rectangle([20, 20, 492, 492], outline=c["border"] + (180,), width=2)
    draw.rectangle([28, 28, 484, 484], outline=c["accent"] + (90,), width=1)

    # Corners
    for x in [24, 488]:
        for y in [24, 488]:
            draw.ellipse([x - 4, y - 4, x + 4, y + 4], fill=c["accent"] + (220,))

    # Center circle badge
    cx, cy = 256, 220
    r = 110
    draw.ellipse([cx - r, cy - r, cx + r, cy + r], outline=c["border"] + (140,), width=2)
    draw.ellipse([cx - r + 8, cy - r + 8, cx + r - 8, cy + r - 8], outline=c["accent"] + (80,), width=1)

    # Center emblem symbol
    font_sym = try_load_font(72)
    draw.text((cx, cy - 10), c["symbol"], fill=c["accent"] + (240,), font=font_sym, anchor="mm")

    # Titles
    font_title = try_load_font(34)
    font_sub = try_load_font(16)
    font_tag = try_load_font(18)

    draw.text((cx, 370), c["title"], fill=(245, 240, 235, 255), font=font_title, anchor="mm")
    draw.text((cx, 412), c["subtitle"], fill=c["accent"] + (230,), font=font_sub, anchor="mm")

    # Tag pill
    draw.text((cx, 448), c["tag"], fill=(180, 175, 170, 220), font=font_tag, anchor="mm")

    path = f"apps/web/public/posters/{c['id']}.png"
    img.save(path, "PNG")
    print(f"Generated {path}")
