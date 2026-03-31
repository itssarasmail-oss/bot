const { Telegraf, Markup } = require('telegraf');
const admin = require('firebase-admin');

// 1. ربط مفتاح الفايربيز (تأكد أن الملف في نفس الفولدر)
const serviceAccount = require("./full-mark-giza-firebase-adminsdk-fbsvc-d3b5aa294c.json");

if (!admin.apps.length) {
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
    });
}

const db = admin.firestore();
const bot = new Telegraf('8515120154:AAEZNstK27Rr5j_X7vYkXRyfHipqK7pZ1Ec');

const OWNER_ID = 6188310641; 
let userState = {};

const generateCode = () => Math.floor(100000 + Math.random() * 900000).toString();

async function isAuthorized(userId) {
    if (userId === OWNER_ID) return true;
    const doc = await db.collection('admins').doc(userId.toString()).get();
    return doc.exists;
}

// إنشاء القائمة الرئيسية
const getMainKeyboard = async (userId) => {
    let buttons = [
        [Markup.button.callback('✨ تفعيل طالب جديد', 'ask_name_month'), Markup.button.callback('🔄 تجديد الاشتراك', 'renew_init')],
        [Markup.button.callback('📱 تغيير الجهاز', 'reset_device_init'), Markup.button.callback('🆓 عمل تجربة مجانية', 'ask_name_trial')],
        [Markup.button.callback('📝 تحديث بيانات طالب', 'edit_student_init'), Markup.button.callback('👤 شوف بيانات الطالب', 'view_info_init')]
    ];
    
    // ميزة الأدمن (إضافة موظف + زرار المراقبة الجديد)
    if (userId === OWNER_ID) {
        buttons.push([Markup.button.callback('➕ إضافة موظف', 'add_admin_init'), Markup.button.callback('💰 مراقبة الأرباح', 'monitor_staff')]);
    }
    return Markup.inlineKeyboard(buttons);
};

bot.start(async (ctx) => {
    const userId = ctx.from.id;
    if (!(await isAuthorized(userId))) return ctx.reply("⚠️ غير مصرح لك.");
    const keyboard = await getMainKeyboard(userId);
    ctx.reply(`✨ مـرحـبـاً بـك فـي لـوحـة تـحـكـم Full Mark 🚀`, keyboard);
});

// --- ميزة مراقبة الموظفين (خاصة بك فقط) ---
bot.action('monitor_staff', async (ctx) => {
    if (ctx.from.id !== OWNER_ID) return;
    
    const today = new Date().toISOString().split('T')[0];
    const snapshot = await db.collection('logs').where('date', '==', today).get();
    
    if (snapshot.empty) return ctx.reply("❌ لا توجد عمليات مسجلة اليوم حتى الآن.");

    let report = `📊 إحصائيات الموظفين اليوم (${today}):\n\n`;
    let stats = {};

    snapshot.forEach(doc => {
        const data = doc.data();
        stats[data.adminName] = (stats[data.adminName] || 0) + 1;
    });

    for (const [name, count] of Object.entries(stats)) {
        report += `👤 ${name}: ${count} عملية\n`;
    }

    ctx.reply(report, Markup.inlineKeyboard([[Markup.button.callback('🔙 رجوع', 'main_menu')]]));
});

// --- تسجيل العملية عند إصدار كود ---
const mKeys = { 'major_adabi': 'أدبي', 'major_oloom': 'علمي علوم', 'major_رياضة': 'علمي رياضة' };
Object.keys(mKeys).forEach(k => {
    bot.action(k, async (ctx) => {
        const s = userState[ctx.from.id];
        if (!s) return;
        const code = generateCode();
        const today = new Date().toISOString().split('T')[0];

        const data = { 
            code, 
            studentName: s.studentName, 
            major: mKeys[k], 
            type: s.type, 
            isUsed: false, 
            deviceId: null, 
            createdAt: admin.firestore.FieldValue.serverTimestamp() 
        };

        // حفظ كود الطالب
        await db.collection('student_codes').doc(code).set(data);

        // (الجديد) حفظ سجل العملية للمراقبة
        await db.collection('logs').add({
            adminId: ctx.from.id,
            adminName: ctx.from.first_name,
            action: s.type,
            date: today,
            timestamp: admin.firestore.FieldValue.serverTimestamp()
        });

        ctx.replyWithMarkdown(`✅ تم التفعيل بنجاح\n🎫 الكود: \`${code}\``, Markup.inlineKeyboard([[Markup.button.callback('🔙 رجوع', 'main_menu')]]));
        delete userState[ctx.from.id];
    });
});

// زرار إضافة موظف جديد
bot.action('add_admin_init', (ctx) => {
    if (ctx.from.id !== OWNER_ID) return;
    userState[ctx.from.id] = { step: 'waiting_for_admin_id' };
    ctx.reply('👤 ابعت الـ ID الخاص بالموظف الجديد:');
});

bot.on('text', async (ctx) => {
    const userId = ctx.from.id;
    const state = userState[userId];
    if (!state) return;

    if (state.step === 'waiting_for_admin_id' && userId === OWNER_ID) {
        await db.collection('admins').doc(ctx.text).set({ addedBy: OWNER_ID, name: "موظف جديد" });
        ctx.reply('✅ تم إضافة الموظف بنجاح.');
        delete userState[userId];
    }
    // بقية الـ logic الخاص بالاسم
    else if (state.step === 'waiting_for_name') {
        userState[userId].studentName = ctx.text;
        userState[userId].step = 'waiting_for_major';
        ctx.reply(`اخـتار شـعبة الطـالـب:`, Markup.inlineKeyboard([
            [Markup.button.callback('📚 أدبي', 'major_adabi'), Markup.button.callback('🧪 علمي علوم', 'major_oloom')],
            [Markup.button.callback('📐 علمي رياضة', 'major_رياضة')]
        ]));
    }
});

bot.action('main_menu', async (ctx) => {
    const keyboard = await getMainKeyboard(ctx.from.id);
    ctx.editMessageText(`✨ لوحة التحكم الرئيسية:`, keyboard);
});

bot.launch();
console.log("Full Mark Bot is Online 🚀");
