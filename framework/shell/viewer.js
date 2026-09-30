// viewer.js —— 只读交付查看器（工作台外壳的精简只读版，无编辑/发布/版本/任务站/后端）
// 依赖：workspace/data/project-data.js（ProjectConfig / navConfig / PrdStore / OverviewContent）
//      framework/assets/scripts/page-bridge.js（由各业务页面引入）
(function () {
  'use strict';

  const NAV = window.navConfig || [];
  const PRD = window.PrdStore || {};
  const PROJECT = window.ProjectConfig || {};

  const $ = id => document.getElementById(id);
  const iframe = $('prototype-frame');

  const escapeHTML = s => String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#039;');
  const norm = u => String(u == null ? '' : u).replace(/^\.\//, '').replace(/^\/+/, '').replace(/\\/g, '/');
  function renderMarkdown(text) {
    const safe = (text || '').replace(/<([^>]+)>/g, '&lt;$1&gt;');
    if (typeof marked !== 'undefined') {
      const raw = marked.parse(safe, { breaks: true, gfm: true });
      return typeof DOMPurify !== 'undefined' ? DOMPurify.sanitize(raw) : raw;
    }
    return escapeHTML(safe).replace(/\n/g, '<br/>');
  }
  function postToFrame(msg) {
    try {
      if (!iframe.contentWindow) return;
      const origin = (window.location.protocol === 'http:' || window.location.protocol === 'https:') ? window.location.origin : '*';
      iframe.contentWindow.postMessage(msg, origin);
    } catch (e) {}
  }

  let currentUrl = '';
  let walkIds = [];
  let currentViewports = ['desktop', 'tablet', 'mobile'];
  let showAnnotations = true;
  let showAll = false;

  // ---------- 项目元信息 ----------
  if (PROJECT.title) { $('project-title-display').textContent = PROJECT.title; document.title = PROJECT.title; }
  if (PROJECT.version) $('project-version-display').textContent = PROJECT.version;

  // ---------- 全局说明抽屉 ----------
  (function initOverview() {
    const preview = $('global-req-preview');
    const md = (window.OverviewContent || '').trim();
    preview.innerHTML = md ? renderMarkdown(md)
      : '<p style="color:#94A3B8;font-style:italic;">尚未配置全局说明内容。</p>';
    const drawer = $('global-req-drawer'), overlay = $('drawer-overlay');
    const open = () => { overlay.classList.remove('hidden'); void overlay.offsetWidth; overlay.classList.add('opacity-100'); drawer.classList.remove('translate-x-full'); };
    const close = () => { overlay.classList.remove('opacity-100'); drawer.classList.add('translate-x-full'); setTimeout(() => overlay.classList.add('hidden'), 300); };
    $('global-req-btn').addEventListener('click', open);
    $('close-req-drawer').addEventListener('click', close);
    overlay.addEventListener('click', close);
  })();

  // ---------- 导航树 ----------
  const navTree = $('nav-tree');
  const searchInput = document.querySelector('#search-container input');

  function renderTreeNode(node, depth, searchTerm) {
    const isFolder = node.type === 'folder';
    const indent = depth * 16;
    const matchSearch = searchTerm ? (node.name || '').toLowerCase().includes(searchTerm.toLowerCase()) : true;
    let hasMatchingChildren = false;
    let childrenHtml = '';
    if (isFolder && node.children) {
      childrenHtml = node.children.map(c => {
        const r = renderTreeNode(c, depth + 1, searchTerm);
        if (r) hasMatchingChildren = true;
        return r;
      }).join('');
    }
    if (searchTerm && !matchSearch && !hasMatchingChildren) return '';

    const safeName = escapeHTML(node.name);
    if (isFolder) {
      const isExpanded = searchTerm ? true : !!node.expanded;
      const displayStyle = isExpanded ? 'block' : 'none';
      const chevronClass = isExpanded ? 'rotate-90' : '';
      return `<div class="nav-node-wrapper nav-folder" data-id="${node.id}" data-type="folder">
        <div class="nav-folder-header flex items-center justify-between py-1.5 px-2 rounded-md cursor-pointer group" style="margin-left:${indent}px; padding-left:8px" data-id="${node.id}">
          <div class="flex items-center gap-2 overflow-hidden flex-1">
            <i data-lucide="${isExpanded ? 'folder-open' : 'folder'}" class="w-4 h-4 shrink-0 ${isExpanded ? 'text-blue-500 fill-blue-50' : 'text-slate-400'}"></i>
            <span class="text-sm font-medium truncate select-none" title="${safeName}">${safeName}</span>
          </div>
          <i data-lucide="chevron-right" class="w-4 h-4 shrink-0 text-slate-400 transition-transform duration-200 folder-chevron ${chevronClass}"></i>
        </div>
        <div class="nav-children-container nav-folder-content min-h-[4px]" id="folder-${node.id}" style="display:${displayStyle}" data-parent-id="${node.id}">${childrenHtml}</div>
      </div>`;
    }
    const safeUrl = escapeHTML(node.url || '');
    return `<div class="nav-node-wrapper" data-id="${node.id}" data-type="page">
      <div class="nav-item page-node flex items-center justify-between py-1.5 px-2 rounded-md cursor-pointer group" style="margin-left:${indent}px; padding-left:8px" data-url="${safeUrl}" data-id="${node.id}" data-title="${safeName}" data-viewports="${Array.isArray(node.viewports) ? escapeHTML(JSON.stringify(node.viewports)) : ''}">
        <div class="flex items-center gap-2 overflow-hidden flex-1">
          <i data-lucide="file-text" class="w-4 h-4 shrink-0 text-slate-400"></i>
          <span class="text-sm truncate select-none" title="${safeName}">${safeName}</span>
        </div>
      </div>
    </div>`;
  }

  function renderNav(searchTerm = '') {
    const html = NAV.map(n => renderTreeNode(n, 0, searchTerm)).join('');
    navTree.innerHTML = html || `<div class="text-center text-slate-400 text-sm mt-10"><i data-lucide="folder-open" class="w-8 h-8 mx-auto mb-2 opacity-50"></i>暂无页面</div>`;
    if (typeof lucide !== 'undefined') lucide.createIcons({ root: navTree });

    navTree.querySelectorAll('.nav-folder-header').forEach(header => {
      header.addEventListener('click', () => {
        const content = document.getElementById('folder-' + header.dataset.id);
        const chevron = header.querySelector('.folder-chevron');
        if (!content) return;
        const open = content.style.display === 'none';
        content.style.display = open ? 'block' : 'none';
        chevron && chevron.classList.toggle('rotate-90', open);
      });
    });
    navTree.querySelectorAll('.page-node').forEach(item => {
      item.addEventListener('click', () => selectPage(item));
    });
  }

  function selectPage(item) {
    navTree.querySelectorAll('.page-node').forEach(n => n.classList.remove('active-node'));
    item.classList.add('active-node');
    currentUrl = item.dataset.url;
    // 未设置 viewports = 全部端；显式 [] = 不启用多端预览（隐藏切换器）
    const rawVp = item.dataset.viewports;
    if (rawVp) { try { currentViewports = JSON.parse(rawVp); } catch (e) { currentViewports = []; } }
    else { currentViewports = ['desktop', 'tablet', 'mobile']; }
    applyViewportOptions();
    const titleEl = $('current-page-title');
    if (titleEl) titleEl.textContent = item.dataset.title || '';

    const emptyState = $('empty-state');
    if (window.location.protocol === 'file:') {
      iframe.src = currentUrl; iframe.classList.remove('hidden'); emptyState.classList.add('hidden');
    } else {
      fetch(currentUrl, { method: 'GET', cache: 'no-cache' }).then(res => {
        if (res.ok) { iframe.src = currentUrl; iframe.classList.remove('hidden'); emptyState.classList.add('hidden'); }
        else throw new Error('nf');
      }).catch(() => {
        iframe.classList.add('hidden'); emptyState.classList.remove('hidden');
        emptyState.innerHTML = `<i data-lucide="file-x" class="w-16 h-16 mb-4 opacity-40 text-slate-400"></i><p class="text-base font-medium text-slate-700">页面文件不存在</p><p class="text-sm mt-2 text-slate-500">${escapeHTML(currentUrl)}</p>`;
        if (typeof lucide !== 'undefined') lucide.createIcons({ root: emptyState });
      });
    }
  }

  // ---------- 视口 / 缩放 ----------
  (function initViewport() {
    const switcher = $('viewport-switcher');
    const container = $('prototype-container');
    const wrapper = $('canvas-wrapper');
    if (!switcher || !container) return;
    const buttons = switcher.querySelectorAll('.viewport-btn');
    const notch = $('mobile-notch'), statusbar = $('mobile-statusbar'), homebar = $('mobile-homebar');
    const ZOOM_PRESETS = [0.5, 0.67, 0.75, 0.85, 1.0, 1.25, 1.5];
    let mode = 'desktop', zoomMode = 'fit', scale = 1.0;

    function calculateFitScale(m) {
      if (!wrapper) return 1;
      const availH = Math.max(100, wrapper.clientHeight - 48);
      const availW = Math.max(100, wrapper.clientWidth - 48);
      if (m === 'mobile') return Math.max(0.4, Math.floor(Math.min(1, availH / 832, availW / 395) * 100) / 100);
      if (m === 'tablet') return Math.max(0.3, Math.floor(Math.min(1, availH / 1024, availW / 768) * 100) / 100);
      return 1;
    }
    function applyZoom() {
      if (mode === 'desktop') { container.style.transform = ''; container.style.marginBottom = ''; scale = 1; setZoomLabel('100%', false); return; }
      if (zoomMode === 'fit') { scale = calculateFitScale(mode); setZoomLabel(`${Math.round(scale * 100)}%`, true); }
      else setZoomLabel(`${Math.round(scale * 100)}%`, false);
      if (Math.abs(scale - 1) < 0.01) { container.style.transform = ''; container.style.marginBottom = ''; return; }
      container.style.transform = `scale(${scale})`;
      const h = mode === 'mobile' ? 832 : (container.offsetHeight || 0);
      if (h && scale < 1) container.style.marginBottom = `-${h * (1 - scale)}px`;
      else container.style.marginBottom = '';
    }
    function setZoomLabel(text, fit) {
      const b = $('zoom-value-btn'); if (!b) return;
      b.textContent = text;
      b.classList.toggle('text-blue-600', !!fit);
      b.classList.toggle('bg-blue-50', !!fit);
    }
    function setMode(m) {
      mode = m;
      buttons.forEach(btn => {
        const on = btn.dataset.viewport === m;
        btn.classList.toggle('active', on); btn.classList.toggle('bg-white', on);
        btn.classList.toggle('text-slate-700', on); btn.classList.toggle('shadow-xs', on);
        btn.classList.toggle('text-slate-500', !on);
      });
      container.classList.remove('w-full', 'h-full', 'max-w-none', 'tablet-device-frame', 'mobile-device-frame');
      [notch, statusbar, homebar].forEach(el => el && el.classList.add('hidden'));
      if (m === 'mobile') { container.classList.add('mobile-device-frame'); [notch, statusbar, homebar].forEach(el => el && el.classList.remove('hidden')); }
      else if (m === 'tablet') { container.classList.add('tablet-device-frame', 'w-[768px]', 'h-full', 'max-w-full'); }
      else container.classList.add('w-full', 'h-full', 'max-w-none');
      applyZoom();
    }
    function applyViewportOptions() {
      const allowed = currentViewports;
      if (!Array.isArray(allowed) || !allowed.length) { switcher.classList.add('hidden'); setMode('desktop'); return; }
      switcher.classList.remove('hidden');
      buttons.forEach(btn => btn.classList.toggle('hidden', !allowed.includes(btn.dataset.viewport)));
      if (!allowed.includes(mode)) setMode(allowed.includes('desktop') ? 'desktop' : allowed[0]);
    }
    window.__viewerApplyViewportOptions = applyViewportOptions;

    buttons.forEach(btn => btn.addEventListener('click', () => setMode(btn.dataset.viewport)));
    $('zoom-out-btn') && $('zoom-out-btn').addEventListener('click', () => { zoomMode = 'fixed'; let t = ZOOM_PRESETS[0]; for (let i = ZOOM_PRESETS.length - 1; i >= 0; i--) if (ZOOM_PRESETS[i] < scale - 0.02) { t = ZOOM_PRESETS[i]; break; } scale = t; applyZoom(); });
    $('zoom-in-btn') && $('zoom-in-btn').addEventListener('click', () => { zoomMode = 'fixed'; let t = ZOOM_PRESETS[ZOOM_PRESETS.length - 1]; for (let i = 0; i < ZOOM_PRESETS.length; i++) if (ZOOM_PRESETS[i] > scale + 0.02) { t = ZOOM_PRESETS[i]; break; } scale = t; applyZoom(); });
    $('zoom-value-btn') && $('zoom-value-btn').addEventListener('click', () => { if (zoomMode === 'fit') { zoomMode = 'fixed'; scale = 1; } else zoomMode = 'fit'; applyZoom(); });
    window.addEventListener('resize', () => { if (zoomMode === 'fit') applyZoom(); });
    setMode('desktop');
  })();
  function applyViewportOptions() { window.__viewerApplyViewportOptions && window.__viewerApplyViewportOptions(); }

  // ---------- 右侧标注面板 ----------
  const listEl = $('annotation-list');
  const rulesEl = $('page-rules-container');
  const walkBar = $('walkthrough-bar');
  const annoTitle = $('anno-section-title');
  const showAllBtn = $('toggle-show-all-btn');
  const toggleBtn = $('toggle-annotation-btn');

  function renderCards(ids) {
    walkIds = (ids || []).slice();
    const currentSrc = iframe.getAttribute('src') || currentUrl;
    const normSrc = norm(currentSrc);

    const ruleKeys = Object.keys(PRD).filter(k => {
      const d = PRD[k];
      return d && d.scope === 'page' && norm(d.pageUrl) === normSrc;
    });
    if (ruleKeys.length) {
      rulesEl.classList.remove('hidden'); rulesEl.removeAttribute('hidden');
      rulesEl.innerHTML = `<div class="flex items-center justify-between pb-1.5 border-b border-slate-100"><span class="text-xs font-semibold text-slate-700 flex items-center gap-1.5"><i data-lucide="file-text" class="w-3.5 h-3.5 text-blue-600"></i><span>页面说明 (${ruleKeys.length})</span></span></div>
        <div class="space-y-2.5">${ruleKeys.map(k => {
          const d = PRD[k];
          return `<div class="page-rule-card bg-white border border-slate-200 rounded-lg p-3"><h3 class="text-sm font-semibold text-slate-800 truncate" title="${escapeHTML(d.title || '页面说明')}">${escapeHTML(d.title || '页面说明')}</h3><div class="text-xs text-slate-600 leading-relaxed prose prose-sm max-w-none prd-desc-content">${renderMarkdown(d.desc || '')}</div></div>`;
        }).join('')}</div>`;
    } else { rulesEl.classList.add('hidden'); rulesEl.setAttribute('hidden', ''); rulesEl.innerHTML = ''; }

    walkBar.classList.toggle('hidden', !walkIds.length);
    if (annoTitle) annoTitle.textContent = `交互标注 (${walkIds.length})`;

    if (!walkIds.length) {
      listEl.innerHTML = `<div class="text-center text-slate-400 text-sm mt-8 py-4"><i data-lucide="inbox" class="w-8 h-8 mx-auto mb-2 opacity-40"></i><p class="font-medium text-slate-600 text-xs">当前页面暂无说明与标注</p></div>`;
      if (typeof lucide !== 'undefined') lucide.createIcons();
      return;
    }
    listEl.innerHTML = walkIds.map((id, i) => {
      const d = PRD[id];
      if (!d) return `<div class="prd-card bg-amber-50 border border-amber-200 rounded-lg p-3 mb-3" data-prd-id="${escapeHTML(id)}"><div class="flex items-start gap-3"><div class="flex-shrink-0 w-6 h-6 rounded-full bg-amber-100 text-amber-700 flex items-center justify-center text-xs font-bold border border-amber-200">${i + 1}</div><div class="flex-1 min-w-0"><h3 class="text-sm font-semibold text-amber-800 truncate mb-1">未配置的标注</h3><div class="text-xs text-amber-700">页面存在 <code class="bg-amber-100 px-1 rounded">${escapeHTML(id)}</code> 锚点，但缺少配置。</div></div></div></div>`;
      return `<div class="prd-card bg-white border border-slate-200 rounded-lg p-3 hover:border-blue-400 hover:shadow-md transition-all cursor-pointer relative overflow-hidden group mb-3" data-prd-id="${escapeHTML(id)}">
        <div class="absolute top-0 left-0 w-1 h-full bg-blue-500 opacity-0 group-hover:opacity-100 transition-opacity"></div>
        <div class="flex items-start gap-3">
          <div class="flex-shrink-0 w-6 h-6 rounded-full bg-slate-100 text-slate-600 flex items-center justify-center text-xs font-bold border border-slate-200">${i + 1}</div>
          <div class="flex-1 min-w-0"><h3 class="text-sm font-semibold text-slate-800 truncate">${escapeHTML(d.title || '')}</h3><div class="text-xs text-slate-600 leading-relaxed prose prose-sm max-w-none prd-desc-content">${renderMarkdown(d.desc || '暂无详细说明')}</div></div>
        </div></div>`;
    }).join('');
    if (typeof lucide !== 'undefined') lucide.createIcons();

    listEl.querySelectorAll('.prd-card').forEach((card, i) => {
      const id = card.dataset.prdId;
      card.addEventListener('mouseenter', () => { if (showAnnotations) postToFrame({ type: 'PRD_HOVER', id }); });
      card.addEventListener('mouseleave', () => postToFrame({ type: 'PRD_HOVER', id: null }));
      card.addEventListener('click', () => goWalk(i));
    });
  }

  function goWalk(i) {
    if (!walkIds.length) return;
    const idx = ((i % walkIds.length) + walkIds.length) % walkIds.length;
    const id = walkIds[idx];
    if (!showAnnotations) setAnnotationsVisible(true);
    postToFrame({ type: 'PRD_SET_ACTIVE', id });
    postToFrame({ type: 'PRD_PULSE', id });
    listEl.querySelectorAll('.prd-card').forEach(card => card.classList.toggle('walkthrough-active', card.dataset.prdId === id));
  }

  function setAnnotationsVisible(v) {
    showAnnotations = v;
    if (toggleBtn) {
      const span = toggleBtn.querySelector('span'); if (span) span.textContent = v ? '隐藏标注' : '显示标注';
      toggleBtn.classList.toggle('text-blue-600', v); toggleBtn.classList.toggle('bg-blue-50', v);
      toggleBtn.classList.toggle('text-slate-500', !v); toggleBtn.classList.toggle('bg-slate-100', !v);
    }
    postToFrame({ type: 'PRD_SET_VISIBLE', enabled: v });
  }
  function setShowAll(v) {
    showAll = v;
    if (showAllBtn) { showAllBtn.classList.toggle('text-blue-600', v); showAllBtn.classList.toggle('bg-blue-50', v); showAllBtn.classList.toggle('text-slate-500', !v); }
    postToFrame({ type: 'PRD_SET_SHOW_ALL', enabled: v });
  }
  toggleBtn && toggleBtn.addEventListener('click', () => setAnnotationsVisible(!showAnnotations));
  showAllBtn && showAllBtn.addEventListener('click', () => setShowAll(!showAll));

  // ---------- 桥接消息 ----------
  iframe.addEventListener('load', () => { currentUrl && postToFrame({ type: 'PRD_QUERY' }); });
  window.addEventListener('message', (event) => {
    if (!iframe || event.source !== iframe.contentWindow) return;
    const d = event.data; if (!d || !d.type) return;
    if (d.type === 'PRD_ANNOTATION_LIST') {
      renderCards(d.ids || []);
      postToFrame({ type: 'PRD_SET_VISIBLE', enabled: showAnnotations });
      postToFrame({ type: 'PRD_SET_SHOW_ALL', enabled: showAll });
    } else if (d.type === 'PRD_ANCHOR_CLICK') {
      const i = walkIds.indexOf(d.id); if (i >= 0) goWalk(i);
    } else if (d.type === 'PRD_ANCHOR_HOVER') {
      listEl.querySelectorAll('.prd-card').forEach(card => {
        if (card.dataset.prdId === d.id) card.classList.toggle('active-highlight', d.action === 'show');
      });
    }
  });

  // ---------- 左侧栏折叠 ----------
  (function () {
    const sidebar = $('sidebar'), btn = $('toggle-sidebar-btn');
    if (!sidebar || !btn) return;
    let collapsed = false;
    btn.addEventListener('click', () => {
      collapsed = !collapsed;
      sidebar.classList.toggle('w-80', !collapsed); sidebar.classList.toggle('w-0', collapsed);
      sidebar.classList.toggle('border-r-0', collapsed);
      navTree.style.opacity = collapsed ? '0' : '1';
    });
  })();

  // ---------- 右侧需求面板折叠 ----------
  (function () {
    const panel = $('prd-panel'), btn = $('toggle-prd-btn');
    if (!panel || !btn) return;
    let collapsed = false;
    btn.addEventListener('click', () => {
      collapsed = !collapsed;
      panel.classList.toggle('w-80', !collapsed); panel.classList.toggle('w-0', collapsed);
      panel.classList.toggle('border-l-0', collapsed);
      btn.classList.toggle('bg-slate-100', collapsed);
    });
  })();

  // ---------- 搜索 ----------
  searchInput && searchInput.addEventListener('input', e => renderNav(e.target.value.trim()));

  renderNav();
  const first = navTree.querySelector('.page-node');
  if (first) first.click();
})();
