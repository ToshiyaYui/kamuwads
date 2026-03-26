/**
 * server.js — バックエンドプロキシ
 *
 * APIキーはここだけに存在する。ブラウザには一切送信しない。
 * パスワード検証もサーバー側で行うため、JS改ざんで突破できない。
 */

import express from "express";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const app         = express();
const PORT    = process.env.PORT              || 3000;
const API_KEY = process.env.ANTHROPIC_API_KEY;

app.use(express.json({ limit: "20mb" }));

// ── ヘルスチェック（デバッグ用）──
app.get("/health", (_req, res) => {
  res.json({ ok: true, hasApiKey: !!API_KEY });
});

// ── Anthropic API プロキシ ──
app.post("/api/messages", async (req, res) => {
  if (!API_KEY) {
    return res.status(500).json({ error: "サーバーに ANTHROPIC_API_KEY が未設定です" });
  }

  try {
    const upstream = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type":      "application/json",
        "x-api-key":         API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify(req.body),
    });

    const data = await upstream.json();
    res.status(upstream.status).json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── ビルド済みファイルを配信（本番 / preview 共通）──
const __dirname = dirname(fileURLToPath(import.meta.url));
const distPath  = join(__dirname, "dist");
app.use(express.static(distPath));
app.get("*", (_req, res) => res.sendFile(join(distPath, "index.html")));

app.listen(PORT, () => {
  console.log(`  ➜  Backend: http://localhost:${PORT}`);
  if (!API_KEY) console.warn("  ⚠️  ANTHROPIC_API_KEY が未設定です");
});
