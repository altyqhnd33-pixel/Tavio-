// كل نصوص الواجهة التي يقرؤها المعلم. لا تُعرض رسائل تقنية أو رسائل Gemini الخام أبدًا.

export const STATUS_LABEL = {
  pending: 'بانتظار الرفع',
  uploading: 'جارٍ الرفع',
  uploaded: 'تم الرفع',
  processing: 'جارٍ الفحص',
  success: 'اجتازت فحص القراءة', // في المرحلة 1 هذه هي المرحلة الوحيدة؛ تُحدَّث عند إضافة التحليل
  failed: 'تعذّرت المعالجة',
  needs_review: 'تحتاج مراجعتك',
};

// رسالة + ما على المعلم فعله. خدمة الذكاء الاصطناعي ≠ ذنب الصورة.
export const ERROR_MESSAGE = {
  IMAGE_UNCLEAR: 'الصورة غير واضحة. صوّرها مرة أخرى بإضاءة أفضل.',
  AI_SERVICE_BUSY: 'خدمة التحليل مشغولة الآن، والورقة سليمة. أعد المحاولة بعد قليل.',
  AI_RATE_LIMIT: 'عدد الطلبات كبير الآن. انتظر دقيقة ثم أعد المحاولة.',
  AI_TIMEOUT: 'استغرق التحليل وقتًا طويلًا. أعد المحاولة.',
  AI_ERROR: 'حدث خلل في خدمة التحليل. أعد المحاولة.',
  IDENTIFICATION_UNCERTAIN: 'لم نتأكد من هوية الطالب. يحتاج تأكيدك.',
  QUESTION_UNCERTAIN: 'لم نتأكد من السؤال المقابل للإجابة. يحتاج تأكيدك.',
  ANALYSIS_FAILED: 'تعذّر إكمال تحليل هذه الورقة. أعد المحاولة.',
  NEEDS_REVIEW: 'هذه الورقة تحتاج مراجعتك.',
  UPLOAD_FAILED: 'فشل رفع الصورة. أعد الرفع.',
  NETWORK_ERROR: 'انقطع الاتصال. تحقق من الإنترنت ثم أعد المحاولة.',
  UNSUPPORTED_IMAGE: 'تعذّر فتح هذه الصورة. اختر صورة JPEG أو PNG.',
  QUESTION_SHEET_REQUIRED: 'ارفع ورقة الأسئلة أولًا.',
  ALREADY_PROCESSING: 'هذه الورقة قيد الفحص الآن.',
};

export const API_MESSAGE = {
  ACCESS_DENIED: 'رمز الوصول غير صحيح.',
  SETUP_REQUIRED: 'الخادم يحتاج إعدادًا في Cloudflare قبل العمل.',
  TITLE_REQUIRED: 'اكتب اسم التقييم.',
  ASSESSMENT_NOT_FOUND: 'لم يُعثر على هذا التقييم.',
  NETWORK_ERROR: ERROR_MESSAGE.NETWORK_ERROR,
  INTERNAL: 'حدث خطأ غير متوقع. حاول مرة أخرى.',
};

export const msgFor = (code) => ERROR_MESSAGE[code] || API_MESSAGE[code] || 'حدث خطأ. حاول مرة أخرى.';
