// page-bridge.js
// 桥接脚本：在业务页面（pages/*.html）中通过 <script src> 引入，是工作台外壳的一部分。
// AI 严禁修改、禁止内联、禁止省略。
//
// 架构（v2 · 声明式锚定）：
//   标注视觉 = 锚点元素自身的 CSS 状态（徽章 / outline 高亮 / 脉冲动画），不再注入
//   absolute 覆盖层。位置跟踪由浏览器排版引擎原生完成：本脚本不做任何几何测量
//   （无 getBoundingClientRect 坐标快照，无 resize / transitionend / 位置类
//   MutationObserver 补丁），滚动、动画、显隐、缩放天然跟随，从构造上杜绝标注漂移。
//
//   徽章策略（两条路径，按元素类型一次性选择）：
//   1) 普通元素 → ::after 伪元素徽章：徽章是元素自身的一部分，display/visibility/
//      opacity 任何显隐状态天然随元素生灭，构造上零维护；
//   2) replaced element（img/input 等无伪元素）→ CSS Anchor Positioning 独立徽章，
//      显隐三条件门控：总开关 && 显隐语义祖先链（display/visibility/opacity）&&
//      IntersectionObserver 几何相交；触发点为 class/style 属性突变与 transitionend，
//      只刷显隐布尔值、不测量位置、不重建锚点。
//      已知限制：WAAPI 驱动的 opacity、样式表/媒体查询直接驱动的显隐（不动元素
//      class/style 属性）无法被门控感知——该机制的固有边界，与同类方案持平；
//      普通元素 ::after 路径对这两类结构性免疫。
//   3) replaced element 且浏览器不支持 Anchor Positioning → 仅保留描边高亮。
//
// 消息协议：
//   上报 → 父页面：PRD_ANNOTATION_LIST { ids, href }、PRD_ANCHOR_CLICK { id }、
//                  PRD_ANCHOR_HOVER { id, action: 'show'|'hide' }
//   接收 ← 父页面：PRD_QUERY、PRD_RESCAN、PRD_SET_VISIBLE { enabled }、
//                  PRD_SET_SHOW_ALL { enabled }、PRD_PULSE { id }、
//                  PRD_SET_ACTIVE { id|null }、PRD_HOVER { id|null }

(function() {
  'use strict';

  // 只在 iframe 内激活（页面被直接打开时不做任何事）
  if (window.top === window.self) return;

  // 同源（http/https）时使用具体 origin 收发，file:// 交付态回退为 '*'（opaque origin 无法指定）。
  const IS_HTTP = window.location.protocol === 'http:' || window.location.protocol === 'https:';
  const TARGET_ORIGIN = IS_HTTP ? window.location.origin : '*';

  // ---------- 标注层样式（iframe 内唯一样式来源，含 Inspector 编辑态样式） ----------
  const ANNOTATION_CSS = `
    /* ===== PM-Framework PRD 标注层 · 声明式锚定，零 JS 测量 ===== */
    /* 徽章通用视觉（replaced element 独立元素 与 普通元素 ::after 共用，仅定位/显示方式不同） */
    .prd-rbadge,
    html.prd-on [data-prd-id].prd-badge-pseudo::after {
      box-sizing: border-box;
      min-width: 18px;
      height: 18px;
      padding: 0 4px;
      background-color: #3b82f6;
      color: #ffffff;
      border-radius: 9999px;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
      font-size: 11px;
      font-weight: 600;
      line-height: 18px;
      text-align: center;
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.18);
      z-index: 2147483646;
      pointer-events: none;
      transition: transform 0.15s ease, background-color 0.15s ease;
    }
    /* 徽章（replaced element 专用，CSS Anchor Positioning 路径）：独立元素，位置向浏览器声明 */
    .prd-rbadge {
      position: absolute;
      top: anchor(top, 4px);
      right: anchor(right, 4px);
      margin: 4px 4px 0 0 !important; /* 内缩进锚点右上角；!important 对抗 space-y-* 等容器子选择器 */
      display: none;
      align-items: center;
      justify-content: center;
    }
    html.prd-on .prd-rbadge { display: flex; }
    html.prd-on .prd-rbadge.prd-badge-off { display: none; } /* 门控判定锚点不可见时隐藏 */
    /* rbadge 强调态（卡片 hover 联动时由 setHover 同步类名，与 ::after 路径视觉对齐） */
    html.prd-on .prd-rbadge.prd-badge-hover {
      transform: scale(1.15);
      background-color: #2563eb;
    }

    /* 徽章（普通元素，::after 路径）：元素自身的一部分，显隐/透明度天然跟随 */
    html.prd-on [data-prd-id].prd-badge-pseudo::after {
      content: attr(data-prd-num);
      position: absolute;
      top: 4px;
      right: 4px;
    }
    /* 徽章 hover 微交互（纯 CSS，锚点即热区） */
    html.prd-on [data-prd-id].prd-badge-pseudo:hover::after {
      transform: scale(1.15);
      background-color: #2563eb;
    }

    html.prd-on [data-prd-id] { cursor: pointer; }

    /* 卡片 hover 联动（虚线）：内嵌描边，防祖先 overflow:hidden 紧裁剪切断 */
    html.prd-on [data-prd-id].prd-hover {
      outline: 2px dashed rgba(59, 130, 246, 0.65) !important;
      outline-offset: -2px;
    }
    /* 走查当前项（实线常驻，直到切换）：内嵌实线 + 外发光（发光可被裁剪，可接受） */
    html.prd-on [data-prd-id].prd-active {
      outline: 2px solid rgba(59, 130, 246, 0.9) !important;
      outline-offset: -2px;
      box-shadow: 0 0 0 4px rgba(59, 130, 246, 0.12);
    }
    /* "全部高亮"开关（虚线，内嵌） */
    html.prd-on.prd-show-all [data-prd-id] {
      outline: 2px dashed rgba(59, 130, 246, 0.4) !important;
      outline-offset: -2px;
    }
    html.prd-on.prd-show-all [data-prd-id].prd-hover,
    html.prd-on.prd-show-all [data-prd-id].prd-active {
      outline-style: solid !important;
      outline-color: rgba(59, 130, 246, 0.9) !important;
    }

    /* 点击定位的瞬时脉冲：动画期间跟随元素，结束后自动消退。
       保持外扩 +2px：脉冲是瞬时寻路信号，外扩更醒目；且脉冲前已 scrollIntoView 居中，
       几乎不可能处于裁剪边缘 */
    @keyframes prdPulseRing {
      0%   { box-shadow: 0 0 0 0 rgba(59, 130, 246, 0.45); }
      100% { box-shadow: 0 0 0 12px rgba(59, 130, 246, 0); }
    }
    html.prd-on [data-prd-id].prd-pulse {
      outline: 2px solid rgba(59, 130, 246, 0.95) !important;
      outline-offset: 2px;
      animation: prdPulseRing 0.7s ease-out 3;
    }

    /* DOM Inspector（编辑视图点选元素，仅同源下由父页面触发） */
    .prd-inspector-hover {
      outline: 2px solid #3b82f6 !important;
      outline-offset: -2px;
      cursor: crosshair !important;
      background-color: rgba(59, 130, 246, 0.1) !important;
    }
  `;

  function injectStyle() {
    if (document.getElementById('pm-prd-style')) return;
    const style = document.createElement('style');
    style.id = 'pm-prd-style';
    style.textContent = ANNOTATION_CSS;
    (document.head || document.documentElement).appendChild(style);
  }

  // ---------- 能力检测与元素判定 ----------
  const SUPPORTS_ANCHOR = !!(window.CSS && CSS.supports && CSS.supports('anchor-name: --x'));
  // 无 ::after 伪元素的元素（replaced / void / svg）
  const NO_PSEUDO = new Set(['IMG', 'INPUT', 'TEXTAREA', 'SELECT', 'CANVAS', 'VIDEO', 'AUDIO', 'IFRAME', 'OBJECT', 'EMBED', 'SVG', 'BR', 'HR']);

  // ---------- 扫描与编号 ----------
  // rbadge 显隐门控登记表：[{ el, badge, visible(显隐语义), intersecting(几何相交) }]
  let rbadgeItems = [];

  function clearAnchorBadges() {
    document.querySelectorAll('.prd-rbadge').forEach(b => b.remove());
    if (visibilityIO) visibilityIO.disconnect(); // 观察者复用：disconnect 后仍可继续 observe
    rbadgeItems = [];
  }

  // 显隐语义判定（零尺寸 display:none / visibility:hidden 可继承 / 祖先链 opacity:0）
  function isEffectivelyVisible(el) {
    let node = el;
    while (node && node.nodeType === 1) {
      const cs = window.getComputedStyle(node);
      if (cs.display === 'none') return false;
      if (cs.visibility === 'hidden' || cs.visibility === 'collapse') return false;
      if (parseFloat(cs.opacity) === 0) return false;
      node = node.parentElement;
    }
    return true;
  }

  // 显隐三条件门控：显隐语义 && 几何相交（总开关由 html.prd-on 的 CSS 承载）
  function applyBadgeGate(item) {
    item.badge.classList.toggle('prd-badge-off', !(item.visible && item.intersecting));
  }
  function refreshAllBadgeGates() {
    for (let i = 0; i < rbadgeItems.length; i++) {
      const item = rbadgeItems[i];
      item.visible = isEffectivelyVisible(item.el);
      applyBadgeGate(item);
    }
  }

  // replaced element 徽章的几何可见性同步（滚出视口/容器裁剪），不测量位置
  let visibilityIO = null;
  function watchAnchorVisibility(el, badge, item) {
    if (!visibilityIO) {
      visibilityIO = new IntersectionObserver((entries) => {
        entries.forEach((en) => {
          const it = en.target.__prdGateItem;
          if (!it) return;
          it.intersecting = en.isIntersecting;
          applyBadgeGate(it);
        });
      });
    }
    el.__prdGateItem = item;
    el.__prdBadgeEl = badge; // M3：卡片 hover 联动时同步徽章强调态
    visibilityIO.observe(el);
  }

  // 扫描 [data-prd-id]，按文档顺序编号，为每个锚点挂上徽章，并向父页面汇报清单。
  // 只读 DOM + 写少量 attribute，不做任何几何测量。
  function scan() {
    clearAnchorBadges();

    const els = Array.from(document.querySelectorAll('[data-prd-id]'));
    els.forEach((el, index) => {
      const num = index + 1;
      el.setAttribute('data-prd-num', String(num));

      if (!NO_PSEUDO.has(el.tagName)) {
        // 普通元素：::after 伪元素徽章（static 时补 relative，一次性声明；
        // 徽章随元素的 display/visibility/opacity 任何状态生灭，无需跟踪）
        el.classList.add('prd-badge-pseudo');
        if (window.getComputedStyle(el).position === 'static') {
          el.style.position = 'relative';
        }
      } else if (SUPPORTS_ANCHOR) {
        // replaced element + 现代浏览器：Anchor Positioning 独立徽章 + 显隐门控
        try {
          const name = '--pm-prd-' + num; // 前缀隔离，避免与业务页面自用 anchor-name 碰撞
          el.style.anchorName = name;
          const badge = document.createElement('span');
          badge.className = 'prd-rbadge';
          badge.textContent = String(num);
          badge.style.positionAnchor = name;
          document.body.appendChild(badge);
          const item = { el: el, badge: badge, visible: isEffectivelyVisible(el), intersecting: true };
          rbadgeItems.push(item);
          watchAnchorVisibility(el, badge, item);
        } catch (e) {
          // shadow DOM 边界等极端环境失败时静默降级为仅描边
        }
      }
      // replaced element + 无 Anchor 支持：无徽章，仅保留描边能力（卡片点击脉冲仍可用）
    });

    // 初始门控判定（IO 首次回调前先把语义不可见的徽章关掉）
    refreshAllBadgeGates();

    // 清理已失效锚点的编号残留（anchor-name / position:relative 为一次性声明，
    // 失去锚点身份后无消费者，属无害残留，不回滚以避免误清页面自有样式）
    document.querySelectorAll('[data-prd-num]:not([data-prd-id])').forEach(el => {
      el.removeAttribute('data-prd-num');
      el.classList.remove('prd-badge-pseudo');
    });

    parent.postMessage({
      type: 'PRD_ANNOTATION_LIST',
      ids: els.map(el => el.getAttribute('data-prd-id')),
      href: location.href
    }, TARGET_ORIGIN);
  }

  // ---------- 状态类控制（全部声明式，无测量） ----------
  let currentActiveEl = null;
  let currentHoverEl = null;

  function setActive(id) {
    if (currentActiveEl) {
      currentActiveEl.classList.remove('prd-active');
      currentActiveEl = null;
    }
    if (!id) return;
    const el = document.querySelector('[data-prd-id="' + CSS.escape(id) + '"]');
    if (el) {
      el.classList.add('prd-active');
      currentActiveEl = el;
    }
  }

  function setHover(id) {
    if (currentHoverEl) {
      currentHoverEl.classList.remove('prd-hover');
      if (currentHoverEl.__prdBadgeEl) currentHoverEl.__prdBadgeEl.classList.remove('prd-badge-hover');
      currentHoverEl = null;
    }
    if (!id) return;
    const el = document.querySelector('[data-prd-id="' + CSS.escape(id) + '"]');
    if (el) {
      el.classList.add('prd-hover');
      if (el.__prdBadgeEl) el.__prdBadgeEl.classList.add('prd-badge-hover');
      currentHoverEl = el;
    }
  }

  // 点击卡片定位：滚动到元素 + 脉冲闪烁（瞬时高亮，生灭由 CSS 动画控制）
  function pulse(id) {
    const el = document.querySelector('[data-prd-id="' + CSS.escape(id) + '"]');
    if (!el) return;
    try {
      el.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });
    } catch (e) {
      el.scrollIntoView();
    }
    // 延迟起跳：等 smooth scroll 基本到位再闪烁，避免滚动途中脉冲已过峰
    setTimeout(() => {
      if (!el.isConnected) return;
      el.classList.remove('prd-pulse');
      // 强制重排以重启动画（连续点击同一标注时）
      void el.offsetWidth;
      el.classList.add('prd-pulse');
      let done = false;
      const cleanup = () => {
        if (done) return;
        done = true;
        el.classList.remove('prd-pulse');
      };
      el.addEventListener('animationend', cleanup, { once: true });
      setTimeout(cleanup, 3000); // 兜底：元素被移除等情况 animationend 不触发
    }, 450);
  }

  // ---------- 消息接收 ----------
  window.addEventListener('message', (event) => {
    if (event.source !== window.parent) return;
    if (IS_HTTP && event.origin !== window.location.origin) return;
    const data = event.data;
    if (!data || !data.type) return;

    switch (data.type) {
      case 'PRD_QUERY':
      case 'PRD_RESCAN':
        scan();
        break;
      case 'PRD_SET_VISIBLE':
        document.documentElement.classList.toggle('prd-on', !!data.enabled);
        break;
      case 'PRD_SET_SHOW_ALL':
        document.documentElement.classList.toggle('prd-show-all', !!data.enabled);
        break;
      case 'PRD_PULSE':
        pulse(data.id);
        break;
      case 'PRD_SET_ACTIVE':
        setActive(data.id || null);
        break;
      case 'PRD_HOVER':
        setHover(data.id || null);
        break;
    }
  });

  // ---------- 锚点点击上报（捕获阶段，不拦截页面自身行为） ----------
  document.addEventListener('click', (e) => {
    if (!document.documentElement.classList.contains('prd-on')) return;
    const anchor = e.target && e.target.closest ? e.target.closest('[data-prd-id]') : null;
    if (anchor) {
      parent.postMessage({
        type: 'PRD_ANCHOR_CLICK',
        id: anchor.getAttribute('data-prd-id')
      }, TARGET_ORIGIN);
    }
  }, true);

  // ---------- 锚点 hover 反向联动：元素悬停 → 本地 hover 态 + 上报父页面高亮卡片 ----------
  // mouseover/mouseout + relatedTarget 包含性判定模拟 mouseenter/mouseleave，
  // 无需为每个锚点单独绑定监听；rbadge 徽章 pointer-events:none，鼠标悬徽章视同悬锚点。
  function anchorHoverFromEvent(e) {
    if (!document.documentElement.classList.contains('prd-on')) return null;
    if (!e.target || !e.target.closest) return null;
    const anchor = e.target.closest('[data-prd-id]');
    if (!anchor) return null;
    if (e.relatedTarget && anchor.contains(e.relatedTarget)) return null; // 锚点内部移动
    return anchor;
  }
  document.addEventListener('mouseover', (e) => {
    const anchor = anchorHoverFromEvent(e);
    if (!anchor) return;
    const id = anchor.getAttribute('data-prd-id');
    setHover(id);
    parent.postMessage({ type: 'PRD_ANCHOR_HOVER', id: id, action: 'show' }, TARGET_ORIGIN);
  });
  document.addEventListener('mouseout', (e) => {
    const anchor = anchorHoverFromEvent(e);
    if (!anchor) return;
    const id = anchor.getAttribute('data-prd-id');
    if (currentHoverEl === anchor) setHover(null);
    parent.postMessage({ type: 'PRD_ANCHOR_HOVER', id: id, action: 'hide' }, TARGET_ORIGIN);
  });

  // ---------- 动态锚点与 rbadge 显隐监听（双级触发纪律，均不为位置） ----------
  // 第一级（重扫）：仅"锚点集合本身变化"——[data-prd-id] 属性增删、含锚点的节点增删。
  // 第二级（仅刷 rbadge 显隐布尔值）：class/style 属性变化 + transitionend 动画终态。
  // class/style 变化【不重建锚点】——位置由排版引擎跟踪，入场动画、hover 等高频
  // class 变化若触发重建会造成徽章风暴；显隐刷新只 walk replaced 锚点，成本有界。
  let moTimer = null;
  let visTimer = null;
  function scheduleScan() {
    if (moTimer) clearTimeout(moTimer);
    moTimer = setTimeout(() => {
      moTimer = null;
      scan();
    }, 150);
  }
  function scheduleVisibilityRefresh() {
    if (visTimer) clearTimeout(visTimer);
    visTimer = setTimeout(() => {
      visTimer = null;
      refreshAllBadgeGates();
    }, 200);
  }

  function isRelevantMutation(mutation) {
    if (mutation.type === 'attributes') {
      return mutation.attributeName === 'data-prd-id';
    }
    const check = (node) => {
      if (node.nodeType !== 1) return false;
      if (node.classList && node.classList.contains('prd-rbadge')) return false; // 自身徽章
      if (node.matches && node.matches('[data-prd-id]')) return true;
      return !!(node.querySelector && node.querySelector('[data-prd-id]'));
    };
    for (let i = 0; i < mutation.addedNodes.length; i++) {
      if (check(mutation.addedNodes[i])) return true;
    }
    for (let i = 0; i < mutation.removedNodes.length; i++) {
      if (check(mutation.removedNodes[i])) return true;
    }
    return false;
  }

  function isVisibilityMutation(mutation) {
    if (mutation.type !== 'attributes') return false;
    if (mutation.attributeName !== 'class' && mutation.attributeName !== 'style') return false;
    const target = mutation.target;
    return !!(target && target.classList && !target.classList.contains('prd-rbadge'));
  }

  function startObserver() {
    if (typeof MutationObserver === 'undefined') return;
    const mo = new MutationObserver((mutations) => {
      let needScan = false;
      let needVis = false;
      for (let i = 0; i < mutations.length; i++) {
        if (isRelevantMutation(mutations[i])) { needScan = true; break; }
        if (isVisibilityMutation(mutations[i])) needVis = true;
      }
      if (needScan) scheduleScan();
      else if (needVis) scheduleVisibilityRefresh();
    });
    mo.observe(document.documentElement, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['data-prd-id', 'class', 'style']
    });
  }

  // transitionend 兜底：显隐动画中途 opacity/visibility 是中间态，门控判定可能为过渡值；
  // 动画结束后重判一次。只刷显隐、不重建锚点（已知限制：WAAPI 无 transitionend，见文件头）
  let trTimer = null;
  window.addEventListener('transitionend', (e) => {
    if (e.target && e.target.classList && e.target.classList.contains('prd-rbadge')) return;
    if (trTimer) clearTimeout(trTimer);
    trTimer = setTimeout(() => {
      trTimer = null;
      refreshAllBadgeGates();
    }, 60);
  }, true);

  // ---------- 启动 ----------
  injectStyle();
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', scan);
  } else {
    scan();
  }
  window.addEventListener('load', scan); // 二次扫描无害（幂等），覆盖懒加载锚点
  startObserver();
})();
