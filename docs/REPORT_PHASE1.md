# تقرير المرحلة 1 — أساس TAVIO

## 1) شجرة الملفات
```
tavio/
├─ README.md, package.json, wrangler.toml, .gitignore, .dev.vars.example
├─ migrations/0001_init.sql          db/future/0002_learning_loop.sql (غير مطبّق)
├─ public/  index.html, _headers, css/app.css
│  └─ js/ app.js, api.js, image-prep.js, upload-queue.js, messages.js, shared/constants.js
├─ functions/api/
│  ├─ _middleware.js, health.js
│  ├─ assessments/index.js
│  ├─ assessments/[id]/index.js
│  ├─ assessments/[id]/question-sheet/[fileId].js
│  ├─ assessments/[id]/papers/[paperId].js
│  └─ papers/[paperId]/analyze.js
├─ src/server/ errors.js, retry.js, http.js, access.js, storage.js, db.js
│  ├─ gemini/client.js
│  └─ analysis/service.js
└─ tests/ helpers.js, unit.test.js, integration.test.js
```

## 2) وظيفة كل ملف
- constants.js: الحالات والانتقالات المسموحة ورموز الأخطاء (يستوردها الخادم والواجهة).
- messages.js: كل نصوص المعلم. لا تُعرض رسائل Gemini الخام.
- app.js: الشاشات (دخول، تقييمات، شاشة التقييم). api.js: استدعاءات الخادم. image-prep.js: تصغير صور الهاتف قبل الرفع.
- upload-queue.js: مجمّع التزامن + مسار الورقة (رفع ثم فحص) بعزل كامل لكل ورقة.
- _middleware.js: رمز الوصول على كل /api عدا /health. health.js: فحص الإعداد (true/false بلا قيم).
- assessments/*: إنشاء التقييم وحالته. question-sheet: رفع ورقة الأسئلة. papers/[paperId]: رفع ورقة طالب. analyze: معالجة ورقة واحدة.
- errors.js: ترجمة أخطاء Gemini إلى رموز TAVIO + تنقية المفاتيح. retry.js: إعادة محاولة بتراجع أسّي. client.js: استدعاء Gemini. service.js: مراحل التحليل (مرحلة واحدة الآن).
- db.js: كل SQL. storage.js: مفاتيح R2 والتحقق من الصور.
- 0001_init.sql: assessments, assessment_files, questions, students, student_papers, analysis_jobs, evidence.

## 3) اتصال الواجهة بالخادم
fetch إلى /api/* من الأصل نفسه مع header اسمه x-tavio-access (الرمز يُحفظ في localStorage على الهاتف). لا مفاتيح في الواجهة.

## 4) وصول الخادم إلى Gemini
analyze.js ← service.js ← client.js ← REST generateContent. المفتاح من env.GEMINI_API_KEY ويُرسل في header (ليس في الرابط). مهلة لكل محاولة، وإعادة محاولة للمؤقت فقط.

## 5) تخزين الصور
R2 (ربط FILES): assessments/{id}/papers/{paperId}.jpg و assessments/{id}/question-sheet/{fileId}.jpg. الحاوية خاصة، ولا يوجد رابط عام.

## 6) تخزين البيانات
D1 (ربط DB) بالمخطط أعلاه. حقول الدليل كلها nullable، وتصنيف الخطأ مقيّد بالقائمة المتفق عليها.

## 7) رفع المجموعة
الواجهة تختار عدة صور → تصغّرها → لكل ورقة معرّف UUID يولّده العميل → PUT مستقل لكل ورقة (تزامن 2) → analyze مستقل لكل ورقة. إعادة الرفع بنفس المعرّف آمنة (idempotent). شريط مقاطع: مقطع لكل ورقة بلون حالتها.

## 8) فشل ورقة واحدة
فشل الورقة يرجع 200 بحالتها ورمز خطأها، لا خطأ HTTP، فلا تتأثر الأوراق الناجحة. الإعادة تخص الورقة الفاشلة فقط ولا تعيد رفعها إن كانت مرفوعة. حجز الورقة للمعالجة ذري (معالجتان متزامنتان لنفس الورقة: واحدة فقط تمر). ورقة عالقة في processing أكثر من دقيقتين تُستلم من جديد.

## 9) ما نُفّذ فعلًا (ومُختبر بأدوات وهمية)
بوابة الوصول (تفشل مغلقة)، رفع دفعي مع عزل، حالات وانتقالات، ترجمة الأخطاء (high demand → AI_SERVICE_BUSY)، retry/timeout/rate limit، تنقية المفاتيح من السجلات، شرط ورقة الأسئلة أولًا، D1 وR2 وهميان بدفعة 15 ورقة فيها مشغول وغير واضح وناجح.
مرحلة التحليل الوحيدة الآن هي فحص قراءة الصورة (اختبار للبنية، وليست تحليلًا تعليميًا). حالة success تعني فقط أنها اجتازت هذا الفحص.

## 10) ما لم يُنفّذ
قراءة ورقة الأسئلة واستخراج الأسئلة والمهارات (جدول questions جاهز فقط)، تحديد الطالب والسؤال، استخراج الدليل المنظم، الأنماط، Evidence Gate، الفرضية والتحقق والتدخل وإعادة القياس والقرار، Result Card، شاشة مراجعة للأوراق needs_review.

## ما لم يُختبر
تشغيل فعلي على Cloudflare (wrangler)، Gemini الحقيقي (اسم النموذج وسلوك المخرجات)، D1 وR2 الحقيقيان، واجهة المتصفح وتصغير الصور (canvas) على هاتف حقيقي، رفع 15 صورة فعلية من الهاتف.

## 11) إعداد يدوي في Cloudflare
D1 (إنشاء + database_id)، حاوية R2، تطبيق الـmigration، الأسرار، النشر بـwrangler أو Git (انظر README).

## 12) الأسرار والمتغيرات (أسماء فقط)
Secrets: GEMINI_API_KEY, TAVIO_ACCESS_CODE. Variables: GEMINI_MODEL, GEMINI_TIMEOUT_MS, GEMINI_MAX_ATTEMPTS. Bindings: DB, FILES.

## 13) الخطوة التالية المقترحة
اختبار حقيقي أولًا: نشر + رفع ورقة أسئلة + 15 ورقة فعلية ومراقبة نسب الفشل. ثم المرحلة 2: قراءة ورقة الأسئلة إلى questions (سؤال، مطلوب، إجابة متوقعة، مهارة) مع تأكيد المعلم.
