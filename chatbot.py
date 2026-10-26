#!/usr/bin/env python3
"""
簡易終端機 Python 聊天機器人 (Gemini 3.8 Flash)
無需安裝額外套件，直接使用 Python 內建 urllib 即可執行！
"""

import sys
import json
import urllib.request
import urllib.error

import os

# 設定您的 API Key 與模型（亦可由環境變數 GEMINI_API_KEY 讀取）
API_KEY = os.environ.get("GEMINI_API_KEY", "YOUR_GEMINI_API_KEY")
MODEL_NAME = "gemini-3.8-flash"
API_URL = f"https://generativelanguage.googleapis.com/v1beta/models/{MODEL_NAME}:generateContent?key={API_KEY}"

# ANSI 終端機顏色
CYAN = "\033[96m"
GREEN = "\033[92m"
YELLOW = "\033[93m"
RED = "\033[91m"
BOLD = "\033[1m"
RESET = "\033[0m"

def call_gemini(history, user_input):
    """組裝歷史對話並發送請求給 Gemini API"""
    contents = history + [{"role": "user", "parts": [{"text": user_input}]}]

    payload = {
        "contents": contents,
        "systemInstruction": {
            "parts": [{"text": "你是一個親切、智慧、專業的 AI 助理。請以繁體中文回答使用者的問題。"}]
        },
        "generationConfig": {
            "temperature": 0.4,
            "maxOutputTokens": 1000
        }
    }

    req = urllib.request.Request(
        API_URL,
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST"
    )

    try:
        with urllib.request.urlopen(req) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            candidate = data.get("candidates", [{}])[0]
            parts = candidate.get("content", {}).get("parts", [])
            if parts and "text" in parts[0]:
                return parts[0]["text"]
            return "（無法取得回覆內容）"
    except urllib.error.HTTPError as e:
        err_msg = e.read().decode("utf-8")
        return f"{RED}API 錯誤 (HTTP {e.code}): {err_msg}{RESET}"
    except Exception as e:
        return f"{RED}連線異常: {str(e)}{RESET}"

def main():
    print(f"{BOLD}{CYAN}=========================================={RESET}")
    print(f"{BOLD}{GREEN}  🤖 Gemini 3.8 Flash 終端機對話機器人{RESET}")
    print(f"{BOLD}{CYAN}=========================================={RESET}")
    print(f"輸入 {YELLOW}exit{RESET} 或 {YELLOW}quit{RESET} 即可結束對話。\n")

    history = []

    while True:
        try:
            user_input = input(f"{BOLD}{GREEN}你: {RESET}").strip()
            if not user_input:
                continue
            if user_input.lower() in ["exit", "quit", "q"]:
                print(f"{CYAN}👋 再見！期待下次與您對話。{RESET}")
                break

            print(f"{YELLOW}AI 正在思考中...{RESET}", end="\r")
            reply = call_gemini(history, user_input)
            
            # 清除「思考中」文字並輸出回覆
            print(" " * 25, end="\r")
            print(f"{BOLD}{CYAN}AI: {RESET}{reply}\n")

            # 記錄歷史上下文（保留最近 5 輪問答）
            history.append({"role": "user", "parts": [{"text": user_input}]})
            history.append({"role": "model", "parts": [{"text": reply}]})
            if len(history) > 10:
                history = history[-10:]

        except KeyboardInterrupt:
            print(f"\n{CYAN}程式已手動中斷。再見！{RESET}")
            break

if __name__ == "__main__":
    main()
