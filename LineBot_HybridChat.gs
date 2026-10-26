/**
 * ============================================================
 * 🤖 LINE 雙軌智慧客服機器人 (含快捷膠囊選單 Quick Reply)
 * 核心特色：
 * 1. 客人一加好友 (Follow)，自動跳出親切歡迎詞 + 底部快捷按鈕
 * 2. 任何對話結束後，訊息下方自動附帶 4 顆圓角膠囊按鈕
 * 3. 點選「查訂單」自動秒讀 Google 試算表訂單進度
 * 4. 點選「找真人」立刻發送 Push Message 叮咚老闆私人手機
 * 5. 其餘自由提問交給 Gemini 3.8 Flash 智慧解答
 * ============================================================
 */

// 1. 您的專屬憑證設定（建議至「專案設定 > 指令碼屬性」配置，亦可填入下方預設值）
const SCRIPT_PROPS = PropertiesService.getScriptProperties();
const LINE_TOKEN = SCRIPT_PROPS.getProperty('LINE_ACCESS_TOKEN') || "YOUR_LINE_ACCESS_TOKEN";
const BOSS_USER_ID = SCRIPT_PROPS.getProperty('BOSS_USER_ID') || "YOUR_USER_ID";
const GEMINI_KEY = SCRIPT_PROPS.getProperty('GEMINI_API_KEY') || "YOUR_GEMINI_API_KEY";

/**
 * 瀏覽器健康檢查進入點 (GET 請求)
 * 解決初學者將 Web App 網址貼至瀏覽器時跳出「找不到 doGet」的常見困惑
 */
function doGet(e) {
  return HtmlService.createHtmlOutput(
    "<div style='font-family:sans-serif;text-align:center;padding:40px;'>" +
    "<h2 style='color:#06c755;'>🟢 LINE Bot Webhook 伺服器運作中！</h2>" +
    "<p style='color:#555;'>請在手機 LINE 官方帳號聊天室中傳送訊息測試。</p>" +
    "</div>"
  ).setTitle("LINE Bot Webhook 狀態");
}

/**
 * 2. Webhook 進入點：接收來自 LINE 的所有事件
 */
function doPost(e) {
  try {
    if (!e || !e.postData || !e.postData.contents) {
      return ContentService.createTextOutput("OK");
    }

    const data = JSON.parse(e.postData.contents);
    const event = data.events[0];
    if (!event) return ContentService.createTextOutput("OK");

    const replyToken = event.replyToken;
    const userId = event.source.userId;

    // ----------------------------------------------------
    // 事件 A：客人【剛加入好友】或【解除封鎖】
    // ----------------------------------------------------
    if (event.type === 'follow') {
      const welcomeMsg = "🎉 歡迎加入「國立臺中科技大學 國貿系」官方頻道！\n" +
                         "我是您的 AI 智慧助理「咒語兔」🐰✨\n\n" +
                         "請問今天有什麼我可以協助您的嗎？\n" +
                         "您可以直接輸入問題（詢問系所介紹、服務時間、地址位置或查訂單），或點選下方快捷按鈕開始體驗！";
      replyWithQuickReply(replyToken, welcomeMsg);
      return ContentService.createTextOutput("OK");
    }

    // ----------------------------------------------------
    // 事件 B：客人【傳送文字訊息】
    // ----------------------------------------------------
    if (event.type === 'message' && event.message.type === 'text') {
      const userMsg = event.message.text.trim();

      // [軌道一：精準功能判斷]
      // 1. 營業時間 / 服務時間 / 地址
      if (userMsg === "營業時間" || userMsg === "門市時間" || userMsg === "服務時間") {
        const text = "⏰【國立臺中科技大學 國貿系 服務資訊】\n" +
                     "週一至週五：08:30 - 17:00 (中午 12:00-13:00 休息)\n" +
                     "週六、週日及國定假日公休\n" +
                     "📍 地址：台中市北區三民路三段129號 (三民校區中正大樓 國貿系辦)\n" +
                     "📞 電話：(04) 2219-6120\n" +
                     "線上諮詢與咒語兔 AI 24 小時為您服務！✨";
        replyWithQuickReply(replyToken, text);
        return ContentService.createTextOutput("OK");
      }

      // 2. 查訂單提示
      if (userMsg === "查訂單" || userMsg === "查詢訂單") {
        const text = "📦 請輸入您的【訂購電話號碼】（例如：0912-345-678 或 0912345678），我立刻幫您從試算表查詢最新進度！";
        replyWithQuickReply(replyToken, text);
        return ContentService.createTextOutput("OK");
      }

      // 3. 輸入電話查單（自動識別數字）
      const cleanDigits = userMsg.replace(/[^0-9]/g, "");
      if (cleanDigits.length >= 8) {
        const orderStatus = searchOrderInSheet(cleanDigits);
        replyWithQuickReply(replyToken, orderStatus);
        return ContentService.createTextOutput("OK");
      }

      // 4. 呼叫真人客服
      if (userMsg === "找真人" || userMsg === "真人客服" || userMsg === "轉接真人") {
        // 回覆客人
        const text = "🛎️ 已為您發送緊急推播給系辦專人！助教/專人稍後將親自於本對話框為您服務，請您稍候片刻！";
        replyWithQuickReply(replyToken, text);

        // 同時 Push 推播給負責人手機
        const alertMsg = `🚨【真人客服緊急警報】有使用者請求真人接手！\n` +
                         `━━━━━━━━━━━━━━━\n` +
                         `👤 使用者 User ID：${userId}\n` +
                         `💬 最後一句話：${userMsg}\n` +
                         `⏰ 呼叫時間：${new Date().toLocaleTimeString()}\n` +
                         `━━━━━━━━━━━━━━━\n` +
                         `請儘速前往 LINE Official Manager 後台回覆！`;
        pushToBoss(alertMsg);
        return ContentService.createTextOutput("OK");
      }

      // [軌道二：自由提問交給 Gemini 3.8 Flash 智慧回答]
      const aiReply = askGemini(userMsg);
      replyWithQuickReply(replyToken, aiReply);
      return ContentService.createTextOutput("OK");
    }

    return ContentService.createTextOutput("OK");

  } catch (err) {
    console.error("Webhook Error:", err);
    return ContentService.createTextOutput("OK");
  }
}

/**
 * 3. 核心選單函式：每次回覆客人時，訊息下方自動附帶 4 顆圓角膠囊快捷按鈕
 */
function replyWithQuickReply(replyToken, messageText) {
  const url = "https://api.line.me/v2/bot/message/reply";

  const payload = {
    replyToken: replyToken,
    messages: [
      {
        type: "text",
        text: messageText,
        // 👇 這就是讓按鈕在輸入框上方彈出的核心設定
        quickReply: {
          items: [
            {
              type: "action",
              action: { type: "message", label: "📦 查詢訂單", text: "查訂單" }
            },
            {
              type: "action",
              action: { type: "message", label: "⏰ 營業時間", text: "營業時間" }
            },
            {
              type: "action",
              action: { type: "message", label: "❓ 常見問題", text: "常見問題" }
            },
            {
              type: "action",
              action: { type: "message", label: "👤 轉接真人", text: "找真人" }
            }
          ]
        }
      }
    ]
  };

  const options = {
    method: "post",
    headers: {
      "Content-Type": "application/json",
      "Authorization": "Bearer " + LINE_TOKEN
    },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  };

  UrlFetchApp.fetch(url, options);
}

/**
 * 4. 查表函式：在當前試算表的「訂單列表」工作表比對電話
 */
function searchOrderInSheet(phoneKeyword) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName("訂單列表") || ss.getSheets()[0];
    const data = sheet.getDataRange().getValues();

    if (data.length <= 1) {
      return `⚠️ 目前訂單資料庫中暫無記錄，請輸入「找真人」由店長為您查詢。`;
    }

    // 從第 2 列開始搜尋 (標題列略過)
    for (let i = 1; i < data.length; i++) {
      const rowStr = data[i].join(" ");
      const rowDigits = rowStr.replace(/[^0-9]/g, "");

      if (rowDigits.includes(phoneKeyword)) {
        // 假設欄位順序：時間[0], 姓名[1], 電話[2], 商品[3], 數量[4], 狀態[5]
        const name = data[i][1] || "貴賓";
        const prod = data[i][3] || "商品";
        const status = data[i][5] || "處理中";

        return `📦 查到您的訂單進度囉！\n` +
               `━━━━━━━━━━━━━━━\n` +
               `👤 訂購大名：${name}\n` +
               `🛍️ 訂購項目：${prod}\n` +
               `🚚 目前進度：【${status}】\n` +
               `━━━━━━━━━━━━━━━\n` +
               `如有任何問題，歡迎隨時點選下方「轉接真人」！`;
      }
    }

    return `⚠️ 抱歉，系統找不到與「${phoneKeyword}」相符的訂單。\n請確認號碼是否正確，或點選下方「轉接真人」由專人協助！`;
  } catch (e) {
    return `查詢時發生小問題，請直接點選「轉接真人」由店長協助您！`;
  }
}

/**
 * 5. Gemini 3.8 Flash 智慧客服問答
 */
function askGemini(userQuestion) {
  try {
    // 嘗試從試算表的「FAQ」工作表抓取知識庫
    let knowledge = "";
    try {
      const ss = SpreadsheetApp.getActiveSpreadsheet();
      const faqSheet = ss.getSheetByName("FAQ");
      if (faqSheet) {
        const rows = faqSheet.getDataRange().getValues();
        for (let r = 1; r < rows.length; r++) {
          if (rows[r][0] && rows[r][1]) {
            knowledge += `問：${rows[r][0]}，答：${rows[r][1]}\n`;
          }
        }
      }
    } catch (_) {}

    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent?key=${GEMINI_KEY}`;

    const systemPrompt = `你是國立臺中科技大學國際貿易系（國貿系）的官方 AI 智慧助理「咒語兔」🐰。
原則：
1. 保持親切、專業、熱情，一律使用「繁體中文」。
2. 介紹系所、服務時間、地址、課程活動或商品訂單時，請優先參考以下官方知識庫回答。
3. 若知識庫未提及或超出範圍，請客氣告知並建議點選下方「轉接真人」由系辦助教/專人為您服務。
【官方知識庫】：
${knowledge}`;

    const payload = {
      contents: [{ role: "user", parts: [{ text: userQuestion }] }],
      systemInstruction: { parts: [{ text: systemPrompt }] },
      generationConfig: { temperature: 0.3, maxOutputTokens: 600 }
    };

    const res = UrlFetchApp.fetch(url, {
      method: "post",
      contentType: "application/json",
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    });

    const json = JSON.parse(res.getContentText());
    if (json.candidates && json.candidates[0].content.parts[0].text) {
      return json.candidates[0].content.parts[0].text;
    }
    return "很抱歉，我暫時無法回答這個問題，請點選下方「轉接真人」由專人為您服務！";
  } catch (err) {
    return "很抱歉，客服連線稍有延遲，請點選下方「轉接真人」！";
  }
}

/**
 * 6. 發送緊急警報給老闆手機 (Push Message)
 */
function pushToBoss(text) {
  const url = "https://api.line.me/v2/bot/message/push";
  UrlFetchApp.fetch(url, {
    method: "post",
    headers: {
      "Content-Type": "application/json",
      "Authorization": "Bearer " + LINE_TOKEN
    },
    payload: JSON.stringify({
      to: BOSS_USER_ID,
      messages: [{ type: "text", text: text }]
    }),
    muteHttpExceptions: true
  });
}
