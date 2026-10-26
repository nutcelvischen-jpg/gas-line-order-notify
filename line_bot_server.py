#!/usr/bin/env python3
"""
【即時實測】本機雙軌 LINE Bot Webhook 伺服器
整合：Quick Reply 膠囊按鈕 + 查訂單 + Gemini 3.8 Flash AI 客服 + 老闆真人推播
"""

import http.server
import socketserver
import json
import urllib.request
import urllib.error
import os
import csv
from datetime import datetime

PORT = 5055
LINE_TOKEN = os.environ.get("LINE_TOKEN", "YOUR_LINE_CHANNEL_ACCESS_TOKEN")
BOSS_USER_ID = os.environ.get("MY_USER_ID", "YOUR_LINE_USER_ID")
GEMINI_KEY = os.environ.get("GEMINI_API_KEY", "YOUR_GEMINI_API_KEY")

def reply_line_with_quick_reply(reply_token, text):
    """回覆給客人，並在訊息下方彈出 4 顆圓角膠囊按鈕"""
    url = "https://api.line.me/v2/bot/message/reply"
    payload = {
        "replyToken": reply_token,
        "messages": [
            {
                "type": "text",
                "text": text,
                "quickReply": {
                    "items": [
                        {"type": "action", "action": {"type": "message", "label": "📦 查詢訂單", "text": "查訂單"}},
                        {"type": "action", "action": {"type": "message", "label": "⏰ 營業時間", "text": "營業時間"}},
                        {"type": "action", "action": {"type": "message", "label": "❓ 常見問題", "text": "常見問題"}},
                        {"type": "action", "action": {"type": "message", "label": "👤 轉接真人", "text": "找真人"}}
                    ]
                }
            }
        ]
    }
    req = urllib.request.Request(
        url,
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json", "Authorization": f"Bearer {LINE_TOKEN}"},
        method="POST"
    )
    try:
        with urllib.request.urlopen(req) as resp:
            return resp.getcode() == 200
    except Exception as e:
        print("Reply Error:", e)
        return False

def push_to_boss(text):
    """推播警報給老闆手機"""
    url = "https://api.line.me/v2/bot/message/push"
    payload = {
        "to": BOSS_USER_ID,
        "messages": [{"type": "text", "text": text}]
    }
    req = urllib.request.Request(
        url,
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json", "Authorization": f"Bearer {LINE_TOKEN}"},
        method="POST"
    )
    try:
        with urllib.request.urlopen(req) as resp:
            return resp.getcode() == 200
    except Exception as e:
        print("Push Error:", e)
        return False

def search_order(keyword):
    """在 orders.csv 搜尋訂單"""
    if not os.path.exists("orders.csv"):
        return "⚠️ 目前訂單資料庫中暫無記錄，請點選「找真人」由店長為您查詢。"
    
    clean_kw = "".join(filter(str.isdigit, keyword)) if any(c.isdigit() for c in keyword) else keyword.strip()
    
    try:
        with open("orders.csv", "r", encoding="utf-8-sig") as f:
            reader = csv.reader(f)
            headers = next(reader, None)
            for row in reader:
                row_str = " ".join(row)
                if clean_kw in "".join(filter(str.isdigit, row_str)) or clean_kw in row_str:
                    name = row[1] if len(row) > 1 else "貴賓"
                    phone = row[2] if len(row) > 2 else ""
                    prod = row[3] if len(row) > 3 else "商品"
                    qty = row[4] if len(row) > 4 else "1"
                    return (
                        f"📦 查到您的訂單進度囉！\n"
                        f"━━━━━━━━━━━━━━━\n"
                        f"👤 訂購大名：{name}\n"
                        f"🛍️ 訂購項目：{prod} x {qty}\n"
                        f"🚚 目前進度：【已出貨，預計明日送達】\n"
                        f"━━━━━━━━━━━━━━━\n"
                        f"如有任何問題，歡迎隨時點選下方「轉接真人」！"
                    )
        return f"⚠️ 抱歉，系統找不到與「{keyword}」相符的訂單。\n請確認號碼是否正確，或點選下方「轉接真人」由專人協助！"
    except Exception as e:
        return "⚠️ 查詢訂單時發生異常，請點選「找真人」由專人協助。"

def ask_gemini(user_query):
    """呼叫 Gemini 3.8 Flash 智慧解答"""
    url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent?key={GEMINI_KEY}"
    system_prompt = (
        "你是國立臺中科技大學國際貿易系（國貿系）的官方 AI 智慧助理「咒語兔」🐰。\n"
        "原則：\n"
        "1. 保持客氣、親切、熱情，一律使用繁體中文，字數精簡適中。\n"
        "2. 官方資訊：系辦位於台中市北區三民路三段129號（三民校區中正大樓），服務時間為週一至週五 08:30 - 17:00，週六日及國定假日公休。\n"
        "3. 若遇到超出範圍或機密問題，請委婉告知並引導點選下方「轉接真人」。"
    )
    payload = {
        "contents": [{"role": "user", "parts": [{"text": user_query}]}],
        "systemInstruction": {"parts": [{"text": system_prompt}]},
        "generationConfig": {"temperature": 0.3, "maxOutputTokens": 400}
    }
    req = urllib.request.Request(
        url,
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST"
    )
    try:
        with urllib.request.urlopen(req) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            return data["candidates"][0]["content"]["parts"][0]["text"]
    except Exception as e:
        print("Gemini Error:", e)
        return "很抱歉，AI 系統暫時連線稍慢，請直接點選下方「轉接真人」由店長為您服務！"

class LineWebhookHandler(http.server.SimpleHTTPRequestHandler):
    def do_GET(self):
        self.send_response(200)
        self.send_header("Content-Type", "text/plain; charset=utf-8")
        self.end_headers()
        self.wfile.write("LINE Bot Webhook Server is running!".encode("utf-8"))

    def do_POST(self):
        content_length = int(self.headers.get("Content-Length", 0))
        post_data = self.rfile.read(content_length)
        
        # 立即回傳 200 OK 給 LINE，防止 LINE 判定超時
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.end_headers()
        self.wfile.write(b'{"status":"ok"}')

        try:
            data = json.loads(post_data.decode("utf-8"))
            events = data.get("events", [])
            for event in events:
                reply_token = event.get("replyToken")
                user_id = event.get("source", {}).get("userId", "")
                event_type = event.get("type")

                # 事件 1：加好友 / 解除封鎖
                if event_type == "follow":
                    welcome = (
                        "🎉 歡迎加入「國立臺中科技大學 國貿系」官方頻道！\n"
                        "我是您的 AI 智慧助理「咒語兔」🐰✨\n\n"
                        "請問今天有什麼我可以協助您的嗎？\n"
                        "您可以直接輸入問題（詢問系所介紹、服務時間、地址或查訂單），或點選下方快捷膠囊按鈕開始體驗！"
                    )
                    reply_line_with_quick_reply(reply_token, welcome)
                    continue

                # 事件 2：文字訊息
                if event_type == "message" and event.get("message", {}).get("type") == "text":
                    user_msg = event.get("message", {}).get("text", "").strip()
                    print(f"📩 收到來自客人 ({user_id[:6]}...) 的訊息: {user_msg}")

                    # 1. 營業時間 / 服務時間
                    if user_msg in ["營業時間", "門市時間", "服務時間"]:
                        hours_text = (
                            "⏰【國立臺中科技大學 國貿系 服務資訊】\n"
                            "週一至週五：08:30 - 17:00 (中午 12:00-13:00 休息)\n"
                            "週六、週日及國定假日公休\n"
                            "📍 地址：台中市北區三民路三段129號 (三民校區中正大樓 國貿系辦)\n"
                            "📞 電話：(04) 2219-6120\n"
                            "線上諮詢與咒語兔 AI 24 小時為您服務！✨"
                        )
                        reply_line_with_quick_reply(reply_token, hours_text)
                        continue

                    # 2. 查訂單提示
                    if user_msg in ["查訂單", "查詢訂單"]:
                        tip = "📦 請直接輸入您的【訂購電話號碼】（例如：0912-345-678），我立刻幫您查詢最新進度！"
                        reply_line_with_quick_reply(reply_token, tip)
                        continue

                    # 3. 輸入電話或「查訂單 09...」
                    if any(c.isdigit() for c in user_msg) and len([c for c in user_msg if c.isdigit()]) >= 8:
                        result = search_order(user_msg)
                        reply_line_with_quick_reply(reply_token, result)
                        continue

                    # 4. 找真人
                    if user_msg in ["找真人", "真人客服", "轉接真人"]:
                        reply_line_with_quick_reply(reply_token, "🛎️ 已為您發送緊急推播給店長！店長稍後將直接在此為您服務，請您稍候片刻！")
                        push_to_boss(
                            f"🚨【店長緊急警報】有客人請求真人客服！\n"
                            f"━━━━━━━━━━━━━━━\n"
                            f"👤 客人 ID: {user_id}\n"
                            f"💬 最後一句話: {user_msg}\n"
                            f"⏰ 呼叫時間: {datetime.now().strftime('%H:%M:%S')}\n"
                            f"請儘速前往 LINE Official Manager 後台回覆！"
                        )
                        continue

                    # 5. 其餘問題交給 Gemini 3.8 Flash
                    print("🤖 呼叫 Gemini 3.8 Flash 解答...")
                    ai_reply = ask_gemini(user_msg)
                    reply_line_with_quick_reply(reply_token, ai_reply)

        except Exception as err:
            print("Processing Error:", err)

def main():
    print(f"🚀 LINE Bot Webhook 伺服器已啟動於：http://localhost:{PORT}")
    socketserver.TCPServer.allow_reuse_address = True
    with socketserver.TCPServer(("", PORT), LineWebhookHandler) as httpd:
        httpd.serve_forever()

if __name__ == "__main__":
    main()
