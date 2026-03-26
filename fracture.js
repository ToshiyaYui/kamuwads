/**
 * fracture.js — ヒビ・分解アニメーション
 *
 * 将来の差し替えを考慮し、外部への依存は最小限に抑える。
 * ピースのデータ構造は将来の SVG エクスポート用に保持する。
 *
 * MVP 実装:
 *  - クリックごとにランダムなヒビ線を追加
 *  - 分解時にキャンバスをフェードアウト
 *
 * @typedef {{ x1:number, y1:number, points:{x:number,y:number}[] }} CrackLine
 * @typedef {{ id:string, polygon:{x:number,y:number}[], color:string, vx:number, vy:number, angle:number, angVel:number, alpha:number }} Fragment
 */

let _cracks    = [];  /** @type {CrackLine[]} */
let _fragments = [];  /** @type {Fragment[]}  — 将来の SVG エクスポート用 */
let _rafId     = null;

// ──────────────────────────────────────────────
// Public API
// ──────────────────────────────────────────────

/**
 * 状態をリセットする。
 */
export function resetFracture() {
  _cracks    = [];
  _fragments = [];
  if (_rafId !== null) {
    cancelAnimationFrame(_rafId);
    _rafId = null;
  }
}

/**
 * ヒビを 1 本追加する。
 * @param {number} cx — シルエット中心 X
 * @param {number} cy — シルエット中心 Y
 * @param {number} size — キャンバス論理サイズ
 */
export function addCrack(cx, cy, size) {
  _cracks.push(generateCrack(cx, cy, size));
}

/**
 * 現在のヒビをすべて描画する。
 * @param {CanvasRenderingContext2D} ctx
 */
export function drawCracks(ctx) {
  if (_cracks.length === 0) return;

  ctx.save();
  ctx.strokeStyle = "rgba(255, 255, 255, 0.75)";
  ctx.lineWidth   = 1.2;
  ctx.lineCap     = "round";
  ctx.lineJoin    = "round";

  for (const crack of _cracks) {
    ctx.beginPath();
    ctx.moveTo(crack.x1, crack.y1);
    for (const p of crack.points) {
      ctx.lineTo(p.x, p.y);
    }
    ctx.stroke();

    // 枝（ランダムに 1〜2 本）
    if (crack.branches) {
      for (const branch of crack.branches) {
        ctx.beginPath();
        ctx.moveTo(branch.x1, branch.y1);
        for (const p of branch.points) ctx.lineTo(p.x, p.y);
        ctx.stroke();
      }
    }
  }

  ctx.restore();
}

/**
 * 分解爆発アニメーションを開始する。
 * アニメーション完了後に onComplete を呼ぶ。
 *
 * @param {HTMLCanvasElement} canvas
 * @param {CanvasRenderingContext2D} ctx
 * @param {function} redrawFn — 毎フレーム呼ぶシルエット再描画関数
 * @param {function} onComplete
 */
export function startExplosion(canvas, ctx, redrawFn, onComplete) {
  // フラグメントデータを生成（将来の SVG エクスポート用に保持）
  _fragments = generateFragments(canvas.width / devicePixelRatio, canvas.height / devicePixelRatio);

  const DURATION = 450; // ms
  const start    = performance.now();

  function frame(now) {
    const t       = Math.min((now - start) / DURATION, 1);
    const opacity = 1 - easeIn(t);

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (opacity > 0) {
      ctx.save();
      ctx.globalAlpha = opacity;
      redrawFn();
      ctx.restore();
    }

    if (t < 1) {
      _rafId = requestAnimationFrame(frame);
    } else {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      _rafId = null;
      onComplete();
    }
  }

  _rafId = requestAnimationFrame(frame);
}

/**
 * 保持しているフラグメントデータを返す（SVG エクスポート用）。
 * @returns {Fragment[]}
 */
export function getFragments() {
  return _fragments.slice();
}

// ──────────────────────────────────────────────
// Internal helpers
// ──────────────────────────────────────────────

/**
 * ランダムなヒビ線を生成する（ポリライン + 枝）。
 */
function generateCrack(cx, cy, size) {
  const angle   = Math.random() * Math.PI * 2;
  const maxLen  = size * (0.28 + Math.random() * 0.22);
  const steps   = 4 + Math.floor(Math.random() * 4);
  const stepLen = maxLen / steps;

  // 開始点をシルエット内側からランダムにずらす
  const startDist = size * (0.03 + Math.random() * 0.08);
  let x = cx + Math.cos(angle) * startDist;
  let y = cy + Math.sin(angle) * startDist;
  const points = [];

  let dir = angle;
  for (let i = 0; i < steps; i++) {
    dir += (Math.random() - 0.5) * 0.45;
    x   += Math.cos(dir) * stepLen;
    y   += Math.sin(dir) * stepLen;
    points.push({ x, y });
  }

  // 枝を 1〜2 本追加
  const numBranches = Math.floor(Math.random() * 2) + 1;
  const branches    = [];

  for (let b = 0; b < numBranches; b++) {
    const branchAt = Math.floor(points.length * (0.3 + Math.random() * 0.4));
    const origin   = branchAt > 0 ? points[branchAt - 1] : { x: cx + Math.cos(angle) * startDist, y: cy + Math.sin(angle) * startDist };
    const bAngle   = dir + (Math.random() > 0.5 ? 1 : -1) * (0.4 + Math.random() * 0.6);
    const bLen     = maxLen * (0.25 + Math.random() * 0.25);
    const bSteps   = 2 + Math.floor(Math.random() * 3);
    const bPoints  = [];

    let bx = origin.x, by = origin.y, bd = bAngle;
    for (let i = 0; i < bSteps; i++) {
      bd += (Math.random() - 0.5) * 0.4;
      bx += Math.cos(bd) * (bLen / bSteps);
      by += Math.sin(bd) * (bLen / bSteps);
      bPoints.push({ x: bx, y: by });
    }

    branches.push({ x1: origin.x, y1: origin.y, points: bPoints });
  }

  return { x1: cx + Math.cos(angle) * startDist, y1: cy + Math.sin(angle) * startDist, points, branches };
}

/**
 * フラグメントデータを生成する（将来の SVG エクスポート用）。
 * MVP では視覚描画には使わない。データ構造の保持が目的。
 */
function generateFragments(w, h) {
  const cx    = w / 2;
  const cy    = h / 2;
  const count = 8 + Math.floor(Math.random() * 6);
  const frags = [];

  for (let i = 0; i < count; i++) {
    const angle = (Math.PI * 2 / count) * i + (Math.random() - 0.5) * 0.4;
    const r     = w * (0.12 + Math.random() * 0.15);

    // 簡易ポリゴン（扇形の近似）
    const polygon = [
      { x: cx, y: cy },
      { x: cx + Math.cos(angle - 0.35) * r, y: cy + Math.sin(angle - 0.35) * r },
      { x: cx + Math.cos(angle)         * r * 1.2, y: cy + Math.sin(angle) * r * 1.2 },
      { x: cx + Math.cos(angle + 0.35) * r, y: cy + Math.sin(angle + 0.35) * r },
    ];

    frags.push({
      id:      `frag-${i}`,
      polygon,
      color:   "#ffffff",
      vx:      Math.cos(angle) * (1 + Math.random() * 2),
      vy:      Math.sin(angle) * (1 + Math.random() * 2),
      angle:   0,
      angVel:  (Math.random() - 0.5) * 0.08,
      alpha:   1,
    });
  }

  return frags;
}

function easeIn(t) {
  return t * t;
}
