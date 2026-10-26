# 🚀 Google Apps Script × LINE 訂單即時推播通知 & 輕量 ERP 系統 (Antigravity Skill)

> **專為零基礎學員、中小電商與個人工作室設計的無痛商業自動化套件**  
> 支援「Google 表單下單 ➔ Google 試算表存檔 ➔ 老闆手機 LINE 即時叮咚通知」，並內建 Gemini 3.8 Flash 智慧客服對話系統！

---

## 🌟 核心特色

- **零程式碼門檻**：前端使用大眾最熟悉的 Google 表單 (Google Forms) 下單，後端使用 Google 試算表 (Google Sheets) 當作可視化資料庫。
- **免設定 Webhook**：不同於複雜的雙向客服機器人，通知系統採用 **LINE Messaging API (Push 模式)**，無需 Webhook URL，零阻礙發送。
- **解決 2025 LINE Notify 終止痛點**：全面採用官方標準 LINE Messaging API，提供一鍵複製 User ID 的小白教學路徑。
- **附贈本機實戰系統**：包含 `app.py` 本機下單伺服器（免開 Google 帳號也能即時測試推播到手機）與 `test_line_push.py` 診斷工具。
- **結合 Gemini 3.8 Flash**：內建 Gemini 3.8 Flash 智慧對話機器人（Python 終端機版 + 獨立 HTML 網頁版）。

---

## 📂 專案架構與檔案清單

```text
├── SKILL.md                          # Antigravity 專屬 Skill 定義檔
├── COURSE_CURRICULUM.md              # 📘 6 小時「零基礎小白 AI 實戰工作坊」超詳細教案手冊 (含 AI 提詞指令)
├── LineBot_HybridChat.gs             # 完整雙軌智慧客服核心腳本（Quick Reply + 查試算表 + Gemini 3.8 + 真人推播）
├── GoogleSheet_LineOrderNotify.gs    # Google 試算表 ➔ LINE 推播核心腳本（18行）
├── app.py                            # 本機線上商店下單伺服器（Port 8888）
├── test_line_push.py                 # LINE Token 與 User ID 一鍵診斷測試工具
├── chatbot.py                        # Gemini 3.8 Flash 終端機對話機器人
├── chat.html                         # Gemini 3.8 Flash 獨立網頁版聊天室
├── WebApp_Bot.gs                     # 純 GAS 網頁版 AI 助理後端腳本
├── Code.gs                           # 進階 LINE 客服機器人後端代碼
├── appsscript.json                   # Google Apps Script 專案設定檔
└── README.md                         # 專案詳細說明手冊
```

---

## 快速開始 1：【30 秒實測】本機商店下單 ➔ LINE 推播

無需任何設定，直接在終端機啟動本機測試商店：

```bash
python3 app.py
```
啟動後會開啟 `http://localhost:8888`，在網頁上點擊 **「確認送出訂單」**，您的手機 LINE 將在 1 秒內收到真實的訂單推播！

---

## 快速開始 2：【教學實戰】Google 表單連動 LINE 通知（40 分鐘搞定）

### 步驟 1. 建立下單 Google 表單
1. 前往 [Google 表單](https://forms.google.com/) 建立訂單，依序新增題目：
   * `姓名`、`電話`、`商品`、`數量`、`備註`
2. 點擊「回覆」分頁 ➔ 點擊 **「連結到試算表」** 建立 Google 試算表。

### 步驟 2. 貼入 Google Apps Script 腳本
1. 在試算表點選上方選單 **「擴充功能」 ➔ 「Apps Script」**。
2. 開啟專案內的 `GoogleSheet_LineOrderNotify.gs`，將程式碼貼入：
   * 替換你的 `LINE_TOKEN`（在 LINE Developers 的 Messaging API 分頁取得）。
   * 替換你的 `MY_USER_ID`（在 LINE Developers 的 Basic settings 分頁最下方「Your user ID」取得）。
3. 儲存專案。

### 步驟 3. 掛上自動觸發器
1. 在 Apps Script 左側點擊 ⏰ **「觸發條件 (Triggers)」** ➔ 點右下角 **「新增觸發條件」**。
2. 設定如下：
   * **要執行的功能**：`onFormSubmit`
   * **活動來源**：`來自試算表`
   * **活動類型**：`提交表單時 (On form submit)`
3. 點擊「儲存」並允許 Google 帳號授權存取。

**大功告成！** 只要有人填寫表單，您的手機就會即時收到叮咚通知！

---

## 快速開始 3：Gemini 3.8 Flash AI 對話測試

* **網頁版**：直接雙擊開啟 `chat.html`。
* **終端機版**：
  ```bash
  python3 chatbot.py
  ```

---

## 授權條款 (License)

本專案採用 [MIT License](LICENSE) 授權，歡迎自由修改、教學使用與商業整合。
