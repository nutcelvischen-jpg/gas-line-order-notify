/**
 * ============================================================
 * 📱 Google 表單下單 ➔ 試算表存檔 ➔ LINE 即時推播新訂單系統
 * 專為小白打造的極簡教學代碼（已綁定您的專屬憑證）
 * ============================================================
 */

// 1. 您的專屬憑證（請填入您的 LINE Channel Access Token 與 User ID）
const LINE_TOKEN = "YOUR_LINE_CHANNEL_ACCESS_TOKEN";
const MY_USER_ID = "YOUR_LINE_USER_ID";

/**
 * 2. 當 Google 表單送出時，自動執行的主函式
 */
function onFormSubmit(e) {
  // e.values 會依照 Google 表單題目的順序自動抓取填答內容
  const timestamp = e.values[0]; // 填表時間戳記
  const name = e.values[1];      // 第 1 題：姓名
  const phone = e.values[2];     // 第 2 題：電話
  const product = e.values[3];   // 第 3 題：商品
  const qty = e.values[4];       // 第 4 題：數量
  const note = e.values[5] || "無"; // 第 5 題：備註（選填）

  // 組裝推播至手機 LINE 的通知訊息
  const message = `🛎️ 報告老闆！收到一筆新訂單！\n` +
                  `━━━━━━━━━━━━━━━\n` +
                  `👤 客戶姓名：${name}\n` +
                  `📞 聯絡電話：${phone}\n` +
                  `📦 訂購商品：${product}\n` +
                  `🔢 訂購數量：${qty} 件\n` +
                  `📝 客戶備註：${note}\n` +
                  `⏰ 下單時間：${timestamp}\n` +
                  `━━━━━━━━━━━━━━━\n` +
                  `請儘速至試算表確認出貨！✨`;

  // 發送 LINE 推播訊息
  sendLinePush(MY_USER_ID, message);
}

/**
 * 3. 呼叫 LINE Messaging API 發送推播
 */
function sendLinePush(toUserId, text) {
  const url = "https://api.line.me/v2/bot/message/push";
  const payload = {
    to: toUserId,
    messages: [{ type: "text", text: text }]
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
