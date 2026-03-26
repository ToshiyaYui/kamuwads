/**
 * shapes.js — Canvas シルエット描画
 *
 * すべての関数は副作用のない純粋関数に近い設計。
 * ctx の save/restore は各関数内で完結する。
 */

/**
 * 食べ物のシルエットを描画する。
 * @param {CanvasRenderingContext2D} ctx
 * @param {{ shape: string, color: string }} item
 * @param {number} cx — 中心 X（論理ピクセル）
 * @param {number} cy — 中心 Y
 * @param {number} size — キャンバスの論理サイズ（width == height を想定）
 */
export function drawSilhouette(ctx, item, cx, cy, size) {
  const { shape, color } = item;
  const s = size * 0.62; // シルエットはキャンバスの約 62% を使う

  ctx.save();

  // 外側グロー
  ctx.shadowBlur  = size * 0.12;
  ctx.shadowColor = color;

  // グラデーション（立体感）
  const grad = ctx.createRadialGradient(
    cx - s * 0.12, cy - s * 0.12, s * 0.05,
    cx, cy, s * 0.55
  );
  grad.addColorStop(0,   lighten(color, 0.3));
  grad.addColorStop(0.6, color);
  grad.addColorStop(1,   darken(color, 0.35));

  ctx.fillStyle = grad;
  ctx.beginPath();
  buildShapePath(ctx, shape, cx, cy, s);
  ctx.fill();

  ctx.restore();
}

/**
 * キャンバスをクリアする。
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} w
 * @param {number} h
 */
export function clearCanvas(ctx, w, h) {
  ctx.clearRect(0, 0, w, h);
}

/**
 * shape に対応する Path2D を返す（クリック判定に利用可能）。
 * @param {CanvasRenderingContext2D} ctx
 * @param {string} shape
 * @param {number} cx
 * @param {number} cy
 * @param {number} s — サイズ半径相当
 * @returns {Path2D}
 */
export function buildShapePath(ctx, shape, cx, cy, s) {
  switch (shape) {
    case "circle":
      ctx.arc(cx, cy, s * 0.5, 0, Math.PI * 2);
      break;

    case "oval":
      ctx.ellipse(cx, cy, s * 0.48, s * 0.38, 0, 0, Math.PI * 2);
      break;

    case "rectangle":
      ctx.roundRect(cx - s * 0.46, cy - s * 0.34, s * 0.92, s * 0.68, s * 0.1);
      break;

    case "triangle":
      ctx.moveTo(cx,          cy - s * 0.48);
      ctx.lineTo(cx + s * 0.5, cy + s * 0.32);
      ctx.lineTo(cx - s * 0.5, cy + s * 0.32);
      ctx.closePath();
      break;

    default:
      // フォールバック: 円
      ctx.arc(cx, cy, s * 0.5, 0, Math.PI * 2);
  }
}

// ───────────────── カラーユーティリティ ─────────────────

/** 16進数カラーを RGB オブジェクトに変換する */
function hexToRgb(hex) {
  const h = hex.replace("#", "");
  const n = parseInt(h.length === 3 ? h.split("").map(c => c + c).join("") : h, 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

/** 色を明るくする（0〜1） */
function lighten(hex, amt) {
  const { r, g, b } = hexToRgb(hex);
  return `rgb(${Math.min(255, r + 255 * amt)},${Math.min(255, g + 255 * amt)},${Math.min(255, b + 255 * amt)})`;
}

/** 色を暗くする（0〜1） */
function darken(hex, amt) {
  const { r, g, b } = hexToRgb(hex);
  return `rgb(${Math.max(0, r - 255 * amt)},${Math.max(0, g - 255 * amt)},${Math.max(0, b - 255 * amt)})`;
}
