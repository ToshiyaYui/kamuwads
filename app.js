/**
 * app.js — 状態管理・フロー制御
 *
 * onChew() が噛む検出の唯一のエントリーポイント。
 * 将来 MediaPipe FaceMesh や ARKit から呼び出す際はここだけ変更すればよい。
 */

import { recognizeFood, decomposeWord } from "./api.js";
import { drawSilhouette, clearCanvas }  from "./shapes.js";
import { addCrack, drawCracks, startExplosion, resetFracture } from "./fracture.js";

// ──────────────────────────────────────────────
// 状態
// ──────────────────────────────────────────────

const state = {
  phase:          "upload",   // "upload"|"loading"|"ready"|"cracking"|"exploded"|"drilling"
  currentItem:    null,       // { food_name, shape, color, words[] }
  clickCount:     0,          // 総クリック数
  clicksPerWord:  5,          // 何クリックで1ワード出現するか（将来調整可能）
  revealedCount:  0,          // 表示済みワード数
  clickInCycle:   0,          // 現在のワード出現サイクル内のクリック数
  history:        [],         // [{ food_name, words[] }, ...] パンくず用
  dpr:            1,          // devicePixelRatio キャッシュ
};

// ──────────────────────────────────────────────
// DOM 要素
// ──────────────────────────────────────────────

const app            = document.getElementById("app");
const fileInput      = document.getElementById("file-input");
const cameraBtn      = document.getElementById("camera-btn");
const cameraUi       = document.getElementById("camera-ui");
const cameraVideo    = document.getElementById("camera-video");
const cameraCanvas   = document.getElementById("camera-canvas");
const captureBtn     = document.getElementById("capture-btn");
const cameraCloseBtn = document.getElementById("camera-close-btn");
const apiKeyWarning  = document.getElementById("api-key-warning");
const resetBtn       = document.getElementById("reset-btn");
const breadcrumbsEl  = document.getElementById("breadcrumbs");
const canvas         = document.getElementById("main-canvas");
const ctx            = canvas.getContext("2d");
const progressRow    = document.getElementById("progress-row");
const progressFill   = document.getElementById("progress-fill");
const progressText   = document.getElementById("progress-text");
const wordsArea      = document.getElementById("words-area");
const loadingOverlay   = document.getElementById("loading-overlay");
const loadingText      = document.getElementById("loading-text");

// ──────────────────────────────────────────────
// フェーズ管理
// ──────────────────────────────────────────────

function setPhase(phase) {
  state.phase = phase;
  app.dataset.phase = phase;
}

// ──────────────────────────────────────────────
// Canvas 初期化（HiDPI 対応）
// ──────────────────────────────────────────────

function setupCanvas() {
  state.dpr = window.devicePixelRatio || 1;
  const cssSize = Math.min(window.innerWidth * 0.8, 360);

  canvas.style.width  = cssSize + "px";
  canvas.style.height = cssSize + "px";
  canvas.width        = cssSize * state.dpr;
  canvas.height       = cssSize * state.dpr;

  ctx.scale(state.dpr, state.dpr);
}

/** キャンバスの論理サイズ（CSS px）を返す */
function canvasLogicalSize() {
  return canvas.width / state.dpr;
}

// ──────────────────────────────────────────────
// ローディング表示
// ──────────────────────────────────────────────

function showLoading(text = "考え中...") {
  loadingText.textContent = text;
  setPhase("loading");
}

function hideLoading() {
  // 直前のフェーズには戻らず、呼び出し側が次フェーズを設定する
  loadingOverlay.style.display = "";
}

// ──────────────────────────────────────────────
// 画像処理（撮影 or アップロード → API）
// ──────────────────────────────────────────────

function resizeImageToBase64(file, maxPx = 1024) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = reject;
    reader.onload = (ev) => {
      const img = new Image();
      img.onerror = reject;
      img.onload = () => {
        const scale = Math.min(1, maxPx / Math.max(img.width, img.height));
        const w = Math.round(img.width  * scale);
        const h = Math.round(img.height * scale);

        const offscreen = document.createElement("canvas");
        offscreen.width  = w;
        offscreen.height = h;
        offscreen.getContext("2d").drawImage(img, 0, 0, w, h);

        const dataUrl = offscreen.toDataURL("image/jpeg", 0.85);
        resolve({
          base64:    dataUrl.split(",")[1],
          mediaType: "image/jpeg",
        });
      };
      img.src = ev.target.result;
    };
    reader.readAsDataURL(file);
  });
}

async function handleFileSelected(file) {
  if (!file) return;

  showLoading("食べ物を認識中...");

  try {
    const { base64, mediaType } = await resizeImageToBase64(file);
    const item = await recognizeFood(base64, mediaType);

    state.history     = [item];
    state.currentItem = item;
    state.clickCount  = 0;
    resetFracture();

    enterReadyPhase();
  } catch (err) {
    setPhase("upload");
    alert("認識に失敗しました。もう一度お試しください。\n(" + err.message + ")");
  }
}

// ──────────────────────────────────────────────
// ゲームフェーズ
// ──────────────────────────────────────────────

function enterReadyPhase() {
  state.clickCount    = 0;
  state.revealedCount = 0;
  state.clickInCycle  = 0;
  resetFracture();
  wordsArea.innerHTML = "";
  progressRow.classList.remove("hidden");
  updateProgress();
  updateBreadcrumbs();
  setupCanvas();
  renderSilhouette();
  setPhase("ready");
}

function renderSilhouette() {
  const size = canvasLogicalSize();
  ctx.clearRect(0, 0, size, size);
  drawSilhouette(ctx, state.currentItem, size / 2, size / 2, size);
  drawCracks(ctx);
  drawFoodLabel(ctx, state.currentItem.food_name, size / 2, size / 2, size);
}

function drawFoodLabel(ctx, text, cx, cy, size) {
  // クリック進行度（0〜1）に応じてテキストを揺らす
  const progress = state.clickCount > 0
    ? (state.clickInCycle / state.clicksPerWord)
    : 0;
  const shake = progress > 0.5
    ? (Math.random() - 0.5) * size * 0.015 * (progress - 0.5) * 2
    : 0;

  ctx.save();
  ctx.font = `bold ${Math.round(size * 0.13)}px "Zen Maru Gothic", "Hiragino Sans", sans-serif`;
  ctx.textAlign    = "center";
  ctx.textBaseline = "middle";

  // 影で読みやすくする
  ctx.shadowColor  = "rgba(0,0,0,0.6)";
  ctx.shadowBlur   = size * 0.04;
  ctx.shadowOffsetX = shake;
  ctx.shadowOffsetY = shake;

  // クリックが進むほど少し透明に（割れる予感）
  ctx.globalAlpha = Math.max(0.4, 1 - progress * 0.5);
  ctx.fillStyle   = "rgba(255,255,255,0.95)";
  ctx.fillText(text, cx + shake, cy + shake);
  ctx.restore();
}

/**
 * 噛む（クリック/タップ）の処理。
 * ここを MediaPipe や ARKit のコールバックに差し替えることで噛む検出を変更できる。
 */
export function onChew() {
  if (state.phase !== "ready" && state.phase !== "cracking") return;

  const words = state.currentItem.words;
  if (state.revealedCount >= words.length) return; // 全ワード出現済み

  state.clickCount++;
  state.clickInCycle++;
  setPhase("cracking");

  const size = canvasLogicalSize();
  addCrack(size / 2, size / 2, size);
  renderSilhouette();
  updateProgress();

  if (state.clickInCycle >= state.clicksPerWord) {
    state.clickInCycle = 0;
    revealNextWord();
  }
}

function revealNextWord() {
  const words = state.currentItem.words;
  const word  = words[state.revealedCount];
  state.revealedCount++;

  appendWordCard(word, state.revealedCount - 1);

  // 全ワード出現したらシルエットをフェードアウト
  if (state.revealedCount >= words.length) {
    setPhase("exploded");
    progressRow.classList.add("hidden");
    startExplosion(canvas, ctx, renderSilhouette, () => {});
  }
}

function updateProgress() {
  const pct = (state.clickInCycle / state.clicksPerWord) * 100;
  progressFill.style.width = pct + "%";

  const remaining = state.currentItem.words.length - state.revealedCount;
  if (remaining > 0) {
    progressText.textContent = `あと ${remaining} ワード`;
  }
}

// ──────────────────────────────────────────────
// ワードカード
// ──────────────────────────────────────────────

/** ワードカードを1枚追加して表示する */
function appendWordCard(word, index) {
  const card = document.createElement("button");
  card.className = "word-card";
  card.style.backgroundColor = word.color || "#5c5f8a";
  card.style.setProperty("--card-i", index);
  card.innerHTML = `
    <span class="word-text">${word.text}</span>
    <span class="word-category">${word.category}</span>
    ${word.reason ? `<span class="word-tooltip">${word.reason}</span>` : ""}
  `;
  card.addEventListener("pointerdown", () => handleWordTap(word));
  wordsArea.appendChild(card);

  // 双 RAF でフェードイン
  requestAnimationFrame(() => {
    requestAnimationFrame(() => card.classList.add("visible"));
  });
}

async function handleWordTap(word) {
  if (state.phase === "drilling") return; // 連打防止

  setPhase("drilling");
  loadingText.textContent = `「${word.text}」を分解中...`;

  try {
    const item = await decomposeWord(word.text);

    state.currentItem   = item;
    state.history.push(item);
    state.clickCount    = 0;
    state.revealedCount = 0;
    state.clickInCycle  = 0;
    resetFracture();

    enterReadyPhase();
  } catch (err) {
    setPhase("exploded");
    alert("分解に失敗しました。\n(" + err.message + ")");
  }
}

// ──────────────────────────────────────────────
// パンくず
// ──────────────────────────────────────────────

function updateBreadcrumbs() {
  breadcrumbsEl.innerHTML = "";

  const SHOW  = 3;
  const total = state.history.length;
  const start = Math.max(0, total - SHOW);

  if (start > 0) {
    const el = document.createElement("span");
    el.className   = "crumb-ellipsis";
    el.textContent = "...";
    breadcrumbsEl.appendChild(el);
  }

  for (let i = start; i < total; i++) {
    if (i > start || start > 0) {
      const sep = document.createElement("span");
      sep.className   = "crumb-sep";
      sep.textContent = "›";
      breadcrumbsEl.appendChild(sep);
    }

    const item = state.history[i];
    const btn  = document.createElement("button");
    btn.className   = "crumb-btn" + (i === total - 1 ? " active" : "");
    btn.textContent = item.food_name;

    if (i < total - 1) {
      const idx = i; // クロージャ用
      btn.addEventListener("pointerdown", () => goToHistory(idx));
    }

    breadcrumbsEl.appendChild(btn);
  }
}

function goToHistory(index) {
  if (state.phase === "drilling") return;

  state.history     = state.history.slice(0, index + 1);
  state.currentItem = state.history[state.history.length - 1];
  state.clickCount  = 0;
  resetFracture();

  enterReadyPhase();
}

// ──────────────────────────────────────────────
// リセット
// ──────────────────────────────────────────────

function reset() {
  state.currentItem = null;
  state.clickCount  = 0;
  state.history     = [];
  resetFracture();

  wordsArea.innerHTML    = "";
  breadcrumbsEl.innerHTML = "";
  progressRow.classList.add("hidden");

  const size = canvasLogicalSize();
  ctx.clearRect(0, 0, size, size);

  setPhase("upload");
}

// ──────────────────────────────────────────────
// API キーチェック
// ──────────────────────────────────────────────

function checkApiKey() {
  // APIキーはサーバー側で管理。フロントから確認不要。
}

// ──────────────────────────────────────────────
// イベントリスナー
// ──────────────────────────────────────────────

fileInput.addEventListener("change", (e) => {
  handleFileSelected(e.target.files[0]);
  e.target.value = "";
});

// ── カメラ（getUserMedia）──

let cameraStream = null;

function stopCamera() {
  if (cameraStream) {
    cameraStream.getTracks().forEach(t => t.stop());
    cameraStream = null;
  }
  cameraUi.classList.add("hidden");
}

cameraBtn.addEventListener("click", async () => {
  try {
    cameraStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: "environment", width: { ideal: 1280 }, height: { ideal: 720 } }
    });
    cameraVideo.srcObject = cameraStream;
    cameraUi.classList.remove("hidden");
  } catch {
    // getUserMedia 失敗時はファイル選択にフォールバック
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.capture = "environment";
    input.onchange = (e) => handleFileSelected(e.target.files[0]);
    input.click();
  }
});

captureBtn.addEventListener("click", () => {
  cameraCanvas.width  = cameraVideo.videoWidth;
  cameraCanvas.height = cameraVideo.videoHeight;
  cameraCanvas.getContext("2d").drawImage(cameraVideo, 0, 0);

  cameraCanvas.toBlob((blob) => {
    stopCamera();
    handleFileSelected(blob);
  }, "image/jpeg", 0.85);
});

cameraCloseBtn.addEventListener("click", stopCamera);

canvas.addEventListener("pointerdown", (e) => {
  e.preventDefault();
  onChew();
});

resetBtn.addEventListener("pointerdown", (e) => {
  e.preventDefault();
  reset();
});

window.addEventListener("resize", () => {
  if (state.phase === "ready" || state.phase === "cracking") {
    setupCanvas();
    renderSilhouette();
  }
});

// ──────────────────────────────────────────────
// 初期化
// ──────────────────────────────────────────────


checkApiKey();
setupCanvas();
