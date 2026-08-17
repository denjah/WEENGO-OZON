// ==========================================================================
// WEENGO STUDIO CONSOLE — INTERACTIVE LOGIC
// ==========================================================================

const State = {
  activeTab: 'review-studio',
  theme: 'dark',
  activeSlideIdx: 0,
  currentTool: 'select', // 'select', 'arrow', 'pin', 'task'
  currentColor: '#EF4444',
  zoom: 1.0,
  readOnly: false,
  reviewMeta: {},
  layers: {
    ai: true,
    artDirector: true
  },
  slides: [],
  products: [],
  isDrawingArrow: false,
  arrowStart: null,
  selectedAnnotationId: null,
  annotationDrag: null
};

document.addEventListener('DOMContentLoaded', async () => {
  initTheme();
  initNavTabs();
  initToolbar();
  initLayerToggles();
  initZoomControls();
  initSidebarActions();
  initModalActions();
  initAccordion();
  initHotkeys();
  
  await loadData();
});

function initHotkeys() {
  document.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
    if ((e.key === 'Delete' || e.key === 'Backspace') && State.selectedAnnotationId) {
      e.preventDefault();
      deleteAnnotation(State.selectedAnnotationId);
      return;
    }
    const tabs = document.querySelectorAll('.nav-tab');
    if (e.key >= '1' && e.key <= '5') {
      const idx = parseInt(e.key) - 1;
      if (tabs[idx]) tabs[idx].click();
    }
  });
}

// --- ACCORDION FILMSTRIP ---
function initAccordion() {
  const header = document.getElementById('filmstripHeader');
  const accordion = document.querySelector('.filmstrip-accordion');
  header.addEventListener('click', () => {
    accordion.classList.toggle('collapsed');
  });
}

// --- DATA FETCHING ---
async function loadData() {
  setSyncStatus('Загрузка...', 'syncing');
  try {
    let reviewPayload;
    try {
      const revRes = await fetch('/api/review-data');
      if (!revRes.ok) throw new Error(`Review API: ${revRes.status}`);
      reviewPayload = await revRes.json();
    } catch (apiError) {
      const fallback = await fetch('maccabi_review_data.json');
      if (!fallback.ok) throw apiError;
      reviewPayload = await fallback.json();
      State.readOnly = true;
    }

    State.reviewMeta = Array.isArray(reviewPayload) ? {} : (reviewPayload.meta || {});
    State.slides = (Array.isArray(reviewPayload) ? reviewPayload : (reviewPayload.slides || []))
      .sort((a, b) => getSourceNumber(a) - getSourceNumber(b));
    try {
      const prodRes = await fetch('/api/products');
      State.products = prodRes.ok ? await prodRes.json() : [];
    } catch {
      State.products = [];
    }

    applyModeControls();
    
    renderReviewOverview();
    renderCarousel();
    renderActiveSlide();
    renderGlobalRules();
    renderDashboardTable();
    renderCatalogGrid();
    renderInspectorBreakdown();
    
    setSyncStatus(State.readOnly ? 'Режим просмотра' : 'Синхронизировано', State.readOnly ? 'warn' : 'ok');
  } catch (err) {
    console.error('Data load error:', err);
    setSyncStatus('Автономный режим', 'warn');
  }
}

async function saveReviewData() {
  if (State.readOnly) {
    setSyncStatus('Режим просмотра', 'warn');
    return;
  }
  setSyncStatus('Сохранение...', 'syncing');
  try {
    const res = await fetch('/api/save-review', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ meta: State.reviewMeta, slides: State.slides })
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.message || 'Сервер отклонил сохранение');
    if (json.status === 'ok') {
      setSyncStatus('Сохранено', 'ok');
    }
  } catch (e) {
    console.error('Save error:', e);
    setSyncStatus('Ошибка сохранения', 'error');
  }
}

function setSyncStatus(text, status) {
  const label = document.querySelector('.status-label');
  const dot = document.querySelector('.status-dot');
  if (label) label.textContent = text;
  if (dot) {
    if (status === 'ok') dot.style.background = 'var(--accent-emerald)';
    else if (status === 'syncing') dot.style.background = 'var(--primary)';
    else dot.style.background = 'var(--accent-red)';
  }
}

function escapeHtml(value = '') {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function getSlideIssues(slide) {
  return Array.isArray(slide?.art_director_issues) ? slide.art_director_issues : [];
}

function getSourceNumber(slide) {
  if (Number.isFinite(Number(slide?.source_number))) return Number(slide.source_number);
  const match = String(slide?.source_file || '').match(/photo_(\d+)_/i);
  return match ? Number(match[1]) : Number.MAX_SAFE_INTEGER;
}

function getReviewImageUrl(file) {
  if (State.readOnly || location.hostname.endsWith('github.io')) {
    return `../НАСТОЛЬНЫЙ%20ФУТБОЛ%20MACCABI%20MINI/REVIEW/${encodeURIComponent(file)}`;
  }
  return `/api/image/${encodeURIComponent(file)}`;
}

function applyModeControls() {
  if (!State.readOnly) return;
  const disabledSelectors = [
    '#saveBtn', '#addTaskBtn', '#newTaskInput', '#clearCanvasBtn',
    '#deleteSelectedBtn', '#deleteAllAnnotationsBtn',
    '[data-tool="arrow"]', '[data-tool="pin"]', '[data-tool="task"]',
    '.color-swatch', '.verdict-btn'
  ];
  document.querySelectorAll(disabledSelectors.join(',')).forEach(element => {
    element.disabled = true;
    element.title = 'В публичной версии доступен только просмотр';
  });
}

function countBySeverity(items, severity) {
  return items.filter(item => item.severity === severity).length;
}

function renderReviewOverview() {
  const issues = State.slides.flatMap(getSlideIssues);
  const tasks = State.slides.flatMap(slide => slide.art_director_tasks || []);
  const critical = countBySeverity(issues, 'critical');
  const important = countBySeverity(issues, 'important');
  const date = State.reviewMeta.review_date || '17.08.2026';

  document.getElementById('reviewMetaLine').textContent = `Maccabi Mini · правки арт-директора от ${date}`;
  document.getElementById('setCriticalCount').textContent = `${critical} критичных`;
  document.getElementById('setImportantCount').textContent = `${important} важных`;
  document.getElementById('setTasksCount').textContent = `${tasks.length} задачи`;

  const auditSource = document.getElementById('auditSourceLine');
  if (auditSource) auditSource.textContent = `Maccabi Mini · актуальная версия от ${date}`;
  const auditOpen = document.getElementById('auditOpenCount');
  if (auditOpen) auditOpen.textContent = `${issues.length} замечания`;
  const auditCritical = document.getElementById('auditCriticalCount');
  if (auditCritical) auditCritical.textContent = critical;
  const auditImportant = document.getElementById('auditImportantCount');
  if (auditImportant) auditImportant.textContent = important;
  const auditTasks = document.getElementById('auditTasksCount');
  if (auditTasks) auditTasks.textContent = tasks.length;

  renderAuditSummaryLists();
}

function renderAuditSummaryLists() {
  const criticalList = document.getElementById('auditCriticalList');
  const importantList = document.getElementById('auditImportantList');
  const globalList = document.getElementById('auditGlobalRulesList');
  if (!criticalList || !importantList || !globalList) return;

  const issueRows = State.slides.flatMap((slide, slideIdx) =>
    getSlideIssues(slide).map(item => ({ ...item, slideNumber: slideIdx + 1 }))
  );
  const renderTopIssues = (list, severity) => {
    list.innerHTML = '';
    issueRows.filter(item => item.severity === severity).slice(0, 4).forEach(item => {
      const li = document.createElement('li');
      li.innerHTML = `<strong>Карточка ${item.slideNumber} · ${escapeHtml(item.id)}:</strong> ${escapeHtml(item.title)}`;
      list.appendChild(li);
    });
  };
  renderTopIssues(criticalList, 'critical');
  renderTopIssues(importantList, 'important');

  globalList.innerHTML = '';
  (State.reviewMeta.global_issues || []).forEach(rule => {
    const li = document.createElement('li');
    li.textContent = `${rule.title}: ${rule.detail}`;
    globalList.appendChild(li);
  });
}

function renderGlobalRules() {
  const list = document.getElementById('globalRulesList');
  const count = document.getElementById('globalRulesCount');
  if (!list || !count) return;
  const rules = State.reviewMeta.global_issues || [];
  count.textContent = rules.length;
  list.innerHTML = '';
  rules.forEach(rule => {
    const item = document.createElement('div');
    item.className = `global-rule ${rule.severity}`;
    item.innerHTML = `
      <div class="global-rule-head">
        <span class="issue-id">${escapeHtml(rule.id)}</span>
        <strong>${escapeHtml(rule.title)}</strong>
      </div>
      <p>${escapeHtml(rule.detail)}</p>
      <span class="global-rule-slides">Карточки: ${escapeHtml((rule.slides || []).join(', '))}</span>
    `;
    list.appendChild(item);
  });
}

// --- THEME ---
function initTheme() {
  const themeBtns = document.querySelectorAll('.theme-btn');
  themeBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      themeBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const t = btn.dataset.themeVal;
      document.documentElement.setAttribute('data-theme', t);
      State.theme = t;
    });
  });
}

// --- NAVIGATION TABS ---
function initNavTabs() {
  const tabs = document.querySelectorAll('.nav-tab');
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      tabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      
      const tabName = tab.dataset.tab;
      State.activeTab = tabName;
      
      document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
      const targetPane = document.getElementById(`tab-${tabName}`);
      if (targetPane) targetPane.classList.add('active');
    });
  });
}

// --- TOOLBAR ---
function initToolbar() {
  const toolBtns = document.querySelectorAll('.tool-btn[data-tool]');
  toolBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      toolBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      State.currentTool = btn.dataset.tool;
      updateCanvasCursor();
    });
  });

  const swatches = document.querySelectorAll('.color-swatch');
  swatches.forEach(swatch => {
    swatch.addEventListener('click', () => {
      swatches.forEach(s => s.classList.remove('active'));
      swatch.classList.add('active');
      State.currentColor = swatch.dataset.color;
    });
  });

  const cardStage = document.getElementById('cardStage');
  cardStage.addEventListener('mousedown', handleStageMouseDown);
  window.addEventListener('mousemove', handleStageMouseMove);
  window.addEventListener('mouseup', handleStageMouseUp);

  document.getElementById('deleteSelectedBtn').addEventListener('click', () => {
    if (State.selectedAnnotationId) deleteAnnotation(State.selectedAnnotationId);
  });

  document.getElementById('clearCanvasBtn').addEventListener('click', () => {
    if (confirm('Удалить все стрелки и пины с текущей карточки? Текстовые правки из файла останутся.')) {
      const curSlide = State.slides[State.activeSlideIdx];
      if (curSlide) {
        curSlide.art_director_annotations = [];
        State.selectedAnnotationId = null;
        renderActiveSlide();
        saveReviewData();
      }
    }
  });

  document.getElementById('deleteAllAnnotationsBtn').addEventListener('click', () => {
    document.getElementById('clearCanvasBtn').click();
  });
}

function selectAnnotation(annotationId) {
  State.selectedAnnotationId = annotationId || null;
  renderSvgArrows();
  renderAnnotationsSidebar();
  updateAnnotationActions();
}

function updateAnnotationActions() {
  const button = document.getElementById('deleteSelectedBtn');
  if (button) button.disabled = State.readOnly || !State.selectedAnnotationId;
}

function deleteAnnotation(annotationId) {
  if (State.readOnly) return;
  const slide = State.slides[State.activeSlideIdx];
  if (!slide?.art_director_annotations) return;
  const index = slide.art_director_annotations.findIndex(annotation => annotation.id === annotationId);
  if (index < 0) return;
  slide.art_director_annotations.splice(index, 1);
  State.selectedAnnotationId = null;
  renderPins();
  renderSvgArrows();
  renderAnnotationsSidebar();
  updateAnnotationActions();
  saveReviewData();
}

function updateCanvasCursor() {
  const cardStage = document.getElementById('cardStage');
  if (State.currentTool === 'arrow') cardStage.style.cursor = 'crosshair';
  else if (State.currentTool === 'pin') cardStage.style.cursor = 'cell';
  else if (State.currentTool === 'task') cardStage.style.cursor = 'copy';
  else cardStage.style.cursor = 'default';
}

function initLayerToggles() {
  const btnAi = document.getElementById('toggleAiLayer');
  const btnAd = document.getElementById('toggleAdLayer');

  btnAi.addEventListener('click', () => {
    State.layers.ai = !State.layers.ai;
    btnAi.classList.toggle('active', State.layers.ai);
    renderPins();
    renderSvgArrows();
  });

  btnAd.addEventListener('click', () => {
    State.layers.artDirector = !State.layers.artDirector;
    btnAd.classList.toggle('active', State.layers.artDirector);
    renderPins();
    renderSvgArrows();
  });
}

function initZoomControls() {
  const zoomIn = document.getElementById('zoomInBtn');
  const zoomOut = document.getElementById('zoomOutBtn');
  const zoomReset = document.getElementById('zoomResetBtn');
  const zoomText = document.getElementById('zoomLevelText');
  const cardStage = document.getElementById('cardStage');

  const updateZoom = () => {
    cardStage.style.transform = `scale(${State.zoom})`;
    zoomText.textContent = `${Math.round(State.zoom * 100)}%`;
  };

  zoomIn.addEventListener('click', () => {
    State.zoom = Math.min(2.5, State.zoom + 0.15);
    updateZoom();
  });

  zoomOut.addEventListener('click', () => {
    State.zoom = Math.max(0.4, State.zoom - 0.15);
    updateZoom();
  });

  zoomReset.addEventListener('click', () => {
    State.zoom = 1.0;
    updateZoom();
  });
}

// --- CAROUSEL ---
function renderCarousel() {
  const strip = document.getElementById('carouselStrip');
  strip.innerHTML = '';

  State.slides.forEach((slide, idx) => {
    const sourceNumber = getSourceNumber(slide);
    const item = document.createElement('button');
    item.type = 'button';
    item.className = `carousel-item ${idx === State.activeSlideIdx ? 'active' : ''}`;
    const issues = getSlideIssues(slide);
    const critical = countBySeverity(issues, 'critical');
    const important = countBySeverity(issues, 'important');
    const scoreClass = critical > 0 ? 'bad' : (important > 0 ? 'medium' : 'good');
    item.title = `${slide.source_file || `Карточка ${sourceNumber}`}: ${critical} критичных, ${important} важных`;
    item.setAttribute('aria-label', item.title);
    item.setAttribute('aria-current', idx === State.activeSlideIdx ? 'true' : 'false');
    
    item.innerHTML = `
      <img class="carousel-thumb" src="${getReviewImageUrl(slide.file)}" alt="${escapeHtml(slide.title)}">
      <span class="carousel-badge">${sourceNumber}</span>
      <span class="carousel-score ${scoreClass}">${issues.length}</span>
      <span class="carousel-file-label">photo_${sourceNumber}</span>
      <div class="carousel-status-bar ${slide.status}"></div>
    `;

    item.addEventListener('click', () => {
      State.activeSlideIdx = idx;
      State.selectedAnnotationId = null;
      renderCarousel();
      renderActiveSlide();
    });

    strip.appendChild(item);
  });
}

// --- ACTIVE SLIDE ---
function renderActiveSlide() {
  const slide = State.slides[State.activeSlideIdx];
  const emptyStage = document.getElementById('emptyStageState');
  const cardStage = document.getElementById('cardStage');
  
  if (!slide) {
    if (emptyStage) emptyStage.style.display = 'flex';
    if (cardStage) cardStage.style.display = 'none';
    return;
  }
  
  if (emptyStage) emptyStage.style.display = 'none';
  if (cardStage) cardStage.style.display = 'block';

  document.getElementById('cardImage').src = getReviewImageUrl(slide.file);
  const sourceNumber = getSourceNumber(slide);
  document.getElementById('currentSlideTitle').textContent = `Карточка ${sourceNumber} — ${slide.title}`;
  document.getElementById('currentSlideRole').textContent = slide.target_slide_role || `Слайд ${State.activeSlideIdx + 1}`;
  document.getElementById('currentSlideFile').textContent = slide.source_file || slide.file;

  const issues = getSlideIssues(slide);
  const critical = countBySeverity(issues, 'critical');
  const important = countBySeverity(issues, 'important');
  const scoreVal = document.getElementById('aiScoreVal');
  scoreVal.textContent = issues.length;
  scoreVal.className = `score-badge ${critical === 0 ? (important > 0 ? 'medium' : 'good') : ''}`;
  document.getElementById('aiScoreCategory').textContent = `${critical} критичных · ${important} важных`;

  const orderedIssues = [...issues].sort((a, b) => (a.severity === 'critical' ? -1 : 1) - (b.severity === 'critical' ? -1 : 1));
  const footerTargets = [
    ['issueTag1', 'aiCompText'],
    ['issueTag2', 'aiMeanText'],
    ['issueTag3', 'aiContText'],
  ];
  footerTargets.forEach(([tagId, textId], index) => {
    const issueItem = orderedIssues[index];
    document.getElementById(tagId).textContent = issueItem
      ? `${issueItem.severity === 'critical' ? 'КРИТИЧНО' : 'ВАЖНО'} · ${issueItem.id}`
      : 'БЕЗ ЗАМЕЧАНИЙ';
    document.getElementById(textId).textContent = issueItem?.title || 'Дополнительных замечаний нет';
  });

  document.getElementById('reviewSourceLabel').textContent = `${State.reviewMeta.source_document || 'ПРАВКИ_MACCABI_MINI.md'} · ${State.reviewMeta.review_date || '17.08.2026'}`;
  document.getElementById('currentStateSummary').textContent = slide.current_state || 'Описание текущего состояния не указано.';

  const pinsButton = document.getElementById('toggleAiLayer');
  const hasPins = Array.isArray(slide.ai_pins) && slide.ai_pins.length > 0;
  pinsButton.disabled = !hasPins;
  document.getElementById('reviewPinsLabel').textContent = hasPins ? 'Метки проверки' : 'Нет меток';

  const verdictBtns = document.querySelectorAll('.verdict-btn');
  verdictBtns.forEach(btn => {
    btn.classList.toggle('active', btn.dataset.status === slide.status);
  });

  renderPins();
  renderSvgArrows();
  renderIssuesList();
  renderTasksList();
  renderAnnotationsSidebar();
}

function renderIssuesList() {
  const list = document.getElementById('issuesList');
  const slide = State.slides[State.activeSlideIdx];
  const issues = getSlideIssues(slide);
  const critical = countBySeverity(issues, 'critical');
  const important = countBySeverity(issues, 'important');

  document.getElementById('issuesCount').textContent = `Правки арт-директора (${issues.length})`;
  document.getElementById('issuesBreakdown').textContent = `${critical} критичных · ${important} важных`;
  list.innerHTML = '';

  issues.forEach(issueItem => {
    const item = document.createElement('article');
    item.className = `issue-item ${issueItem.severity}`;
    item.innerHTML = `
      <div class="issue-head">
        <span class="issue-id">${escapeHtml(issueItem.id)}</span>
        <span class="issue-severity ${issueItem.severity}">${issueItem.severity === 'critical' ? 'Критично' : 'Важно'}</span>
      </div>
      <strong class="issue-title">${escapeHtml(issueItem.title)}</strong>
      <p class="issue-detail">${escapeHtml(issueItem.detail)}</p>
    `;
    list.appendChild(item);
  });
}

// --- PINS ---
function renderPins() {
  const overlay = document.getElementById('pinsOverlay');
  overlay.innerHTML = '';
  const slide = State.slides[State.activeSlideIdx];
  if (!slide) return;

  if (State.layers.ai && slide.ai_pins) {
    slide.ai_pins.forEach((pin, i) => {
      const pinEl = document.createElement('div');
      pinEl.className = 'stage-pin';
      pinEl.style.left = `${pin.x}%`;
      pinEl.style.top = `${pin.y}%`;
      pinEl.innerHTML = `
        <div class="pin-marker ai">AI${i + 1}</div>
        <div class="pin-popover"><strong>${pin.title}</strong><br>${pin.desc}</div>
      `;
      overlay.appendChild(pinEl);
    });
  }

  if (State.layers.artDirector && slide.art_director_annotations) {
    slide.art_director_annotations.forEach((ann, i) => {
      if (ann.type === 'pin') {
        const pinEl = document.createElement('div');
        pinEl.className = 'stage-pin';
        pinEl.style.left = `${ann.x}%`;
        pinEl.style.top = `${ann.y}%`;
        pinEl.innerHTML = `
          <div class="pin-marker" style="border-color:${ann.color || '#EF4444'}; color:${ann.color || '#EF4444'}">${i + 1}</div>
          <div class="pin-popover">${ann.label}</div>
        `;
        overlay.appendChild(pinEl);
      } else if (ann.type === 'task') {
        const taskEl = document.createElement('div');
        taskEl.className = 'stage-task-pill';
        taskEl.style.left = `${ann.x}%`;
        taskEl.style.top = `${ann.y}%`;
        taskEl.innerHTML = `
          <input type="checkbox" ${ann.done ? 'checked' : ''}>
          <span>${ann.label}</span>
        `;
        taskEl.querySelector('input').addEventListener('change', (e) => {
          ann.done = e.target.checked;
          saveReviewData();
        });
        overlay.appendChild(taskEl);
      }
    });
  }
}

// --- ARROWS ---
function renderSvgArrows() {
  const svg = document.getElementById('svgOverlay');
  svg.innerHTML = `
    <defs>
      <marker id="arrow-red" markerWidth="3" markerHeight="3" refX="2.7" refY="1.5" orient="auto" markerUnits="userSpaceOnUse">
        <path d="M0 0 L3 1.5 L0 3" fill="none" stroke="#EF4444" stroke-width="0.7" stroke-linecap="round" stroke-linejoin="round" />
      </marker>
      <marker id="arrow-amber" markerWidth="3" markerHeight="3" refX="2.7" refY="1.5" orient="auto" markerUnits="userSpaceOnUse">
        <path d="M0 0 L3 1.5 L0 3" fill="none" stroke="#F59E0B" stroke-width="0.7" stroke-linecap="round" stroke-linejoin="round" />
      </marker>
      <marker id="arrow-green" markerWidth="3" markerHeight="3" refX="2.7" refY="1.5" orient="auto" markerUnits="userSpaceOnUse">
        <path d="M0 0 L3 1.5 L0 3" fill="none" stroke="#10B981" stroke-width="0.7" stroke-linecap="round" stroke-linejoin="round" />
      </marker>
      <marker id="arrow-cyan" markerWidth="3" markerHeight="3" refX="2.7" refY="1.5" orient="auto" markerUnits="userSpaceOnUse">
        <path d="M0 0 L3 1.5 L0 3" fill="none" stroke="#38BDF8" stroke-width="0.7" stroke-linecap="round" stroke-linejoin="round" />
      </marker>
    </defs>
  `;

  const slide = State.slides[State.activeSlideIdx];
  if (!slide || !State.layers.artDirector || !slide.art_director_annotations) return;

  slide.art_director_annotations.forEach(ann => {
    if (ann.type === 'arrow') {
      const color = ann.color || '#EF4444';
      let markerId = 'arrow-red';
      if (color === '#F59E0B') markerId = 'arrow-amber';
      else if (color === '#10B981') markerId = 'arrow-green';
      else if (color === '#38BDF8') markerId = 'arrow-cyan';

      const hitTarget = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      hitTarget.setAttribute('x1', `${ann.x1}`);
      hitTarget.setAttribute('y1', `${ann.y1}`);
      hitTarget.setAttribute('x2', `${ann.x2}`);
      hitTarget.setAttribute('y2', `${ann.y2}`);
      hitTarget.setAttribute('class', 'svg-arrow-hit');
      hitTarget.setAttribute('data-annotation-id', ann.id);
      hitTarget.addEventListener('mousedown', event => beginAnnotationDrag(event, ann, 'move'));

      const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      line.setAttribute('x1', `${ann.x1}`);
      line.setAttribute('y1', `${ann.y1}`);
      line.setAttribute('x2', `${ann.x2}`);
      line.setAttribute('y2', `${ann.y2}`);
      line.setAttribute('stroke', color);
      line.setAttribute('class', `svg-arrow-line ${State.selectedAnnotationId === ann.id ? 'selected' : ''}`);
      line.setAttribute('marker-end', `url(#${markerId})`);
      line.setAttribute('pointer-events', 'none');

      svg.appendChild(line);
      svg.appendChild(hitTarget);

      if (State.selectedAnnotationId === ann.id) {
        [['start', ann.x1, ann.y1], ['end', ann.x2, ann.y2]].forEach(([handle, x, y]) => {
          const point = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
          point.setAttribute('cx', `${x}`);
          point.setAttribute('cy', `${y}`);
          point.setAttribute('r', '1.35');
          point.setAttribute('class', 'svg-arrow-handle');
          point.setAttribute('data-handle', handle);
          point.addEventListener('mousedown', event => beginAnnotationDrag(event, ann, handle));
          svg.appendChild(point);
        });
      }
    }
  });
  updateAnnotationActions();
}

function beginAnnotationDrag(event, annotation, mode) {
  if (State.currentTool !== 'select') return;
  event.preventDefault();
  event.stopPropagation();
  State.selectedAnnotationId = annotation.id;
  if (State.readOnly) {
    renderSvgArrows();
    renderAnnotationsSidebar();
    return;
  }
  const origin = getStageCoordinates(event);
  State.annotationDrag = {
    id: annotation.id,
    mode,
    origin,
    original: { x1: annotation.x1, y1: annotation.y1, x2: annotation.x2, y2: annotation.y2 }
  };
  renderSvgArrows();
  renderAnnotationsSidebar();
}

function getStageCoordinates(e) {
  const cardStage = document.getElementById('cardStage');
  const rect = cardStage.getBoundingClientRect();
  const x = Math.max(0, Math.min(100, ((e.clientX - rect.left) / rect.width) * 100));
  const y = Math.max(0, Math.min(100, ((e.clientY - rect.top) / rect.height) * 100));
  return { x, y };
}

function handleStageMouseDown(e) {
  if (e.target.closest('.stage-pin') || e.target.closest('.stage-task-pill')) return;
  const { x, y } = getStageCoordinates(e);

  if (State.currentTool === 'select') {
    selectAnnotation(null);
  } else if (State.currentTool === 'arrow') {
    State.isDrawingArrow = true;
    State.arrowStart = { x, y };
  } else if (State.currentTool === 'pin') {
    const text = prompt('Комментарий к маркеру:');
    if (text) {
      const slide = State.slides[State.activeSlideIdx];
      if (!slide.art_director_annotations) slide.art_director_annotations = [];
      slide.art_director_annotations.push({
        id: `pin_${Date.now()}`,
        type: 'pin',
        x: Math.round(x),
        y: Math.round(y),
        label: text,
        color: State.currentColor
      });
      renderPins();
      renderAnnotationsSidebar();
      saveReviewData();
    }
  } else if (State.currentTool === 'task') {
    const text = prompt('Задача для дизайнера:');
    if (text) {
      const slide = State.slides[State.activeSlideIdx];
      if (!slide.art_director_annotations) slide.art_director_annotations = [];
      slide.art_director_annotations.push({
        id: `task_${Date.now()}`,
        type: 'task',
        x: Math.round(x),
        y: Math.round(y),
        label: text,
        done: false,
        color: State.currentColor
      });
      if (!slide.art_director_tasks) slide.art_director_tasks = [];
      slide.art_director_tasks.push({
        id: `t_${Date.now()}`,
        text: text,
        done: false,
        priority: 'high'
      });
      renderPins();
      renderTasksList();
      saveReviewData();
    }
  }
}

function handleStageMouseMove(e) {
  if (State.annotationDrag) {
    const slide = State.slides[State.activeSlideIdx];
    const annotation = slide?.art_director_annotations?.find(item => item.id === State.annotationDrag.id);
    if (!annotation) return;
    const point = getStageCoordinates(e);
    const { mode, origin, original } = State.annotationDrag;
    if (mode === 'start') {
      annotation.x1 = point.x;
      annotation.y1 = point.y;
    } else if (mode === 'end') {
      annotation.x2 = point.x;
      annotation.y2 = point.y;
    } else {
      const dx = point.x - origin.x;
      const dy = point.y - origin.y;
      const minDx = -Math.min(original.x1, original.x2);
      const maxDx = 100 - Math.max(original.x1, original.x2);
      const minDy = -Math.min(original.y1, original.y2);
      const maxDy = 100 - Math.max(original.y1, original.y2);
      const safeDx = Math.max(minDx, Math.min(maxDx, dx));
      const safeDy = Math.max(minDy, Math.min(maxDy, dy));
      annotation.x1 = original.x1 + safeDx;
      annotation.y1 = original.y1 + safeDy;
      annotation.x2 = original.x2 + safeDx;
      annotation.y2 = original.y2 + safeDy;
    }
    renderSvgArrows();
    return;
  }

  if (State.isDrawingArrow && State.arrowStart) {
    const { x, y } = getStageCoordinates(e);
    const svg = document.getElementById('svgOverlay');
    let tempLine = document.getElementById('tempArrowLine');
    if (!tempLine) {
      tempLine = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      tempLine.setAttribute('id', 'tempArrowLine');
      tempLine.setAttribute('stroke', State.currentColor);
      tempLine.setAttribute('stroke-dasharray', '2,2');
      tempLine.setAttribute('class', 'svg-arrow-line');
      svg.appendChild(tempLine);
    }
    tempLine.setAttribute('x1', `${State.arrowStart.x}`);
    tempLine.setAttribute('y1', `${State.arrowStart.y}`);
    tempLine.setAttribute('x2', `${x}`);
    tempLine.setAttribute('y2', `${y}`);
  }
}

function handleStageMouseUp(e) {
  if (State.annotationDrag) {
    State.annotationDrag = null;
    renderSvgArrows();
    renderAnnotationsSidebar();
    saveReviewData();
    return;
  }

  if (State.isDrawingArrow && State.arrowStart) {
    State.isDrawingArrow = false;
    const tempLine = document.getElementById('tempArrowLine');
    if (tempLine) tempLine.remove();

    const { x, y } = getStageCoordinates(e);
    const dist = Math.hypot(x - State.arrowStart.x, y - State.arrowStart.y);
    if (dist > 2) {
      const label = prompt('Пояснение к стрелке (необязательно):') || '';
      const slide = State.slides[State.activeSlideIdx];
      if (!slide.art_director_annotations) slide.art_director_annotations = [];
      slide.art_director_annotations.push({
        id: `arrow_${Date.now()}`,
        type: 'arrow',
        x1: Math.round(State.arrowStart.x),
        y1: Math.round(State.arrowStart.y),
        x2: Math.round(x),
        y2: Math.round(y),
        label: label,
        color: State.currentColor
      });
      renderSvgArrows();
      renderAnnotationsSidebar();
      saveReviewData();
    }
    State.arrowStart = null;
  }
}

// --- SIDEBAR ACTIONS ---
function initSidebarActions() {
  document.querySelectorAll('.preset-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      addTaskToCurrentSlide(chip.dataset.text, 'high');
    });
  });

  document.getElementById('addTaskBtn').addEventListener('click', () => {
    const input = document.getElementById('newTaskInput');
    const text = input.value.trim();
    if (text) {
      addTaskToCurrentSlide(text, 'high');
      input.value = '';
    }
  });

  document.querySelectorAll('.verdict-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const slide = State.slides[State.activeSlideIdx];
      if (slide) {
        slide.status = btn.dataset.status;
        renderCarousel();
        renderActiveSlide();
        saveReviewData();
      }
    });
  });

  document.getElementById('saveBtn').addEventListener('click', saveReviewData);
}

function addTaskToCurrentSlide(text, priority = 'high') {
  const slide = State.slides[State.activeSlideIdx];
  if (!slide) return;
  if (!slide.art_director_tasks) slide.art_director_tasks = [];
  slide.art_director_tasks.push({
    id: `t_${Date.now()}`,
    text: text,
    done: false,
    priority: priority,
    custom: true,
    issue_refs: []
  });
  renderTasksList();
  saveReviewData();
}

function renderTasksList() {
  const list = document.getElementById('tasksList');
  list.innerHTML = '';
  const slide = State.slides[State.activeSlideIdx];
  if (!slide || !slide.art_director_tasks) return;

  const doneCount = slide.art_director_tasks.filter(task => task.done).length;
  document.getElementById('tasksCount').textContent = `Что нужно сделать (${slide.art_director_tasks.length})`;
  document.getElementById('tasksProgress').textContent = `${doneCount} из ${slide.art_director_tasks.length} готово`;

  slide.art_director_tasks.forEach((task, idx) => {
    const item = document.createElement('div');
    item.className = `task-item ${task.done ? 'done' : ''}`;
    item.innerHTML = `
      <input type="checkbox" class="task-checkbox" ${task.done ? 'checked' : ''} ${State.readOnly ? 'disabled' : ''}>
      <div class="task-body">
        <div class="task-txt">${escapeHtml(task.text)}</div>
        <div class="task-meta-row">
          <span class="task-priority ${task.priority}">${task.priority === 'critical' ? 'Критично' : (task.priority === 'high' ? 'Важно' : 'Правка')}</span>
          ${(task.issue_refs || []).map(ref => `<span class="task-issue-ref">${escapeHtml(ref)}</span>`).join('')}
        </div>
      </div>
      ${task.custom ? '<button class="task-remove-btn" title="Удалить пользовательскую задачу">✕</button>' : ''}
    `;

    item.querySelector('.task-checkbox').addEventListener('change', (e) => {
      task.done = e.target.checked;
      item.classList.toggle('done', task.done);
      renderTasksList();
      saveReviewData();
    });

    const removeButton = item.querySelector('.task-remove-btn');
    if (removeButton) {
      removeButton.addEventListener('click', () => {
        slide.art_director_tasks.splice(idx, 1);
        renderTasksList();
        saveReviewData();
      });
    }

    list.appendChild(item);
  });
}

function renderAnnotationsSidebar() {
  const list = document.getElementById('annotationsList');
  list.innerHTML = '';
  const slide = State.slides[State.activeSlideIdx];
  if (!slide || !slide.art_director_annotations) {
    document.getElementById('annCount').textContent = '0';
    updateAnnotationActions();
    return;
  }

  document.getElementById('annCount').textContent = slide.art_director_annotations.length;

  slide.art_director_annotations.forEach((ann, idx) => {
    const item = document.createElement('div');
    item.className = `ann-item ${State.selectedAnnotationId === ann.id ? 'selected' : ''}`;
    item.innerHTML = `
      <button class="ann-select-btn" type="button" title="Выбрать и показать пометку">
        <span class="ann-color" style="--ann-color:${escapeHtml(ann.color || '#EF4444')}"></span>
        <span class="ann-copy">
          <strong>${ann.type === 'arrow' ? 'Стрелка' : (ann.type === 'pin' ? 'Пин' : 'Задача')}</strong>
          <span>${escapeHtml(ann.label || 'Без подписи')}</span>
        </span>
      </button>
      <button class="ann-remove-btn" type="button" title="Удалить эту пометку" aria-label="Удалить пометку" ${State.readOnly ? 'disabled' : ''}>Удалить</button>
    `;

    item.querySelector('.ann-select-btn').addEventListener('click', () => selectAnnotation(ann.id));
    item.querySelector('.ann-remove-btn').addEventListener('click', () => deleteAnnotation(ann.id));

    list.appendChild(item);
  });
  updateAnnotationActions();
}

// --- MODAL & TICKET ---
function initModalActions() {
  const modal = document.getElementById('ticketModal');
  const exportBtn = document.getElementById('exportTicketBtn');
  const closeBtn = document.getElementById('closeTicketModalBtn');
  const copyBtn = document.getElementById('copyTicketBtn');
  const copyJsonBtn = document.getElementById('copyJsonBtn');
  const textarea = document.getElementById('ticketTextarea');

  exportBtn.addEventListener('click', () => {
    textarea.value = generateTicketMarkdown();
    modal.classList.add('open');
  });

  closeBtn.addEventListener('click', () => modal.classList.remove('open'));
  modal.addEventListener('click', (e) => {
    if (e.target === modal) modal.classList.remove('open');
  });

  copyBtn.addEventListener('click', () => {
    navigator.clipboard.writeText(textarea.value);
    alert('ТЗ скопировано в буфер обмена!');
  });

  copyJsonBtn.addEventListener('click', () => {
    navigator.clipboard.writeText(JSON.stringify({ meta: State.reviewMeta, slides: State.slides }, null, 2));
    alert('JSON скопирован!');
  });
}

function generateTicketMarkdown() {
  const meta = State.reviewMeta || {};
  const allIssues = State.slides.flatMap(slide => getSlideIssues(slide));
  const allTasks = State.slides.flatMap(slide => slide.art_director_tasks || []);
  const criticalCount = allIssues.filter(issue => issue.severity === 'critical').length;
  const importantCount = allIssues.length - criticalCount;
  const doneCount = allTasks.filter(task => task.done).length;
  const statusLabel = status => status === 'approved'
    ? 'Готово к проверке'
    : (status === 'needs_fix' ? 'В работе' : 'Переделать');

  let text = `# Сводное ТЗ: ${meta.product || 'Maccabi Mini'}\n\n`;
  text += `**Источник:** ${meta.source || 'Арт-директор'}  \n`;
  text += `**Дата ревизии:** ${meta.review_date || 'не указана'}  \n`;
  text += `**Объём:** ${State.slides.length} карточек · ${criticalCount} критических · ${importantCount} важных · ${doneCount}/${allTasks.length} задач выполнено\n\n`;

  if ((meta.global_issues || []).length) {
    text += `## Общие правила для всего набора\n\n`;
    meta.global_issues.forEach(rule => {
      text += `- **${rule.id}: ${rule.title}.** ${rule.detail}`;
      if ((rule.slides || []).length) text += ` _(карточки: ${rule.slides.join(', ')})_`;
      text += `\n`;
    });
    text += `\n`;
  }

  State.slides.forEach((slide, idx) => {
    const issues = getSlideIssues(slide);
    const tasks = slide.art_director_tasks || [];
    text += `## ${String(idx + 1).padStart(2, '0')}. ${slide.title}\n\n`;
    text += `**Роль:** ${slide.target_slide_role || 'не указана'}  \n`;
    text += `**Статус:** ${statusLabel(slide.status)}  \n`;
    text += `**Исходник:** ${slide.source_file || slide.file || 'не указан'}  \n`;
    if (slide.current_state) text += `**Текущее состояние:** ${slide.current_state}\n`;
    text += `\n### Что не работает\n\n`;
    issues.forEach(issue => {
      const severity = issue.severity === 'critical' ? 'КРИТИЧНО' : 'ВАЖНО';
      text += `- **[${issue.id}] ${severity} — ${issue.title}.** ${issue.detail}\n`;
    });
    text += `\n### Что нужно сделать\n\n`;
    tasks.forEach(task => {
      const refs = (task.issue_refs || []).length ? ` _(${task.issue_refs.join(', ')})_` : '';
      text += `- [${task.done ? 'x' : ' '}] **${task.id}.** ${task.text}${refs}\n`;
    });
    text += `\n`;
  });

  return text.trim();
}

// --- DASHBOARD TABLE ---
function renderDashboardTable() {
  const tbody = document.getElementById('productsTableBody');
  tbody.innerHTML = '';

  State.products.forEach(p => {
    const tr = document.createElement('tr');
    let statusClass = 'wait';
    if (p.status === 'Готово') statusClass = 'done';
    else if (p.status === 'На проверке') statusClass = 'review';
    else if (p.status === 'В работе') statusClass = 'wip';

    tr.innerHTML = `
      <td><strong>${p.name}</strong></td>
      <td><span class="f-badge ${p.has_data ? 'ok' : 'no'}">${p.has_data ? '✓' : '—'}</span></td>
      <td><span class="f-badge ${p.has_copy ? 'ok' : 'no'}">${p.has_copy ? '✓' : '—'}</span></td>
      <td><span class="f-badge ok">✓</span></td>
      <td><span class="f-badge ${p.has_review ? 'ok' : 'no'}">${p.has_review ? '10 шт' : '—'}</span></td>
      <td><span class="f-badge ${p.has_output ? 'ok' : 'no'}">${p.has_output ? `${p.cards_count} шт` : '—'}</span></td>
      <td><span class="tag-badge ${statusClass}">${p.status}</span></td>
      <td>
        <button class="btn btn-secondary btn-compact" onclick="jumpToProduct('${p.name}')">
          ${p.has_review ? 'Ревизия' : 'Открыть'}
        </button>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

function jumpToProduct(name) {
  document.querySelector('[data-tab="review-studio"]').click();
}

// --- CATALOG GRID ---
function renderCatalogGrid() {
  const grid = document.getElementById('catalogGrid');
  grid.innerHTML = '';

  State.products.forEach(p => {
    const card = document.createElement('div');
    card.className = 'cat-item-card';
    card.innerHTML = `
      <div style="display:flex; justify-content:space-between; align-items:flex-start;">
        <h4 class="cat-item-title">${p.name}</h4>
        <span class="tag-badge ${p.status === 'Готово' ? 'done' : (p.status === 'На проверке' ? 'review' : 'wip')}">${p.status}</span>
      </div>
      <div class="cat-folders">
        <span class="cat-f-pill">_DATA</span>
        <span class="cat-f-pill">_COPY</span>
        <span class="cat-f-pill">_CARD_MAP</span>
        <span class="cat-f-pill">IMAGES</span>
        <span class="cat-f-pill">ЧЕРТЕЖ</span>
      </div>
      <div style="margin-top:auto; padding-top:8px;">
        <button class="btn btn-secondary btn-compact" style="width:100%" onclick="jumpToProduct('${p.name}')">
          ${p.has_review ? 'Открыть ревизию (10 слайдов)' : 'Открыть файлы'}
        </button>
      </div>
    `;
    grid.appendChild(card);
  });
}

// --- INSPECTOR BREAKDOWN ---
function renderInspectorBreakdown() {
  const list = document.getElementById('inspectorSlidesList');
  list.innerHTML = '';

  State.slides.forEach((slide, idx) => {
    const issues = getSlideIssues(slide);
    const counts = {
      critical: countBySeverity(issues, 'critical'),
      important: countBySeverity(issues, 'important')
    };
    const topIssues = issues.slice(0, 2);
    const card = document.createElement('div');
    card.className = 'insp-card';
    card.innerHTML = `
      <img class="insp-preview" src="${getReviewImageUrl(slide.file)}" alt="${escapeHtml(slide.title)}">
      <div class="insp-details">
        <h4>${String(idx + 1).padStart(2, '0')}. ${escapeHtml(slide.title)}</h4>
        <p><strong>Сейчас:</strong> ${escapeHtml(slide.current_state || slide.ai_analysis?.summary || 'Описание не заполнено')}</p>
        ${topIssues.map(issue => `<p><strong>${escapeHtml(issue.id)}:</strong> ${escapeHtml(issue.title)}</p>`).join('')}
      </div>
      <div style="text-align:right">
        <div class="score-badge ${counts.critical ? '' : (counts.important ? 'medium' : 'good')}" style="display:inline-block">${issues.length}</div>
        <div class="insp-issue-breakdown">${counts.critical} крит. · ${counts.important} важн.</div>
        <div style="margin-top:6px">
          <span class="tag-badge ${slide.status === 'approved' ? 'done' : (slide.status === 'needs_fix' ? 'review' : 'rejected')}">
            ${slide.status === 'approved' ? 'Готово к проверке' : (slide.status === 'needs_fix' ? 'В работе' : 'Переделать')}
          </span>
        </div>
      </div>
    `;
    list.appendChild(card);
  });
}
