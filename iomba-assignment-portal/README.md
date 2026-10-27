# 🎓 IOMBA Assignment Submission Portal (Google Apps Script)

A full-stack, English-first assignment submission web application built on **Google Apps Script (GAS)** and **Google Sheets** for international MBA (IOMBA) students.

---

## 🌟 Key Features

1. **100% English User Interface**: Professional, clean design styled with Tailwind CSS and Inter typography.
2. **Clear Assignment Guidelines**: Prominently displays course requirements directly on the form:
   - **Project Overview**: Text & screenshots explaining the project.
   - **Public Live Demo**: Links to GitHub Pages, Netlify, Google Apps Script, Vercel, or custom dashboards.
   - **Video Demonstration**: Optional bonus points (Loom, YouTube, Drive).
   - **Critical Sharing Reminder**: Visual instructions reminding students to set Google Doc sharing to **"Anyone with the link can view"**.
3. **Structured 2-Row Google Sheet Backend**:
   - **Row 1**: Main column headers (Navy Blue theme).
   - **Row 2**: Sticky instruction & permission warning banner (Amber Yellow theme).
   - Submissions start on **Row 3** with top 2 rows frozen.
4. **Smart Deduplication & Resubmission**:
   - If a student resubmits with the same **Student ID**, their existing entry is updated rather than creating duplicate rows.
5. **Real-Time Client & Server Validation**:
   - Enforces valid Google Doc URLs (`docs.google.com/document/...`).
   - Requires explicit checkbox acknowledgment of public sharing permissions.

---

## 📁 File Structure

```
iomba-assignment-portal/
├── Code.gs      # Google Apps Script backend logic (doGet, validation, sheet recording)
├── Index.html   # Modern responsive web interface (Tailwind CSS, validation, UX feedback)
└── README.md    # Step-by-step setup and deployment guide
```

---

## 🚀 Quick Setup & Deployment Guide (3 Minutes)

### Step 1: Create a Google Sheet
1. Go to [Google Sheets](https://sheets.new) and create a new blank spreadsheet.
2. Name the spreadsheet (e.g., `IOMBA 2024 - Final Project Submissions`).

### Step 2: Open Apps Script Editor
1. In your Google Sheet top menu, click **Extensions** (擴充功能) ➔ **Apps Script**.
2. Rename the script project to `IOMBA Assignment Portal`.

### Step 3: Add Code Files
1. **`Code.gs`**:
   - Delete any default code in `Code.gs`.
   - Copy all contents from [`iomba-assignment-portal/Code.gs`](file:///Users/chenchunchih/Desktop/LLM-app%20scripts/iomba-assignment-portal/Code.gs) and paste it into `Code.gs`.
2. **`Index.html`**:
   - In the Apps Script left sidebar, click the `+` button next to Files ➔ select **HTML**.
   - Name the file `Index` (do not type `.html`, GAS adds it automatically).
   - Copy all contents from [`iomba-assignment-portal/Index.html`](file:///Users/chenchunchih/Desktop/LLM-app%20scripts/iomba-assignment-portal/Index.html) and paste it into `Index.html`.
3. Click the **Save** icon (diskette icon) or press `Ctrl + S` / `Cmd + S`.

### Step 4: Initialize the 2-Row Sheet Format
1. In the Apps Script editor toolbar, select the function dropdown and choose **`setup`**.
2. Click **Run** (執行).
3. Grant permissions if prompted by Google (click *Review Permissions* ➔ choose your account ➔ *Advanced* ➔ *Go to IOMBA Assignment Portal (unsafe)* ➔ *Allow*).
4. Go back to your Google Sheet: you will see the **"Submissions"** tab initialized with:
   - **Row 1**: Dark Navy header (`Timestamp`, `Student ID`, `Student Name`, `Assignment Link (Google Doc)`, `Live Demo URL`, `Video Link (Bonus)`, `Project Title`, `Shared to Anyone?`, `Status / Notes`).
   - **Row 2**: Highlighted amber guidelines and reminders reminding evaluators and students of the sharing permissions.
   - Top 2 rows frozen.

### Step 5: Deploy as Web App
1. At the top-right corner of Apps Script, click **Deploy** (部署) ➔ **New deployment** (新增部署作業).
2. Click the gear icon ⚙️ next to "Select type" ➔ choose **Web app** (網頁應用程式).
3. Configure the settings:
   - **Description**: `IOMBA Assignment Portal v1.0`
   - **Execute as** (執行身分): **Me (你的帳戶)**
   - **Who has access** (誰可以存取): **Anyone (任何人)** *(Crucial: allows students to submit without login barriers)*
4. Click **Deploy** (部署).
5. Copy the **Web App URL** (網頁應用程式網址) — this is the public submission portal URL to share with your students!

---

## 📊 Google Sheet Layout Preview

| Row | Col A (Timestamp) | Col B (Student ID) | Col C (Student Name) | Col D (Master Google Doc) | Col E (Live Demo URL) | Col F (YouTube Link) | Col G (Project Title) | Col H (Shared?) | Col I (Status) |
| :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| **Row 1** *(Navy)* | Timestamp | Student ID | Student Name | Midterm Google Doc (Master Report) | Live Demo URL (Direct Link) | YouTube Video Link (Bonus) | Project Title | Shared to Anyone? | Status / Notes |
| **Row 2** *(Amber)* | *[NOTICE]* | *Required (e.g. M11234567)* | *Full English Name* | *⚠️ CRITICAL: Must be shared as "Anyone with the link can view". Check permissions!* | *Direct link (also inside Google Doc)* | *YouTube link (Public or Unlisted)* | *Brief title* | *Confirmed by student* | *Instructor grading* |
| **Row 3+** | `2024-10-27 10:15:30` | `M11234567` | `Alex Morgan` | `https://docs.google.com/document/d/...` | `https://portfolio.netlify.app` | `https://youtube.com/watch?v=...` | `AI Customer Support Dashboard` | `YES (Confirmed)` | `New submission` |

---

## 💡 Troubleshooting & FAQ

- **Q: What if a student submits twice or fixes their link?**
  - **A**: The system automatically looks up their Student ID in Column B. If already found, it updates that exact row with the newest timestamp and URLs instead of creating messy duplicates.
- **Q: Can students submit any random link for the assignment?**
  - **A**: The system includes client-side and server-side regex validation ensuring the assignment URL is a legitimate Google Doc (`docs.google.com/document/...`).
- **Q: Can I customize fields or add more columns?**
  - **A**: Yes, simply adjust the arrays in `Code.gs` (`headers` and `guidelines`) and add corresponding inputs in `Index.html`.
