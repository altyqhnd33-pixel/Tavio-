# TAVIO — المرحلة 1: الأساس البرمجي

أساس فقط: رفع دفعي + تخزين + طبقة Gemini آمنة + حالات واضحة. التحليل التعليمي الكامل **غير منفذ** بعد.

## التشغيل المحلي
```
npm install
cp .dev.vars.example .dev.vars        # ضع GEMINI_API_KEY و TAVIO_ACCESS_CODE
npm run db:migrate:local
npm run dev
npm test                               # لا يحتاج شبكة ولا wrangler
```

## إعداد Cloudflare (يدوي، مرة واحدة)
1. `npx wrangler d1 create tavio-db` ثم ضع `database_id` في `wrangler.toml`.
2. أنشئ حاوية R2 باسم `tavio-files` (قد يطلب Cloudflare إضافة وسيلة دفع لتفعيل R2).
3. `npm run db:migrate:remote`
4. الأسرار: `npx wrangler pages secret put GEMINI_API_KEY` و `npx wrangler pages secret put TAVIO_ACCESS_CODE`
5. النشر: `npm run deploy` أو ربط مستودع Git. لا تعتمد على رفع المجلد بالسحب من لوحة التحكم: قد لا يُجمَّع مجلد `functions/` هناك.

## الأسرار والمتغيرات
| الاسم | النوع | الغرض |
|---|---|---|
| `GEMINI_API_KEY` | Secret | مفتاح Gemini، على الخادم فقط |
| `TAVIO_ACCESS_CODE` | Secret | رمز دخول المعلم؛ بدونه يُرفض كل `/api` |
| `GEMINI_MODEL` | Variable | اسم النموذج (افتراضي في wrangler.toml، تحقق منه) |
| `GEMINI_TIMEOUT_MS` | Variable | مهلة كل محاولة |
| `GEMINI_MAX_ATTEMPTS` | Variable | عدد المحاولات للأخطاء المؤقتة |

## الخريطة
- `public/` الواجهة (HTML/CSS/JS بلا بناء، RTL، للهاتف). `public/js/shared/constants.js` المصدر الوحيد للحالات والأخطاء.
- `functions/api/` نقاط الـAPI (رفيعة؛ المنطق في `src/server/`).
- `src/server/` أخطاء، إعادة محاولة، عميل Gemini، مراحل التحليل، D1، R2.
- `migrations/0001_init.sql` المخطط المستخدم الآن. `db/future/` بقية حلقة التعلم (غير مطبّق).
- `tests/` 29 اختبارًا (D1 وهمي فوق sqlite، وR2 وGemini وهميان).
