export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { userText = "", location = "", category = "" } = req.body || {};

    const apiKey = process.env.ARK_API_KEY;
    const model = process.env.ARK_MODEL || "doubao-seed-1-6-flash-250828";

    if (!apiKey) {
      return res.status(500).json({ error: "Missing ARK_API_KEY" });
    }

    const prompt = `
你需要根据用户上传日常照片时填写的文字，生成一首中文现代短诗。

项目主题：
“寻找日常仪式感的最大公约数”。

生成要求：
1. 只输出诗句本身，不要标题、解释、引号。
2. 2行或3行。
3. 总字数控制在8到28个汉字之间。
4. 语言自然、克制、日常、有微小仪式感。
5. 不要鸡汤，不要说教，不要宏大叙事。
6. 不要直接复述用户原话。
7. 不要使用“人生、宇宙、命运、灵魂、永恒”等过大的词。
8. 不要出现英文。
9. 尽量保留用户文字中的真实物象或情绪，但不要生硬拼接。
10. 诗句要适合放在视觉海报上。

拍摄地点：${location || "未填写"}
图像分类：${category || "未指定"}
用户感想：${userText || "未填写"}
`.trim();

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 7000);

    const response = await fetch("https://ark.cn-beijing.volces.com/api/v3/chat/completions", {
      method: "POST",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model,
        messages: [
          {
            role: "system",
            content: "你是一个中文短诗生成器，风格克制、日常、清澈、不过度抒情。"
          },
          {
            role: "user",
            content: prompt
          }
        ],
        temperature: 0.85,
        max_tokens: 80,
        stream: false
      })
    });

    clearTimeout(timer);

    if (!response.ok) {
      const errText = await response.text();
      return res.status(response.status).json({ error: errText });
    }

    const data = await response.json();
    let poem = data?.choices?.[0]?.message?.content || "";

    poem = cleanPoem(poem);

    if (!isValidPoem(poem)) {
      return res.status(422).json({
        error: "Invalid poem",
        poem
      });
    }

    return res.status(200).json({
      poem,
      source: "doubao"
    });

  } catch (err) {
    return res.status(500).json({
      error: err?.name === "AbortError" ? "AI timeout" : err.message
    });
  }
}

function cleanPoem(text) {
  return String(text || "")
    .replace(/```[\s\S]*?```/g, "")
    .replace(/^诗[:：]/g, "")
    .replace(/^短诗[:：]/g, "")
    .replace(/^《.*?》/g, "")
    .replace(/[“”"']/g, "")
    .split("\n")
    .map(s => s.trim())
    .filter(Boolean)
    .slice(0, 3)
    .join("\n");
}

function countChineseChars(text) {
  const m = String(text || "").match(/[\u4e00-\u9fa5]/g);
  return m ? m.length : 0;
}

function isValidPoem(poem) {
  const count = countChineseChars(poem);

  if (count < 8 || count > 28) return false;
  if (poem.split(/\n+/).length > 3) return false;
  if (/标题|解释|以下|这首诗|我为你/.test(poem)) return false;
  if (/[A-Za-z]/.test(poem)) return false;

  return true;
}