import { api, ApiError, getAccess, setAccess, clearAccess } from './api.js';
import { prepareImage } from './image-prep.js';
import { runPool, makePaperProcessor, needsWork } from './upload-queue.js';
import { STATUS_LABEL, msgFor } from './messages.js';

const app = document.getElementById('app');
const crumb = document.getElementById('crumb');

// مساعد DOM: نستخدم textContent دائمًا (لا innerHTML بأي نص قادم من المستخدم أو الخادم).
function h(tag, attrs = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') el.className = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (v === true) el.setAttribute(k, '');
    else if (v !== false && v != null) el.setAttribute(k, v);
  }
  for (const kid of kids.flat()) if (kid != null) el.append(kid.nodeType ? kid : document.createTextNode(kid));
  return el;
}
const uuid = () => crypto.randomUUID();

function render(...nodes) { app.replaceChildren(...nodes); }

// ---------- بوابة الدخول ----------
function showGate(message = '') {
  crumb.textContent = '';
  const input = h('input', { type: 'password', autocomplete: 'current-password', 'aria-label': 'رمز الوصول' });
  const err = h('p', { class: 'error' }, message);
  const go = async () => {
    setAccess(input.value.trim());
    try { await api.listAssessments(); route(); }
    catch (e) { clearAccess(); showGate(msgFor(e.code)); }
  };
  render(h('section', {},
    h('h2', {}, 'أدخل رمز الوصول'),
    h('p', { class: 'muted' }, 'الرمز الذي ضبطته في إعدادات Cloudflare.'),
    input, err,
    h('div', { class: 'row' }, h('button', { onclick: go }, 'دخول')),
  ));
}

// ---------- الرئيسية ----------
async function showHome() {
  crumb.textContent = '';
  const title = h('input', { type: 'text', placeholder: 'اسم التقييم، مثل: اختبار الرياضيات - الوحدة 2', 'aria-label': 'اسم التقييم' });
  const err = h('p', { class: 'error' });
  const list = h('ul', { class: 'plain' });
  const create = async () => {
    err.textContent = '';
    try {
      const { assessment } = await api.createAssessment(title.value);
      location.hash = `#/a/${assessment.id}`;
    } catch (e) { err.textContent = msgFor(e.code); }
  };
  render(
    h('section', {}, h('h2', {}, 'تقييم جديد'), title, err,
      h('div', { class: 'row' }, h('button', { onclick: create }, 'إنشاء التقييم'))),
    h('section', {}, h('h3', {}, 'تقييمات سابقة'), list),
  );
  try {
    const { assessments } = await api.listAssessments();
    if (!assessments.length) list.append(h('li', {}, h('p', { class: 'muted' }, 'لا توجد تقييمات بعد.')));
    for (const a of assessments) list.append(h('li', {}, h('a', { href: `#/a/${a.id}` }, a.title)));
  } catch (e) { handleApiError(e); }
}

// ---------- شاشة التقييم ----------
async function showAssessment(id) {
  let data;
  try { data = await api.getAssessment(id); } catch (e) { return handleApiError(e); }
  crumb.textContent = data.assessment.title;

  let sheetCount = data.question_sheet_files;
  let sheetMsg = '';
  // العناصر: ما جاء من الخادم (بلا ملف محلي) + ما يختاره المعلم الآن
  const items = new Map(data.papers.map((p) => [p.id, {
    id: p.id, name: p.original_name || 'ورقة', status: p.status,
    errorCode: p.error_code, uploaded: !['uploading', 'pending'].includes(p.status) && p.error_code !== 'UPLOAD_FAILED', file: null,
  }]));
  let running = false;

  const sheetBox = h('section');
  const papersBox = h('section');
  render(sheetBox, papersBox);

  const processor = makePaperProcessor({
    api, prepare: prepareImage, assessmentId: id, onChange: () => draw(),
  });

  async function pickSheets(files) {
    sheetMsg = 'جارٍ رفع ورقة الأسئلة…'; draw();
    let failed = 0;
    await runPool([...files], async (file) => {
      try {
        const blob = await prepareImage(file);
        await api.uploadQuestionSheet(id, uuid(), blob);
        sheetCount += 1;
      } catch { failed += 1; }
    }, 2);
    sheetMsg = failed ? `تعذّر رفع ${failed} صورة. أعد اختيارها.` : '';
    draw();
  }

  function pickPapers(files) {
    for (const file of files) {
      const itemId = uuid();
      items.set(itemId, { id: itemId, name: file.name, status: 'pending', errorCode: null, uploaded: false, file });
    }
    draw();
  }

  async function start(only = null) {
    if (running) return;
    const todo = (only ? [only] : [...items.values()].filter(needsWork)).filter((i) => i.file || i.uploaded);
    if (!todo.length) return;
    running = true; draw();
    await runPool(todo, processor, 2);
    running = false; draw();
  }

  function draw() {
    const list = [...items.values()];
    const done = list.filter((i) => ['success', 'needs_review', 'failed'].includes(i.status)).length;

    sheetBox.replaceChildren(
      h('h3', {}, 'ورقة الأسئلة'),
      h('p', { class: 'muted' }, sheetCount
        ? `تم رفع ${sheetCount} صورة. يمكنك إضافة صفحات أخرى.`
        : 'ارفع ورقة الأسئلة أولًا. بدونها لا تبدأ معالجة أوراق الطلاب.'),
      sheetMsg && h('p', { class: sheetMsg.startsWith('تعذّر') ? 'error' : 'muted' }, sheetMsg),
      filePicker('sheet-input', sheetCount ? 'إضافة صفحة' : 'اختيار ورقة الأسئلة', pickSheets, !sheetCount),
    );

    const strip = h('div', { class: 'strip', 'aria-hidden': 'true' }, list.map((i) => h('i', { class: i.status })));
    papersBox.replaceChildren(
      h('h3', {}, 'أوراق الطلاب'),
      list.length ? [strip, h('p', { class: 'muted' }, `${done} من ${list.length} انتهت`)]
        : h('p', { class: 'muted' }, 'اختر عدة صور من الهاتف دفعة واحدة.'),
      h('div', { class: 'row' },
        filePicker('papers-input', 'اختيار أوراق الطلاب', pickPapers, !list.length && !!sheetCount),
        h('button', { disabled: running || !sheetCount || !list.some((i) => needsWork(i) && (i.file || i.uploaded)), onclick: () => start() },
          list.some((i) => i.status === 'failed') ? 'إعادة محاولة الفاشلة وإكمال الباقي' : 'ابدأ المعالجة'),
      ),
      list.map(paperRow),
    );
  }

  function paperRow(i) {
    const why = i.errorCode ? msgFor(i.errorCode)
      : i.status === 'pending' ? '' : '';
    const canRetry = !running && ['failed', 'needs_review'].includes(i.status) && (i.file || i.uploaded);
    return h('div', { class: 'paper' },
      h('div', { class: 'head' }, h('span', { class: 'name' }, i.name), h('span', { class: `chip ${i.status}` }, STATUS_LABEL[i.status] || i.status)),
      why && h('p', { class: 'why' }, why),
      !i.file && !i.uploaded && i.status === 'failed' && h('p', { class: 'why' }, 'أعد اختيار هذه الصورة.'),
      canRetry && h('div', { class: 'row' }, h('button', { class: 'small ghost', onclick: () => start(i) }, 'أعد المحاولة')),
    );
  }

  draw();
}

function filePicker(inputId, label, onPick, primary) {
  const input = h('input', {
    id: inputId, class: 'file-input', type: 'file', accept: 'image/*', multiple: true,
    onchange: (e) => { const f = [...e.target.files]; e.target.value = ''; if (f.length) onPick(f); },
  });
  return h('span', {}, input, h('label', { class: `btn${primary ? '' : ' ghost'}`, for: inputId }, label));
}

// ---------- التوجيه ----------
function handleApiError(e) {
  if (e instanceof ApiError && e.code === 'ACCESS_DENIED') return showGate(getAccess() ? msgFor(e.code) : '');
  render(h('section', {}, h('p', { class: 'error' }, msgFor(e.code)),
    e.extra?.missing ? h('p', { class: 'muted' }, `ينقص: ${e.extra.missing.join('، ')}`) : null));
}

function route() {
  if (!getAccess()) return showGate();
  const m = location.hash.match(/^#\/a\/([\w-]+)/);
  return m ? showAssessment(m[1]) : showHome();
}
addEventListener('hashchange', route);
route();
