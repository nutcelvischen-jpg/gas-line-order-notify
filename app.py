#!/usr/bin/env python3
"""
【本機實戰系統】線上訂單下單系統 ➔ 即時 LINE 推播通知
免安裝任何額外套件，使用 Python 內建模組啟動！
"""

import http.server
import socketserver
import json
import urllib.request
import urllib.error
import csv
import os
import webbrowser
from datetime import datetime

PORT = 8888
CSV_FILE = "orders.csv"

# 您的專屬憑證（亦可由環境變數讀取）
LINE_TOKEN = os.environ.get("LINE_TOKEN", "YOUR_LINE_CHANNEL_ACCESS_TOKEN")
MY_USER_ID = os.environ.get("MY_USER_ID", "YOUR_LINE_USER_ID")

HTML_CONTENT = """<!DOCTYPE html>
<html lang="zh-TW">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>🎓 國立臺中科技大學 國貿系 - 實習訂單系統</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      background: #f1f5f9;
      color: #1e293b;
      display: flex;
      justify-content: center;
      align-items: center;
      min-height: 100vh;
      padding: 20px;
    }
    .order-card {
      background: white;
      width: 100%;
      max-width: 480px;
      border-radius: 20px;
      box-shadow: 0 10px 30px rgba(0,0,0,0.08);
      overflow: hidden;
    }
    .header {
      background: linear-gradient(135deg, #06c755, #00b047);
      color: white;
      padding: 24px;
      text-align: center;
    }
    .header h1 { font-size: 20px; margin-bottom: 6px; }
    .header p { font-size: 13px; opacity: 0.9; }
    .form-body { padding: 24px; }
    .form-group { margin-bottom: 16px; }
    label { display: block; font-size: 13px; font-weight: 600; margin-bottom: 6px; color: #475569; }
    input, select, textarea {
      width: 100%;
      padding: 12px 14px;
      border: 1.5px solid #cbd5e1;
      border-radius: 10px;
      font-size: 14px;
      outline: none;
      transition: border-color 0.2s;
    }
    input:focus, select:focus, textarea:focus { border-color: #06c755; }
    .submit-btn {
      width: 100%;
      background: #06c755;
      color: white;
      border: none;
      padding: 14px;
      border-radius: 12px;
      font-size: 16px;
      font-weight: 700;
      cursor: pointer;
      display: flex;
      justify-content: center;
      align-items: center;
      gap: 8px;
      margin-top: 10px;
      transition: background 0.2s, transform 0.1s;
    }
    .submit-btn:hover { background: #00b047; }
    .submit-btn:active { transform: scale(0.98); }
    .submit-btn:disabled { background: #94a3b8; cursor: not-allowed; }
    .result-modal {
      display: none;
      background: #f0fdf4;
      border: 1.5px solid #86efac;
      border-radius: 12px;
      padding: 16px;
      margin-top: 20px;
      text-align: center;
    }
    .result-modal.show { display: block; animation: pop 0.3s ease; }
    @keyframes pop { from { opacity: 0; transform: scale(0.95); } to { opacity: 1; transform: scale(1); } }
  </style>
</head>
<body>
  <div class="order-card">
    <div class="header">
      <h1>🎓 國立臺中科技大學 國貿系 實習商店</h1>
      <p>下單後，訂單將即時推播至管理員手機 LINE！</p>
    </div>
    
    <div class="form-body">
      <div class="form-group">
        <label>👤 訂購人姓名</label>
        <input type="text" id="custName" placeholder="例如：陳大明" value="陳大明" required>
      </div>

      <div class="form-group">
        <label>📞 聯絡電話</label>
        <input type="tel" id="custPhone" placeholder="例如：0912-345-678" value="0912-345-678" required>
      </div>

      <div class="form-group">
        <label>📦 選擇商品</label>
        <select id="prodSelect">
          <option value="頂級主動降噪藍牙耳機 ($3,200)">🎧 頂級主動降噪藍牙耳機 ($3,200)</option>
          <option value="復古機械式鍵盤 ($2,480)">⌨️ 復古機械式鍵盤 ($2,480)</option>
          <option value="人體工學垂直滑鼠 ($1,350)">🖱️ 人體工學垂直滑鼠 ($1,350)</option>
          <option value="極速 65W 快充充電頭 ($690)">⚡ 極速 65W 快充充電頭 ($690)</option>
        </select>
      </div>

      <div class="form-group">
        <label>🔢 訂購數量</label>
        <input type="number" id="prodQty" value="1" min="1" max="10">
      </div>

      <div class="form-group">
        <label>📝 備註事項（選填）</label>
        <textarea id="orderNote" rows="2" placeholder="例如：請下午送達、放管理室"></textarea>
      </div>

      <button class="submit-btn" id="submitBtn" onclick="sendOrder()">
        <span>確認送出訂單</span> ➔
      </button>

      <div class="result-modal" id="resultModal">
        <h3 style="color: #15803d; margin-bottom: 6px;">🎉 訂單已成功送出！</h3>
        <p style="font-size: 13.5px; color: #166534;" id="resultDesc">
          手機 LINE 應該已經收到叮咚通知囉！
        </p>
      </div>
    </div>
  </div>

  <script>
    async function sendOrder() {
      const name = document.getElementById('custName').value.trim();
      const phone = document.getElementById('custPhone').value.trim();
      const product = document.getElementById('prodSelect').value;
      const qty = document.getElementById('prodQty').value;
      const note = document.getElementById('orderNote').value.trim();
      const btn = document.getElementById('submitBtn');
      const modal = document.getElementById('resultModal');

      if (!name || !phone) {
        alert('請填寫姓名與電話！');
        return;
      }

      btn.disabled = true;
      btn.innerHTML = '正在發送 LINE 通知...';

      try {
        const res = await fetch('/api/order', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name, phone, product, qty, note })
        });
        const data = await res.json();
        
        btn.disabled = false;
        btn.innerHTML = '確認送出訂單 ➔';

        if (data.success) {
          modal.className = 'result-modal show';
          document.getElementById('resultDesc').innerText = data.message;
        } else {
          alert('發送失敗：' + data.error);
        }
      } catch (err) {
        btn.disabled = false;
        btn.innerHTML = '確認送出訂單 ➔';
        alert('連線失敗：' + err.message);
      }
    }
  </script>
</body>
</html>
"""

def send_line_push(name, phone, product, qty, note, timestamp):
    """呼叫 LINE Messaging API 發送推播到老闆手機"""
    url = "https://api.line.me/v2/bot/message/push"
    
    msg_text = (
        f"🛎️【即時新訂單通知】\n"
        f"━━━━━━━━━━━━━━\n"
        f"👤 客戶姓名：{name}\n"
        f"📞 聯絡電話：{phone}\n"
        f"📦 訂購商品：{product}\n"
        f"🔢 訂購數量：{qty} 件\n"
        f"📝 備註：{note if note else '無'}\n"
        f"⏰ 下單時間：{timestamp}\n"
        f"━━━━━━━━━━━━━━\n"
        f"資料已同步存入本機 orders.csv 訂單庫存表中！✨"
    )

    payload = {
        "to": MY_USER_ID,
        "messages": [{"type": "text", "text": msg_text}]
    }

    req = urllib.request.Request(
        url,
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {LINE_TOKEN}"
        },
        method="POST"
    )
    
    with urllib.request.urlopen(req) as resp:
        return resp.getcode() == 200

def save_to_csv(name, phone, product, qty, note, timestamp):
    """將訂單存入 CSV（模擬 Google 試算表資料庫）"""
    file_exists = os.path.exists(CSV_FILE)
    with open(CSV_FILE, mode="a", newline="", encoding="utf-8-sig") as f:
        writer = csv.writer(f)
        if not file_exists:
            writer.writerow(["下單時間", "客戶姓名", "聯絡電話", "訂購商品", "數量", "備註"])
        writer.writerow([timestamp, name, phone, product, qty, note])

class OrderHandler(http.server.SimpleHTTPRequestHandler):
    def do_GET(self):
        self.send_response(200)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.end_headers()
        self.wfile.write(HTML_CONTENT.encode("utf-8"))

    def do_POST(self):
        if self.path == "/api/order":
            content_length = int(self.headers.get("Content-Length", 0))
            post_data = self.rfile.read(content_length)
            data = json.loads(post_data.decode("utf-8"))

            name = data.get("name", "")
            phone = data.get("phone", "")
            product = data.get("product", "")
            qty = data.get("qty", 1)
            note = data.get("note", "")
            now_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

            try:
                # 1. 存入 CSV 資料庫
                save_to_csv(name, phone, product, qty, note, now_str)
                # 2. 發送 LINE 推播
                send_line_push(name, phone, product, qty, note, now_str)

                response = {
                    "success": True,
                    "message": "🎉 訂單已成立！已同步寫入 orders.csv 並推播通知至老闆手機 LINE！"
                }
            except Exception as e:
                response = {
                    "success": False,
                    "error": str(e)
                }

            self.send_response(200)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.end_headers()
            self.wfile.write(json.dumps(response).encode("utf-8"))

def run():
    print(f"🚀 下單系統伺服器已啟動於：http://localhost:{PORT}")
    socketserver.TCPServer.allow_reuse_address = True
    with socketserver.TCPServer(("", PORT), OrderHandler) as httpd:
        httpd.serve_forever()

if __name__ == "__main__":
    run()
