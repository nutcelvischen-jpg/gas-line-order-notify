/**
 * 純 Google Apps Script 網頁版 AI 聊天機器人 (獨立 Web App)
 * 支援 Vertex AI（吃 GCP 贈金）與 Google AI Studio 雙模式
 */

function doGet(e) {
  return HtmlService.createHtmlOutputFromFile('index')
    .setTitle('AI 專屬智慧助理')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

/**
 * 處理來自前端網頁的對話請求
 */
function processUserMessage(userMessage, sessionId) {
  try {
    const props = PropertiesService.getScriptProperties();
    const apiKey = props.getProperty('GEMINI_API_KEY') || 'YOUR_GEMINI_API_KEY';
    const model = props.getProperty('GEMINI_MODEL') || 'gemini-2.5-flash';

    if (!userMessage || !userMessage.trim()) {
      return { success: false, error: '請輸入訊息內容' };
    }

    // 1. 讀取會話歷史記憶 (CacheService)
    const cache = CacheService.getScriptCache();
    const cacheKey = `chat_session_${sessionId}`;
    let history = [];
    const cached = cache.get(cacheKey);
    if (cached) {
      history = JSON.parse(cached);
    }

    // 2. 組裝上下文
    const contents = [
      ...history,
      { role: 'user', parts: [{ text: userMessage }] }
    ];

    const payload = {
      contents: contents,
      systemInstruction: {
        parts: [{ text: "你是親切、專業的 AI 智慧助理。請以繁體中文回答使用者的問題，條理清晰。" }]
      },
      generationConfig: {
        temperature: 0.4,
        maxOutputTokens: 800
      }
    };

    // 3. 呼叫端點 (支援 Vertex AI Express Mode 與 AI Studio 模式)
    // 若使用 Vertex AI Express Mode（可抵扣 GCP 抵用金）：
    const url = `https://aiplatform.googleapis.com/v1/publishers/google/models/${model}:generateContent?key=${apiKey}`;
    
    // 若切換為 AI Studio 原生端點請改用以下：
    // const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

    const res = UrlFetchApp.fetch(url, {
      method: 'post',
      contentType: 'application/json',
      headers: {
        'x-goog-api-key': apiKey
      },
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    });

    const json = JSON.parse(res.getContentText());

    if (res.getResponseCode() !== 200) {
      const errMsg = (json.error && json.error.message) ? json.error.message : 'API 呼叫失敗';
      return { success: false, error: errMsg };
    }

    let replyText = '很抱歉，我暫時無法回答這個問題。';
    if (json.candidates && json.candidates[0].content && json.candidates[0].content.parts[0].text) {
      replyText = json.candidates[0].content.parts[0].text;
    }

    // 4. 更新歷史快取 (保留最近 3 輪對話)
    history.push({ role: 'user', parts: [{ text: userMessage }] });
    history.push({ role: 'model', parts: [{ text: replyText }] });
    cache.put(cacheKey, JSON.stringify(history.slice(-6)), 3600);

    return { success: true, reply: replyText };

  } catch (err) {
    return { success: false, error: err.message };
  }
}
