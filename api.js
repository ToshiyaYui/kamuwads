/**
 * api.js — バックエンドプロキシ経由で Claude API を呼び出す
 *
 * APIキーはサーバー側 (server.js) のみに存在する。
 * フロントエンドのコードにはキーは一切含まれない。
 */

const PROXY_URL = "/api/messages";
const MODEL     = "claude-opus-4-5";

// ── デフォルト指示文（UI から編集可能）──

export const DEFAULT_FOOD_INSTRUCTION =
`wordsは6〜8個。人物・栄養・物語・色・歴史・科学・季節など多様なカテゴリから。
子供が「えっ、なんで？」と興味を持てるような意外なつながりを優先してください。`;

export const DEFAULT_DECOMPOSE_INSTRUCTION =
`子供が「えっ、そうなの！」と驚けるような多様な視点から選んでください。
同じカテゴリに偏らず、科学・歴史・文化・自然・感情など幅広く。`;

/**
 * バックエンドプロキシ経由で Claude API を呼び出す。
 */
async function callClaude(messages, max_tokens = 1024) {
  const controller = new AbortController();
  const timeoutId  = setTimeout(() => controller.abort(), 30_000);

  let res;
  try {
    res = await fetch(PROXY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: MODEL, max_tokens, messages }),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeoutId);
  }

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`API エラー ${res.status}: ${body}`);
  }

  const data = await res.json();
  const raw  = data.content[0].text.trim()
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/,      "")
    .replace(/```\s*$/,      "")
    .trim();

  return JSON.parse(raw);
}

/**
 * 画像（base64）を送信して食べ物を認識し、関連ワードを取得する。
 * @typedef {{ food_name: string, shape: string, color: string, words: WordEntry[] }} FoodItem
 * @typedef {{ text: string, category: string, color: string, reason: string }} WordEntry
 */
export async function recognizeFood(base64, mediaType = "image/jpeg", instruction = DEFAULT_FOOD_INSTRUCTION) {
  return callClaude([
    {
      role: "user",
      content: [
        {
          type: "image",
          source: { type: "base64", media_type: mediaType, data: base64 },
        },
        {
          type: "text",
          text: `この画像の食べ物を認識して、JSONのみ返してください（他の文章不要）。

{
  "food_name": "食べ物の日本語名",
  "shape": "circle または oval または rectangle または triangle",
  "color": "代表色（16進数）",
  "words": [
    { "text": "関連ワード", "category": "カテゴリ名", "color": "イメージカラー（16進数）", "reason": "このワードが選ばれた理由（子供向けの短い説明、1〜2文）" }
  ]
}

${instruction}`,
        },
      ],
    },
  ]);
}

/**
 * ワードを受け取り、さらなる関連ワード群を取得する（再帰分解）。
 */
export async function decomposeWord(word, instruction = DEFAULT_DECOMPOSE_INSTRUCTION) {
  return callClaude([
    {
      role: "user",
      content: `「${word}」から連想できる概念を6個、JSONのみで返してください（他の文章不要）。

{
  "food_name": "${word}",
  "shape": "circle",
  "color": "#xxxxxx",
  "words": [
    { "text": "関連ワード", "category": "カテゴリ", "color": "#xxxxxx", "reason": "このワードが選ばれた理由（子供向けの短い説明、1〜2文）" }
  ]
}

${instruction}`,
    },
  ]);
}
