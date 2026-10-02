// منطق الدفعة بلا DOM حتى يمكن اختباره: مجمّع تزامن + مسار ورقة واحدة (رفع ثم فحص).
// كل ورقة مستقلة: فشلها لا يوقف غيرها ولا يمسّ نتائج الناجحة.

export async function runPool(items, worker, concurrency = 2) {
  const queue = [...items];
  const runners = Array.from({ length: Math.min(concurrency, queue.length) }, async () => {
    while (queue.length) {
      const item = queue.shift();
      try { await worker(item); } catch { /* worker مسؤول عن تسجيل فشل عنصره */ }
    }
  });
  await Promise.all(runners);
}

// item: { id, file?, name, status, errorCode, uploaded }
// deps: { api, prepare, assessmentId, onChange(item) }
export function makePaperProcessor({ api, prepare, assessmentId, onChange }) {
  const set = (item, status, errorCode = null) => {
    item.status = status; item.errorCode = errorCode; onChange(item);
  };

  return async function processPaper(item) {
    try {
      if (!item.uploaded) {
        if (!item.file) return set(item, 'failed', 'UPLOAD_FAILED'); // الملف ضاع بعد إعادة فتح الصفحة
        set(item, 'uploading');
        let blob;
        try { blob = await prepare(item.file); }
        catch { return set(item, 'failed', 'UNSUPPORTED_IMAGE'); }
        const up = await api.uploadPaper(assessmentId, item.id, blob, item.name);
        if (up.paper.status === 'failed') return set(item, 'failed', up.paper.error_code);
        item.uploaded = true;
        set(item, 'uploaded');
      }
      set(item, 'processing');
      const res = await api.analyzePaper(item.id);
      set(item, res.paper.status, res.paper.error_code);
    } catch (err) {
      // أخطاء على مستوى الطلب (شبكة، ورقة الأسئلة ناقصة...). لا نرمي: العنصر وحده يفشل.
      set(item, 'failed', err.code || 'AI_ERROR');
    }
  };
}

// أيّ العناصر تدخل "ابدأ/أعد المحاولة": كل ما لم ينجح ولم ينتظر مراجعة المعلم.
export const needsWork = (item) => ['pending', 'uploaded', 'failed'].includes(item.status);
