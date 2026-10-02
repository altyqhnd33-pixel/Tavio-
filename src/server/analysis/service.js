import { ERROR_CODE } from '../../../public/js/shared/constants.js';
import { TavioError } from '../errors.js';
import { generateContent } from '../gemini/client.js';
import { withRetry } from '../retry.js';

// واجهة المراحل: كل مرحلة { name, run(ctx) } وتُرجع نتيجة أو ترمي TavioError.
// المراحل التعليمية القادمة (قراءة السؤال، تحديد الطالب، استخراج الدليل...) تُضاف هنا لاحقًا.

// المرحلة الوحيدة الآن: فحص قراءة الصورة. هي اختبار للبنية (Gemini + R2 + الحالات)
// وليست تحليلًا تعليميًا.
export const qualityCheckStage = {
  name: 'quality_check',
  async run({ env, image, fetchImpl }) {
    const { value, attempts } = await withRetry(
      () => generateContent(env, {
        fetchImpl,
        images: [image],
        system: 'You check photos of handwritten student school papers. Do not grade or interpret the work.',
        prompt:
          'Is this a photo of a paper whose handwriting/print can be read? ' +
          'Return JSON only: {"is_paper": boolean, "readable": boolean, "problems": array of ' +
          '"blur"|"dark"|"glare"|"cropped"|"rotated"|"other"}',
      }),
      { maxAttempts: Number(env.GEMINI_MAX_ATTEMPTS || 3) },
    );
    const j = value.json;
    if (!j || typeof j.readable !== 'boolean') {
      throw new TavioError(ERROR_CODE.ANALYSIS_FAILED, { internal: 'quality_check: unparsable model output' });
    }
    if (j.is_paper === false || j.readable === false) {
      const err = new TavioError(ERROR_CODE.IMAGE_UNCLEAR, { internal: `problems=${JSON.stringify(j.problems || [])}` });
      err.attempts = attempts;
      throw err;
    }
    return { stage: 'quality_check', readable: true, problems: j.problems || [], attempts };
  },
};

export const STAGES = [qualityCheckStage];

// يشغّل المراحل بالترتيب على ورقة واحدة. أول خطأ يوقف هذه الورقة فقط.
export async function analyzePaper(ctx, stages = STAGES) {
  const results = [];
  for (const stage of stages) results.push(await stage.run(ctx));
  return results;
}
