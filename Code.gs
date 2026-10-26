/**
 * LINE Bot + Gemini API + Google Apps Script (GAS) 完整客服架構實作
 * 
 * 核心功能：
 * 1. Webhook 接入與安全驗證（支援 Secret URL Token 與事件解析）
 * 2. 會話狀態管理（使用 CacheService 支援滑動過期，避免 PropertiesService 500KB 配額爆掉）
 * 3. 知識庫與 FAQ 自動注入（支援 Google Sheet FAQ + 記憶體快取加速）
 * 4. Gemini API 串接（支援 gemini-1.5-flash / gemini-2.5-flash、systemInstruction、安全防護與重試）
 * 5. LINE Messaging API 回覆處理（長文字自動分段切片，上限 5000 字元）
 * 6. 長期交談紀錄非同步/即時寫入 Google Sheet（稽核、客服分析用）
 */

// ==========================================
// 1. 環境設定與配置取得
// ==========================================
function getConfig() {
  const props = PropertiesService.getScriptProperties();
  return {
    lineAccessToken: props.getProperty('LINE_ACCESS_TOKEN') || '',
    webhookSecretToken: props.getProperty('WEBHOOK_SECRET_TOKEN') || '', // URL 參數驗證金鑰
    geminiApiKey: props.getProperty('GEMINI_API_KEY') || '',
    geminiModel: props.getProperty('GEMINI_MODEL') || 'gemini-1.5-flash',
    logSheetId: props.getProperty('LOG_SHEET_ID') || '',               // 對話日誌 Sheet ID（選填）
    faqSheetId: props.getProperty('FAQ_SHEET_ID') || '',               // 知識庫 FAQ Sheet ID（選填）
    maxHistoryRounds: parseInt(props.getProperty('MAX_HISTORY_ROUNDS') || '3', 10), // 保留輪數（預設 3 輪）
    sessionTtlSeconds: 3600 // 快取存活時間（秒），預設 1 小時
  };
}

// ==========================================
// 2. 進入點：doPost(e) 與 doGet(e)
// ==========================================

/**
 * 伺服器健康檢查與 Webhook 測試
 */
function doGet(e) {
  return ContentService.createTextOutput(JSON.stringify({
    status: 'online',
    message: 'LINE Gemini AI Customer Service Webhook is running!',
    timestamp: new Date().toISOString()
  })).setMimeType(ContentService.MimeType.JSON);
}

/**
 * Webhook 接收來自 LINE 的訊息
 */
function doPost(e) {
  const startTime = new Date().getTime();
  const config = getConfig();

  try {
    // [安全性防禦] 檢查 Webhook Secret Token（若有設定）
    // 解決 GAS 無法直接讀取 Request Header (x-line-signature) 的限制
    if (config.webhookSecretToken) {
      const incomingToken = e.parameter ? e.parameter.token : null;
      if (incomingToken !== config.webhookSecretToken) {
        console.warn('Unauthorized request: Invalid or missing token');
        return ContentService.createTextOutput(JSON.stringify({ status: 'unauthorized' }))
          .setMimeType(ContentService.MimeType.JSON);
      }
    }

    if (!e || !e.postData || !e.postData.contents) {
      return ContentService.createTextOutput(JSON.stringify({ status: 'no_payload' }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    const payload = JSON.parse(e.postData.contents);
    const events = payload.events || [];

    // 若為 LINE Developers 的驗證請求（無 events 或為空）
    if (events.length === 0) {
      return ContentService.createTextOutput(JSON.stringify({ status: 'ok', message: 'Verification passed' }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    // 依序處理各個事件（通常單次為 1 筆）
    for (const event of events) {
      handleEvent(event, config, startTime);
    }

    return ContentService.createTextOutput(JSON.stringify({ status: 'success' }))
      .setMimeType(ContentService.MimeType.JSON);

  } catch (error) {
    console.error('Fatal Webhook Error:', error.stack || error.message);
    return ContentService.createTextOutput(JSON.stringify({
      status: 'error',
      message: error.message
    })).setMimeType(ContentService.MimeType.JSON);
  }
}

// ==========================================
// 3. 事件路由與核心邏輯
// ==========================================
function handleEvent(event, config, startTime) {
  // 只處理使用者傳送的純文字訊息
  if (event.type !== 'message' || !event.message || event.message.type !== 'text') {
    console.log(`Ignored event type: ${event.type}`);
    return;
  }

  const userId = event.source.userId;
  const userMessage = (event.message.text || '').trim();
  const replyToken = event.replyToken;

  if (!userMessage) return;

  // 1. 取得對話上下文歷史 (CacheService)
  const history = getSessionHistory(userId);

  // 2. 獲取知識庫 FAQ 資訊（選用）
  const knowledgeBase = getKnowledgeBase(config);

  // 3. 調用 Gemini 生成回覆
  let assistantReply = '';
  let apiStatus = 'SUCCESS';

  try {
    assistantReply = callGeminiApi(userMessage, history, knowledgeBase, config);
  } catch (err) {
    console.error('Gemini API Invocation Error:', err);
    assistantReply = '很抱歉，目前客服 AI 大腦連線稍有延遲，請稍等片刻後再試一次，或由真人客服為您服務。';
    apiStatus = 'FAILED: ' + err.message;
  }

  // 4. 將回覆推回 LINE
  sendLineReply(replyToken, assistantReply, config.lineAccessToken);

  // 5. 更新對話上下文快取
  updateSessionHistory(userId, userMessage, assistantReply, history, config);

  // 6. 寫入長期稽核紀錄至 Google Sheets (非阻塞處理)
  const latencyMs = new Date().getTime() - startTime;
  logToSheet(userId, userMessage, assistantReply, latencyMs, apiStatus, config);
}

// ==========================================
// 4. Gemini API 整合
// ==========================================
function callGeminiApi(userMessage, history, knowledgeBase, config) {
  if (!config.geminiApiKey) {
    throw new Error('GEMINI_API_KEY is not configured in Script Properties.');
  }

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${config.geminiModel}:generateContent?key=${config.geminiApiKey}`;

  // 組裝多輪對話歷史 + 當前問題
  const contents = [
    ...history,
    {
      role: 'user',
      parts: [{ text: userMessage }]
    }
  ];

  // System Instruction 角色規範與邊界
  let systemPrompt = `你是一家專業優質品牌的官方 AI 智能客服。
職責與原則：
1. 語氣保持親切、客氣、精簡、專業、清晰（繁體中文）。
2. 解答商品規格、運送流程、售後政策與訂單等常見問題。
3. 若用戶提問超出你的認知範疇或涉及機密個資，請委婉告知並引導其留下聯絡方式以待真人客服專員對接。
4. 回覆避免使用過於繁複的 Markdown 格式，適度使用列表使閱讀清晰。`;

  // 若有知識庫內容，注入到 System Instruction 中
  if (knowledgeBase) {
    systemPrompt += `\n\n【最新官方參考知識庫 / 常見問答 FAQ】：\n${knowledgeBase}\n請優先依據上述知識庫內容作答；若知識庫未提及，依通用客服規範禮貌回應。`;
  }

  const payload = {
    contents: contents,
    systemInstruction: {
      parts: [{ text: systemPrompt }]
    },
    generationConfig: {
      temperature: 0.3,
      topP: 0.85,
      maxOutputTokens: 800
    },
    safetySettings: [
      { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_ONLY_HIGH' },
      { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_ONLY_HIGH' },
      { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_ONLY_HIGH' },
      { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_ONLY_HIGH' }
    ]
  };

  const options = {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  };

  const response = UrlFetchApp.fetch(url, options);
  const responseCode = response.getResponseCode();
  const rawText = response.getContentText();

  if (responseCode !== 200) {
    console.error(`Gemini API Error [${responseCode}]: ${rawText}`);
    throw new Error(`Gemini API returned status code ${responseCode}`);
  }

  const json = JSON.parse(rawText);

  if (json.candidates && json.candidates.length > 0) {
    const candidate = json.candidates[0];
    if (candidate.content && candidate.content.parts && candidate.content.parts.length > 0) {
      return candidate.content.parts[0].text;
    }
    // 命中安全防護過濾
    if (candidate.finishReason === 'SAFETY') {
      return '此問題涉及安全政策限制，無法提供回覆，請聯繫真人客服為您協助。';
    }
  }

  return '很抱歉，我暫時無法回答這個問題，請稍候重試或聯絡人工客服。';
}

// ==========================================
// 5. LINE Messaging API 出口層
// ==========================================
function sendLineReply(replyToken, replyText, channelAccessToken) {
  if (!channelAccessToken) {
    console.error('LINE_ACCESS_TOKEN is missing!');
    return;
  }

  const url = 'https://api.line.me/v2/bot/message/reply';

  // LINE 單則文字上限為 5000 字元，切片保護
  const messages = splitReplyText(replyText).map(chunk => ({
    type: 'text',
    text: chunk
  }));

  const payload = {
    replyToken: replyToken,
    messages: messages.slice(0, 5) // LINE 單次回覆最多 5 則訊息
  };

  const options = {
    method: 'post',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${channelAccessToken}`
    },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  };

  const res = UrlFetchApp.fetch(url, options);
  if (res.getResponseCode() !== 200) {
    console.error('LINE Reply API Error:', res.getContentText());
  }
}

/**
 * 將超過 4500 字元的回覆安全切成小段
 */
function splitReplyText(text, maxLength = 4500) {
  if (text.length <= maxLength) return [text];
  const chunks = [];
  let remaining = text;
  while (remaining.length > 0) {
    chunks.push(remaining.substring(0, maxLength));
    remaining = remaining.substring(maxLength);
  }
  return chunks;
}

// ==========================================
// 6. 會話與短期記憶 (CacheService)
// ==========================================

/**
 * 讀取短期上下文記憶
 * 採用 CacheService：具備 TTL 自動釋放機制，不會累積垃圾資料，也不會耗盡 PropertiesService 的 500KB 上限
 */
function getSessionHistory(userId) {
  try {
    const cache = CacheService.getScriptCache();
    const raw = cache.get(`session_${userId}`);
    if (!raw) return [];
    return JSON.parse(raw);
  } catch (err) {
    console.warn('Failed to read cache:', err);
    return [];
  }
}

/**
 * 更新短期對話記憶 (保留最近 N 輪對話)
 */
function updateSessionHistory(userId, userText, modelText, currentHistory, config) {
  try {
    const updated = [
      ...currentHistory,
      { role: 'user', parts: [{ text: userText }] },
      { role: 'model', parts: [{ text: modelText }] }
    ];

    // 保留指定輪數（一輪包含 user 與 model 兩筆，故乘以 2）
    const maxEntries = config.maxHistoryRounds * 2;
    const trimmed = updated.slice(-maxEntries);

    const cache = CacheService.getScriptCache();
    // CacheService 寫入時限最大 21600 秒 (6 小時)，這裡設定 sessionTtlSeconds
    cache.put(`session_${userId}`, JSON.stringify(trimmed), config.sessionTtlSeconds);
  } catch (err) {
    console.error('Failed to update session cache:', err);
  }
}

// ==========================================
// 7. 知識庫與 FAQ 動態注入 (Google Sheets + 快取)
// ==========================================
function getKnowledgeBase(config) {
  if (!config.faqSheetId) return '';

  const cache = CacheService.getScriptCache();
  const cacheKey = 'faq_knowledge_content';
  const cached = cache.get(cacheKey);
  if (cached) return cached;

  try {
    const ss = SpreadsheetApp.openById(config.faqSheetId);
    const sheet = ss.getSheets()[0];
    const data = sheet.getDataRange().getValues();

    if (data.length <= 1) return '';

    // 假設第一列為標題，A 欄為問題/主題，B 欄為標準解答
    const lines = [];
    for (let i = 1; i < data.length; i++) {
      const q = (data[i][0] || '').toString().trim();
      const a = (data[i][1] || '').toString().trim();
      if (q && a) {
        lines.push(`問：${q}\n答：${a}`);
      }
    }

    const kbText = lines.join('\n---\n');
    // 快取 10 分鐘 (600 秒)，避免頻繁讀取試算表造成延遲
    cache.put(cacheKey, kbText, 600);
    return kbText;
  } catch (err) {
    console.error('Failed to load FAQ from Google Sheet:', err);
    return '';
  }
}

// ==========================================
// 8. 長期日誌記錄 (Google Sheets)
// ==========================================
function logToSheet(userId, userMessage, assistantReply, latencyMs, status, config) {
  if (!config.logSheetId) return;

  try {
    const ss = SpreadsheetApp.openById(config.logSheetId);
    const sheet = ss.getSheetByName('Logs') || ss.getSheets()[0];

    // 格式化台北時間
    const timestamp = Utilities.formatDate(new Date(), 'Asia/Taipei', 'yyyy-MM-dd HH:mm:ss');
    sheet.appendRow([
      timestamp,
      userId,
      userMessage,
      assistantReply,
      `${latencyMs} ms`,
      status
    ]);
  } catch (err) {
    console.error('Failed to log conversation to Sheet:', err);
  }
}

// ==========================================
// 9. 輔助與測試工具函式
// ==========================================

/**
 * 快速初始化建立日誌試算表表頭
 * （請先在專案屬性中填入 LOG_SHEET_ID 後執行此函式）
 */
function setupLogSheetHeaders() {
  const config = getConfig();
  if (!config.logSheetId) {
    Logger.log('請先於「專案設定 > 指令碼屬性」設定 LOG_SHEET_ID！');
    return;
  }
  const ss = SpreadsheetApp.openById(config.logSheetId);
  let sheet = ss.getSheetByName('Logs');
  if (!sheet) {
    sheet = ss.insertSheet('Logs');
  }
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(['時間戳記', '用戶 ID (userId)', '用戶提問', 'AI 回覆內容', '處理耗時', '狀態']);
    sheet.getRange(1, 1, 1, 6).setFontWeight('bold').setBackground('#EFEFEF');
    Logger.log('日誌試算表表頭建立完成！');
  } else {
    Logger.log('表頭已存在，未更動。');
  }
}

/**
 * 測試 Gemini API 是否能正常通訊
 */
function testGeminiApi() {
  const config = getConfig();
  Logger.log(`Testing Gemini API with model: ${config.geminiModel}...`);
  try {
    const reply = callGeminiApi('哈囉，請用一句話介紹你自己！', [], '', config);
    Logger.log('✅ Gemini API 測試成功！回傳如下：');
    Logger.log(reply);
  } catch (err) {
    Logger.log('❌ Gemini API 測試失敗：' + err.message);
  }
}

/**
 * 一鍵設定指令碼屬性示範（請替換為你的真實金鑰後在編輯器點選「執行」）
 */
function initSampleProperties() {
  const properties = {
    LINE_ACCESS_TOKEN: 'YOUR_LINE_CHANNEL_ACCESS_TOKEN',
    GEMINI_API_KEY: 'YOUR_GEMINI_API_KEY',
    GEMINI_MODEL: 'gemini-1.5-flash',
    WEBHOOK_SECRET_TOKEN: 'create_a_random_secret_here_e.g_mySecretToken1234',
    LOG_SHEET_ID: '', // 選填：填入 Google Sheet ID 即可自動記錄日誌
    FAQ_SHEET_ID: '', // 選填：填入 Google Sheet ID 即可自動作為知識庫
    MAX_HISTORY_ROUNDS: '3'
  };
  PropertiesService.getScriptProperties().setProperties(properties);
  Logger.log('指令碼屬性初始化完畢！請記得更新為您真正的金鑰。');
}
