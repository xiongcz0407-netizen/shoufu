// 屏幕包一层：手机上铺满；电脑上（窗口偏宽）居中一个 9:19.5 的手机框
export const PHONE_RATIO = 9 / 19.5;
export function fitPhone(phone) {
  const apply = () => {
    const w = window.innerWidth, h = window.innerHeight;
    const isPhoneLike = w / h <= 9 / 16 + 0.001; // 最窄兼容 9:16，再宽就当电脑
    document.body.classList.toggle('desktop', !isPhoneLike);
    if (isPhoneLike) { phone.style.width = w + 'px'; phone.style.height = h + 'px'; }
    else {
      const ph = Math.min(h - 24, 900);
      phone.style.height = ph + 'px';
      phone.style.width = Math.round(ph * PHONE_RATIO) + 'px';
    }
  };
  apply();
  window.addEventListener('resize', apply);
  return apply;
}
/** 后台停：切到后台时调用 onHide，回来时 onShow */
export function onVisibility(onHide, onShow) {
  document.addEventListener('visibilitychange', () => (document.hidden ? onHide() : onShow()));
}
