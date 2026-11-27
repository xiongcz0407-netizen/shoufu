// 秘书立绘：按人物外框缩放、下边对齐；呼吸、点一下弹一下（取消眨眼：不加载、不显示 *_blink.webp；meta.json 里的 blink 字段留着不用）
// 设计66：全身秘书（fullBody）的 cN.webp 打包时已经裁到大腿（tools/assets.py，meta.json 每套可写 crop），这里照旧按外框摆，跟老秘书一样大；
//   只有衣柜要看全身：setFull(true) 换成原尺寸 cN_full.webp、用 meta 里的 full.bbox
import { asset, getSecMeta, hasAsset } from '../platform/assets.js?v=5f2b1b8c';

/** 设计66 第七节第 1 条补：剧情、秘书加入、日程 / 出差小场景、约会、商战结果里的立绘跟主页走同一个 layout——
 *  按 meta.json 的人物外框居中、下边贴底（全身秘书的 cN.webp 打包时已经裁到大腿，meta 里的 crop 也在那里生效）；老秘书按外框整个人居中。
 *  host 里加一个 .story-sec 舞台（插在 before 前面），返回 { el, portrait, show(outfit) } */
export function storyPortrait(host, secId, outfit = 'c1', before = null) {
  const box = document.createElement('div'); box.className = 'story-sec';
  host.insertBefore(box, before);
  const p = createPortrait(box); p.el.classList.add('in-story');
  p.show(secId, outfit, { fade: false });
  return { el: box, portrait: p, show: (o) => p.show(secId, o, { fade: 'dress' }) };
}

export function createPortrait(stage) {
  const wrap = document.createElement('div');
  wrap.className = 'portrait';
  const breathe = document.createElement('div');
  breathe.className = 'breathe';
  const img = document.createElement('img');
  img.className = 'sec-img'; img.draggable = false; img.alt = '';
  breathe.append(img);
  wrap.appendChild(breathe);
  stage.appendChild(wrap);

  let cur = null, info = null, full = false;
  const SRC_W = 720, SRC_H = 1080;

  function layout() {
    if (!info) return;
    const W = stage.clientWidth, H = stage.clientHeight;
    const [x0, y0, x1, y1] = info.bbox;
    const bw = x1 - x0, bh = y1 - y0;
    // 人物外框塞进舞台：高最多占满，宽最多 96%；躺着的图按宽算
    const k = Math.min(H / bh, (W * 0.96) / bw);
    const w = SRC_W * k, h = SRC_H * k;
    const left = W / 2 - (x0 + bw / 2) * k;   // 人物居中
    const top = H - y1 * k;                     // 人物下边贴舞台底
    Object.assign(breathe.style, { width: w + 'px', height: h + 'px', left: left + 'px', top: top + 'px',
      transformOrigin: `${(x0 + bw / 2) * k}px ${y1 * k}px` });
  }

  function show(secId, outfit = 'c1', { fade = true } = {}) {
    const meta = getSecMeta()[secId];
    info = meta && meta.outfits[outfit];
    if (!info) info = { bbox: [0, 0, SRC_W, SRC_H] };
    cur = { secId, outfit };
    const fp = `assets/sec/${secId}/${outfit}_full.webp`;
    if (full && info.full && hasAsset(fp)) { info = info.full; img.src = asset(fp); }   // 设计66：衣柜看全身
    else img.src = asset(`assets/sec/${secId}/${outfit}.webp`);
    layout();
    const cls = fade === 'dress' ? 'dress' : 'fade-in';
    if (fade) { wrap.classList.remove('fade-in', 'dress'); void wrap.offsetWidth; wrap.classList.add(cls); }
  }

  /** 点一下弹一下；返回点到的部位：head / body / legs（按人物外框的高度比例） */
  function hitPart(clientY) {
    const r = breathe.getBoundingClientRect();
    const [, y0, , y1] = info.bbox; const k = r.height / SRC_H;
    const t = (clientY - (r.top + y0 * k)) / ((y1 - y0) * k);
    return t < 0.22 ? 'head' : t < 0.6 ? 'body' : 'legs';
  }
  function bounce() { breathe.classList.remove('bounce'); void breathe.offsetWidth; breathe.classList.add('bounce'); }

  // 舞台大小变了（包括主界面从隐藏变成显示）就重新摆
  if (typeof ResizeObserver !== 'undefined') new ResizeObserver(layout).observe(stage); else window.addEventListener('resize', layout);
  /** 不用了（秘书详情关掉）：放掉当前这套的信息（原来还停眨眼定时器，眨眼取消了） */
  function stop() { info = null; }
  /** 设计66：衣柜页 true（全身）、别的页 false（裁到大腿）；换了就按当前这套重摆 */
  function setFull(on) { if (full === !!on) return; full = !!on; if (cur) show(cur.secId, cur.outfit, { fade: false }); }
  return { el: wrap, imgEl: img, show, layout, bounce, hitPart, stop, setFull, get current() { return cur; } };
}
