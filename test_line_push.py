#!/usr/bin/env python3
"""
LINE Push Notification Diagnostic Script
用來快速檢測 LINE Channel Access Token 與 User ID 是否正確
"""

import sys
import json
import urllib.request
import urllib.error

import os

# 預設憑證（執行時亦可透過環境變數或命令列參數傳入）
DEFAULT_TOKEN = os.environ.get("LINE_TOKEN", "YOUR_LINE_CHANNEL_ACCESS_TOKEN")
DEFAULT_USER_ID = os.environ.get("MY_USER_ID", "YOUR_LINE_USER_ID")

def test_push(token, user_id):
    url = "https://api.line.me/v2/bot/message/push"
    payload = {
        "to": user_id,
        "messages": [
            {
                "type": "text",
                "text": "🎉 恭喜！LINE 訂單通知連線測試成功！\n━━━━━━━━━━━━━\n這代表你的 Token 與 User ID 完全正確無誤！"
            }
        ]
    }

    req = urllib.request.Request(
        url,
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {token}"
        },
        method="POST"
    )

    try:
        with urllib.request.urlopen(req) as resp:
            if resp.getcode() == 200:
                print("✅ 測試成功 (HTTP 200 OK)！推播訊息已順利送達您的手機 LINE！")
                return True
    except urllib.error.HTTPError as e:
        print(f"❌ 測試失敗 (HTTP {e.code})：{e.read().decode('utf-8')}")
    except Exception as e:
        print(f"❌ 連線異常：{str(e)}")
    return False

if __name__ == "__main__":
    token = sys.argv[1] if len(sys.argv) > 1 else DEFAULT_TOKEN
    user_id = sys.argv[2] if len(sys.argv) > 2 else DEFAULT_USER_ID
    print(f"📡 正在發送測試推播至 User ID: {user_id[:6]}...{user_id[-4:]}")
    test_push(token, user_id)
