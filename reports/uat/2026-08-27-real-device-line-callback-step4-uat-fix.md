# Real-device LINE callback and Step 4 UAT fix

Owner video showed Landing after successful Android callback, malformed loading copy, and an over-broad UAT Step 4 block.

The callback root cause was one-layer `liff.state` parsing in two separate classifiers. Android can nest/rewrite callback state, allowing the initial marker to evade the first-paint hold. Both the head guard and imported startup classifier now walk up to four `liff.state` layers before rendering. Successful identity still commits Step 1 and `landingDismissed` before marker cleanup and bootstrap release.

Loading body text now uses the approved exact UTF-8 string: `กรุณารอสักครู่ ระบบกำลังเชื่อมต่อบัญชี LINE ของคุณ`; title remains `กำลังเชื่อมต่อ LINE`.

The UAT `goToStep(4)` blanket block was removed. Friendship checks remain before Step 4. Actual checkout, payment, CRM/order creation, LINE order notifications, and analytics remain independently blocked by their existing UAT guards.

20 focused LINE/OA tests plus syntax/diff checks pass. UAT Vercel deployment and owner real-device validation remain required; no production change occurred.
