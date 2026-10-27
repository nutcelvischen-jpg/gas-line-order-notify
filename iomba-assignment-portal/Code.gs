/**
 * ==============================================================================
 * IOMBA Assignment Submission Portal - Backend (Google Apps Script)
 * ==============================================================================
 * Course: International MBA (IOMBA)
 * Purpose: Web App backend to receive and record student project submissions.
 * 
 * Features:
 * 1. Serves responsive, all-English web portal UI.
 *    - Automatic fallback: If "Index.html" file is missing or misnamed,
 *      it automatically falls back to built-in HTML so it never throws
 *      "No HTML file named Index was found".
 * 2. Validates Student ID and Google Doc link format.
 * 3. Auto-initializes Google Sheet with 2-row header structure:
 *    - Row 1: Formal column headers.
 *    - Row 2: Crucial guideline & "Remember to share to anyone with the link" warning.
 * 4. Deduplication / Resubmission support: updates existing record if Student ID matches.
 * ==============================================================================
 */

const SHEET_NAME = "Submissions";

/**
 * Serves the HTML Web App UI.
 * Tries "Index", "index", and falls back to built-in HTML template.
 */
function doGet(e) {
  let output;
  try {
    output = HtmlService.createTemplateFromFile("Index").evaluate();
  } catch (e1) {
    try {
      output = HtmlService.createTemplateFromFile("index").evaluate();
    } catch (e2) {
      // Fallback: Use built-in HTML if the separate Index.html file is not found
      output = HtmlService.createHtmlOutput(getBuiltInHtml());
    }
  }

  return output
    .setTitle("IOMBA Assignment Submission Portal")
    .addMetaTag("viewport", "width=device-width, initial-scale=1.0")
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

/**
 * Returns the target Google Spreadsheet instance.
 * Supports both container-bound scripts (SpreadsheetApp.getActiveSpreadsheet())
 * and standalone scripts configured with SPREADSHEET_ID in Script Properties.
 */
function getSpreadsheet() {
  let ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) {
    const sheetId = PropertiesService.getScriptProperties().getProperty("SPREADSHEET_ID");
    if (sheetId) {
      ss = SpreadsheetApp.openById(sheetId);
    } else {
      throw new Error(
        "Spreadsheet not found! If this is a standalone Apps Script project, " +
        "please set \"SPREADSHEET_ID\" in Project Settings -> Script Properties."
      );
    }
  }
  return ss;
}

/**
 * Initializes the Submissions sheet with 2-row header layout and styling.
 * Row 1: Main column titles.
 * Row 2: Mandatory submission reminders and field requirements.
 */
function initializeSheet(ss) {
  let sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
  }

  // Row 1: Main column headers
  const headers = [
    "Timestamp",
    "Student ID",
    "Student Name",
    "Midterm Google Doc (Master Report)",
    "Live Demo URL (Direct Link)",
    "YouTube Video Link (Bonus)",
    "Project Title",
    "Shared to Anyone?",
    "Status / Notes"
  ];

  // Row 2: Field guidelines & critical sharing permission reminder
  const guidelines = [
    "[NOTICE]",
    "Required (e.g., M11234567)",
    "Full English Name",
    "⚠️ CRITICAL: Must be shared as \"Anyone with the link can view\". Check permissions!",
    "Direct link (also inside Google Doc)",
    "YouTube link (Public or Unlisted)",
    "Brief title of your project",
    "Confirmed by student",
    "Instructor feedback & grading"
  ];

  // Write Row 1 & Row 2
  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  sheet.getRange(2, 1, 1, guidelines.length).setValues([guidelines]);

  // Style Row 1: Deep Navy Blue, White bold text
  const headerRange = sheet.getRange(1, 1, 1, headers.length);
  headerRange
    .setBackground("#1E3A8A")
    .setFontColor("#FFFFFF")
    .setFontWeight("bold")
    .setFontSize(11)
    .setVerticalAlignment("middle")
    .setHorizontalAlignment("center");

  // Style Row 2: Amber Alert / Warning style, italic, dark amber text
  const guideRange = sheet.getRange(2, 1, 1, guidelines.length);
  guideRange
    .setBackground("#FEF3C7")
    .setFontColor("#92400E")
    .setFontStyle("italic")
    .setFontSize(10)
    .setVerticalAlignment("middle")
    .setWrap(true);

  // Freeze top 2 rows
  sheet.setFrozenRows(2);

  // Set column widths for readability
  sheet.setColumnWidth(1, 170); // Timestamp
  sheet.setColumnWidth(2, 130); // Student ID
  sheet.setColumnWidth(3, 160); // Student Name
  sheet.setColumnWidth(4, 380); // Assignment Google Doc Link
  sheet.setColumnWidth(5, 300); // Live Demo URL
  sheet.setColumnWidth(6, 260); // Video Link
  sheet.setColumnWidth(7, 240); // Project Title
  sheet.setColumnWidth(8, 150); // Shared confirmation
  sheet.setColumnWidth(9, 180); // Notes

  // Set Row Heights
  sheet.setRowHeight(1, 36);
  sheet.setRowHeight(2, 44);

  return sheet;
}

/**
 * Processes form submissions from the web client.
 * Handles validation, deduplication (updating existing submissions), and logging.
 *
 * @param {Object} data - Form data submitted from Index.html
 * @returns {Object} JSON response with status and message
 */
function submitAssignment(data) {
  try {
    const studentId = (data.studentId || "").trim();
    const studentName = (data.studentName || "").trim();
    const googleDocUrl = (data.googleDocUrl || "").trim();
    const liveDemoUrl = (data.liveDemoUrl || "").trim();
    const videoUrl = (data.videoUrl || "").trim();
    const projectTitle = (data.projectTitle || "").trim();
    const isSharedConfirmed = data.isSharedConfirmed === true || data.isSharedConfirmed === "true";

    // 1. Server-side validations
    if (!studentId) {
      return { success: false, message: "Student ID is required." };
    }
    if (!studentName) {
      return { success: false, message: "Student Name is required." };
    }
    if (!googleDocUrl) {
      return { success: false, message: "Google Doc assignment link is required." };
    }

    // Validate Google Doc link pattern
    const docUrlPattern = /^https:\/\/(docs\.google\.com\/(document|spreadsheets|presentation)\/|drive\.google\.com\/)/i;
    if (!docUrlPattern.test(googleDocUrl)) {
      return {
        success: false,
        message: "Invalid assignment link! Please provide a valid Google Doc link (https://docs.google.com/document/d/...)"
      };
    }

    if (!isSharedConfirmed) {
      return {
        success: false,
        message: "Please confirm that your Google Doc is shared to \"Anyone with the link can view\"."
      };
    }

    // 2. Access and verify sheet
    const ss = getSpreadsheet();
    let sheet = ss.getSheetByName(SHEET_NAME);
    if (!sheet) {
      sheet = initializeSheet(ss);
    }

    const timestamp = Utilities.formatDate(new Date(), Session.getScriptTimeZone() || "GMT+8", "yyyy-MM-dd HH:mm:ss");
    const lastRow = sheet.getLastRow();

    let targetRow = -1;
    let isUpdate = false;

    // 3. Check for existing submission by Student ID (from Row 3 onwards)
    if (lastRow >= 3) {
      const idRange = sheet.getRange(3, 2, lastRow - 2, 1).getValues();
      for (let i = 0; i < idRange.length; i++) {
        if (String(idRange[i][0]).trim().toUpperCase() === studentId.toUpperCase()) {
          targetRow = i + 3; // Found existing submission row
          isUpdate = true;
          break;
        }
      }
    }

    const rowData = [
      timestamp,
      studentId,
      studentName,
      googleDocUrl,
      liveDemoUrl || "Included in Google Doc",
      videoUrl || "N/A",
      projectTitle || "Untitled Project",
      "YES (Confirmed)",
      isUpdate ? "Updated by student" : "New submission"
    ];

    if (isUpdate && targetRow !== -1) {
      // Update existing record
      sheet.getRange(targetRow, 1, 1, rowData.length).setValues([rowData]);
    } else {
      // Append new record
      sheet.appendRow(rowData);
    }

    return {
      success: true,
      isUpdate: isUpdate,
      message: isUpdate
        ? `Submission updated successfully for Student ID: ${studentId}`
        : `Assignment submitted successfully for Student ID: ${studentId}`,
      details: {
        studentId: studentId,
        studentName: studentName,
        timestamp: timestamp,
        projectTitle: projectTitle
      }
    };
  } catch (error) {
    Logger.log("Error in submitAssignment: " + error.toString());
    return {
      success: false,
      message: "Server error: " + error.message
    };
  }
}

/**
 * Manual setup helper function that can be executed directly from the Apps Script editor.
 * Sets up the sheet headers and format immediately.
 */
function setup() {
  const ss = getSpreadsheet();
  const sheet = initializeSheet(ss);
  SpreadsheetApp.getUi().alert("Success", "The IOMBA Submissions sheet has been initialized with the 2-row header!", SpreadsheetApp.getUi().ButtonSet.OK);
}

/**
 * Built-in fail-safe HTML content.
 * Guarantees the Web App always functions even if Index.html is not created or named incorrectly.
 */
function getBuiltInHtml() {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>IOMBA Assignment Submission Portal</title>
  <!-- Tailwind CSS CDN -->
  <script src="https://cdn.tailwindcss.com"></script>
  <!-- Google Fonts Inter -->
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap" rel="stylesheet">
  <script>
    tailwind.config = {
      theme: {
        extend: {
          fontFamily: {
            sans: ['Inter', 'sans-serif'],
          },
          colors: {
            brand: {
              50: '#eff6ff',
              100: '#dbeafe',
              500: '#3b82f6',
              600: '#2563eb',
              700: '#1d4ed8',
              800: '#1e40af',
              900: '#1e3a8a',
            }
          }
        }
      }
    }
  </script>
  <style>
    body {
      font-family: 'Inter', sans-serif;
    }
    .custom-shadow {
      box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.05), 0 8px 10px -6px rgba(0, 0, 0, 0.03);
    }
  </style>
</head>
<body class="bg-slate-50 text-slate-800 min-h-screen py-8 px-4 sm:px-6 lg:px-8">

  <div class="max-w-3xl mx-auto">
    <!-- Header -->
    <header class="text-center mb-8">
      <div class="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-brand-100 text-brand-800 text-xs font-semibold uppercase tracking-wider mb-3">
        <svg class="w-4 h-4 text-brand-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 14l9-5-7-7-7 7 9 5zm0 0l6.16-3.422a12.083 12.083 0 01.665 6.479A11.952 11.952 0 0012 20.055a11.952 11.952 0 00-6.824-2.998 12.078 12.078 0 01.665-6.479L12 14zm-4 6v-7.5l4-2.222" />
        </svg>
        IOMBA Program &bull; Midterm Assignment & Report
      </div>
      <h1 class="text-3xl sm:text-4xl font-extrabold text-slate-900 tracking-tight">
        Midterm Assignment Submission Portal
      </h1>
      <p class="mt-2 text-slate-600 text-sm sm:text-base">
        Please complete your midterm project requirements and submit your Google Doc portfolio link below.
      </p>
    </header>

    <!-- Assignment Guidelines & Requirements Card -->
    <section class="bg-white rounded-2xl p-6 sm:p-7 border border-slate-200/80 custom-shadow mb-8">
      <div class="flex items-center gap-3 border-b border-slate-100 pb-4 mb-4">
        <div class="w-9 h-9 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center font-bold">
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
        </div>
        <div>
          <h2 class="text-lg font-bold text-slate-900">Midterm Project Brief & Submission Checklist</h2>
          <p class="text-xs text-slate-500">Read carefully before submitting your work</p>
        </div>
      </div>

      <div class="space-y-4 text-sm text-slate-600">
        <p>
          <strong class="text-slate-800">🎯 Midterm Goal:</strong> Build a hands-on digital project utilizing any tool or framework introduced in class (e.g., Interactive Dashboard, Personal Website, Workflow Automation, Google Apps Script Web App, etc.).
        </p>

        <div>
          <strong class="text-slate-800 block mb-2">📄 Your Google Doc (Master Midterm Report) MUST Include:</strong>
          <ul class="space-y-2 pl-2">
            <li class="flex items-start gap-2">
              <span class="text-blue-600 font-bold mt-0.5">1.</span>
              <span><strong class="text-slate-700">Project Overview & Documentation:</strong> Clear written explanation of your project concept, problem solved, tools taught in class used, and interface screenshots.</span>
            </li>
            <li class="flex items-start gap-2">
              <span class="text-blue-600 font-bold mt-0.5">2.</span>
              <span><strong class="text-slate-700">Live Project Demo Link:</strong> Paste your direct, clickable project link (e.g., GitHub Pages, Netlify, Vercel, Google Apps Script Web App, Streamlit).</span>
            </li>
            <li class="flex items-start gap-2">
              <span class="text-amber-600 font-bold mt-0.5">3.</span>
              <span><strong class="text-slate-700">YouTube Video Walkthrough (Bonus Points 🌟):</strong> If you recorded a demo video, simply paste your <strong>YouTube link</strong> (set to Public or Unlisted).</span>
            </li>
          </ul>
        </div>

        <!-- Warning Callout: Share Permission -->
        <div class="bg-amber-50 border-l-4 border-amber-500 p-4 rounded-r-xl">
          <div class="flex items-start gap-3">
            <svg class="w-5 h-5 text-amber-600 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/>
            </svg>
            <div>
              <h4 class="text-sm font-bold text-amber-900">Critical Permission Reminder</h4>
              <p class="text-xs text-amber-800 mt-1 leading-relaxed">
                Ensure your Google Doc sharing permission is explicitly set to 
                <span class="font-bold underline decoration-amber-600">"Anyone with the link can view"</span>.
                If the document is private or inaccessible during grading, evaluation will be delayed or penalized.
              </p>
              <div class="mt-2 text-xs text-amber-700 flex flex-wrap gap-2 items-center">
                <span class="bg-amber-200/60 px-2 py-0.5 rounded text-[11px] font-medium">How to share:</span>
                <span>Open Google Doc ➔ Click <strong>Share</strong> ➔ Change General access to <strong>"Anyone with the link"</strong> ➔ Role: <strong>Viewer</strong></span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- Submission Form -->
    <main class="bg-white rounded-2xl p-6 sm:p-8 border border-slate-200/80 custom-shadow">
      <form id="submissionForm" onsubmit="handleFormSubmit(event)" class="space-y-6">
        
        <!-- Student ID & Name Row -->
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-5">
          <!-- Student ID -->
          <div>
            <label for="studentId" class="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1">
              Student ID <span class="text-rose-500">*</span>
            </label>
            <input 
              type="text" 
              id="studentId" 
              name="studentId" 
              required 
              placeholder="e.g. M11234567" 
              class="w-full px-4 py-2.5 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500 text-sm transition"
            >
            <p class="text-[11px] text-slate-400 mt-1">Your official university Student ID.</p>
          </div>

          <!-- Student Name -->
          <div>
            <label for="studentName" class="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1">
              Full Name <span class="text-rose-500">*</span>
            </label>
            <input 
              type="text" 
              id="studentName" 
              name="studentName" 
              required 
              placeholder="e.g. Alex Morgan" 
              class="w-full px-4 py-2.5 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500 text-sm transition"
            >
            <p class="text-[11px] text-slate-400 mt-1">As registered in the IOMBA system.</p>
          </div>
        </div>

        <!-- Project Title -->
        <div>
          <label for="projectTitle" class="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1">
            Project Title <span class="text-rose-500">*</span>
          </label>
          <input 
            type="text" 
            id="projectTitle" 
            name="projectTitle" 
            required 
            placeholder="e.g. Real-Time Sales Intelligence Dashboard & Portfolio" 
            class="w-full px-4 py-2.5 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500 text-sm transition"
          >
        </div>

        <!-- Google Doc Link -->
        <div>
          <label for="googleDocUrl" class="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1 flex items-center justify-between">
            <span>Midterm Google Doc URL (Master Report) <span class="text-rose-500">*</span></span>
            <span class="text-[11px] text-brand-600 font-medium lowercase">must be docs.google.com</span>
          </label>
          <div class="relative">
            <input 
              type="url" 
              id="googleDocUrl" 
              name="googleDocUrl" 
              required 
              placeholder="https://docs.google.com/document/d/..." 
              oninput="validateDocUrl(this)"
              class="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500 text-sm transition"
            >
            <div class="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
              <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6zM6 20V4h7v5h5v11H6z"/>
              </svg>
            </div>
          </div>
          <div id="docUrlFeedback" class="mt-1 text-xs hidden"></div>
          <p class="text-[11px] text-slate-400 mt-1">Contains your complete project write-up, screenshots, and embedded links.</p>
        </div>

        <!-- Live Demo URL (Recommended for Quick Access) -->
        <div>
          <label for="liveDemoUrl" class="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1 flex items-center justify-between">
            <span>Live Project Demo Link <span class="text-emerald-600 font-semibold">(Recommended for Quick Access)</span></span>
            <span class="text-[11px] text-slate-400 font-normal">Optional on form &bull; must be in Doc</span>
          </label>
          <div class="relative">
            <input 
              type="url" 
              id="liveDemoUrl" 
              name="liveDemoUrl" 
              placeholder="https://your-portfolio.netlify.app or https://script.google.com/..." 
              class="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500 text-sm transition"
            >
            <div class="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
              </svg>
            </div>
          </div>
          <p class="text-[11px] text-slate-400 mt-1">Pasting here allows instructors to test your project directly from the grading spreadsheet.</p>
        </div>

        <!-- YouTube Video Walkthrough URL (Bonus) -->
        <div>
          <label for="videoUrl" class="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1 flex items-center justify-between">
            <span>YouTube Video Link <span class="text-amber-600 font-semibold">(Bonus Points 🌟)</span></span>
            <span class="text-[11px] text-slate-400 font-normal">Optional</span>
          </label>
          <div class="relative">
            <input 
              type="url" 
              id="videoUrl" 
              name="videoUrl" 
              placeholder="https://www.youtube.com/watch?v=... or https://youtu.be/... (Public/Unlisted)" 
              class="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500 text-sm transition"
            >
            <div class="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
            </div>
          </div>
          <p class="text-[11px] text-slate-400 mt-1">Provide an unlisted or public YouTube link so instructors can view your presentation video.</p>
        </div> 
              name="videoUrl" 
              placeholder="https://www.loom.com/share/... or YouTube link" 
              class="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500 text-sm transition"
            >
            <div class="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
            </div>
          </div>
        </div>

        <!-- Mandatory Agreement Checkbox -->
        <div class="pt-2">
          <label class="relative flex items-start gap-3 p-3.5 rounded-xl border border-amber-200 bg-amber-50/60 cursor-pointer hover:bg-amber-50 transition">
            <input 
              type="checkbox" 
              id="isSharedConfirmed" 
              name="isSharedConfirmed" 
              required 
              class="mt-1 h-4 w-4 rounded border-amber-300 text-brand-600 focus:ring-brand-500 cursor-pointer"
            >
            <span class="text-xs text-slate-700 leading-relaxed select-none">
              <strong class="text-slate-900 font-semibold">I solemnly confirm</strong> that my Google Doc sharing permission has been set to 
              <span class="font-bold text-amber-900 underline">"Anyone with the link can view"</span>, 
              and the link provided can be accessed directly without requesting permissions.
            </span>
          </label>
        </div>

        <!-- Submit Button -->
        <div class="pt-2">
          <button 
            type="submit" 
            id="submitBtn" 
            class="w-full py-3.5 px-6 rounded-xl bg-brand-700 hover:bg-brand-800 focus:ring-4 focus:ring-brand-500/20 text-white font-semibold text-sm transition duration-150 flex items-center justify-center gap-2 shadow-lg shadow-brand-700/20 disabled:opacity-60 disabled:cursor-not-allowed"
          >
            <span id="btnText">Submit Assignment</span>
            <svg id="btnSpinner" class="animate-spin -ml-1 mr-2 h-4 w-4 text-white hidden" fill="none" viewBox="0 0 24 24">
              <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
              <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
          </button>
        </div>

        <p class="text-center text-xs text-slate-400">
          💡 Need to update? Resubmitting with the same Student ID will automatically update your previous entry.
        </p>

      </form>

      <!-- Alert Box -->
      <div id="statusAlert" class="mt-6 hidden p-4 rounded-xl text-sm transition-all"></div>
    </main>

    <!-- Footer -->
    <footer class="mt-10 text-center text-xs text-slate-400 space-y-1">
      <p>IOMBA Program &bull; Academic Year Assignment System</p>
      <p>Built with Google Apps Script & Google Sheets</p>
    </footer>
  </div>

  <!-- Client-side Logic -->
  <script>
    function validateDocUrl(input) {
      const value = input.value.trim();
      const feedback = document.getElementById('docUrlFeedback');
      const pattern = /^https:\\/\\/(docs\\.google\\.com\\/(document|spreadsheets|presentation)\\/|drive\\.google\\.com\\/)/i;

      if (!value) {
        feedback.classList.add('hidden');
        input.classList.remove('border-rose-400', 'border-emerald-400');
        return true;
      }

      if (pattern.test(value)) {
        feedback.classList.remove('hidden', 'text-rose-600');
        feedback.classList.add('text-emerald-600');
        feedback.innerHTML = '✓ Valid Google Doc URL format';
        input.classList.remove('border-rose-400');
        input.classList.add('border-emerald-400');
        return true;
      } else {
        feedback.classList.remove('hidden', 'text-emerald-600');
        feedback.classList.add('text-rose-600');
        feedback.innerHTML = '✕ Please provide a valid link starting with https://docs.google.com/document/d/...';
        input.classList.remove('border-emerald-400');
        input.classList.add('border-rose-400');
        return false;
      }
    }

    function handleFormSubmit(e) {
      e.preventDefault();

      const docInput = document.getElementById('googleDocUrl');
      if (!validateDocUrl(docInput)) {
        docInput.focus();
        return;
      }

      const form = document.getElementById('submissionForm');
      const submitBtn = document.getElementById('submitBtn');
      const btnText = document.getElementById('btnText');
      const btnSpinner = document.getElementById('btnSpinner');
      const statusAlert = document.getElementById('statusAlert');

      // Prepare payload
      const formData = {
        studentId: document.getElementById('studentId').value,
        studentName: document.getElementById('studentName').value,
        projectTitle: document.getElementById('projectTitle').value,
        googleDocUrl: document.getElementById('googleDocUrl').value,
        liveDemoUrl: document.getElementById('liveDemoUrl').value,
        videoUrl: document.getElementById('videoUrl').value,
        isSharedConfirmed: document.getElementById('isSharedConfirmed').checked
      };

      // Set Loading UI
      submitBtn.disabled = true;
      btnSpinner.classList.remove('hidden');
      btnText.textContent = 'Submitting your assignment...';
      statusAlert.classList.add('hidden');

      // Call Google Apps Script backend
      if (typeof google !== 'undefined' && google.script && google.script.run) {
        google.script.run
          .withSuccessHandler(function(response) {
            submitBtn.disabled = false;
            btnSpinner.classList.add('hidden');
            btnText.textContent = 'Submit Assignment';

            if (response.success) {
              statusAlert.className = 'mt-6 p-5 rounded-xl text-sm bg-emerald-50 border border-emerald-200 text-emerald-900 block';
              statusAlert.innerHTML = \`
                <div class="flex items-start gap-3">
                  <svg class="w-6 h-6 text-emerald-600 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <div>
                    <h4 class="font-bold text-emerald-950 text-base mb-1">
                      \${response.isUpdate ? 'Submission Updated!' : 'Submission Successful!'}
                    </h4>
                    <p class="text-xs text-emerald-800 leading-relaxed">
                      \${response.message}
                    </p>
                    <div class="mt-3 p-3 bg-white/80 rounded-lg border border-emerald-100 text-xs space-y-1 font-mono text-slate-700">
                      <div><strong class="font-sans text-slate-500">Student ID:</strong> \${response.details.studentId}</div>
                      <div><strong class="font-sans text-slate-500">Student Name:</strong> \${response.details.studentName}</div>
                      <div><strong class="font-sans text-slate-500">Timestamp:</strong> \${response.details.timestamp}</div>
                    </div>
                  </div>
                </div>
              \`;
              // Optional: reset form or keep values for reference
            } else {
              showErrorAlert(response.message);
            }
          })
          .withFailureHandler(function(error) {
            submitBtn.disabled = false;
            btnSpinner.classList.add('hidden');
            btnText.textContent = 'Submit Assignment';
            showErrorAlert('Connection error: ' + error.message);
          })
          .submitAssignment(formData);
      } else {
        // Fallback for local browser preview testing
        setTimeout(function() {
          submitBtn.disabled = false;
          btnSpinner.classList.add('hidden');
          btnText.textContent = 'Submit Assignment';
          statusAlert.className = 'mt-6 p-5 rounded-xl text-sm bg-blue-50 border border-blue-200 text-blue-900 block';
          statusAlert.innerHTML = '<strong>Preview Mode:</strong> Form validated successfully! (google.script.run is only active inside Google Apps Script environment).';
        }, 1200);
      }
    }

    function showErrorAlert(msg) {
      const statusAlert = document.getElementById('statusAlert');
      statusAlert.className = 'mt-6 p-4 rounded-xl text-sm bg-rose-50 border border-rose-200 text-rose-800 block';
      statusAlert.innerHTML = \`
        <div class="flex items-center gap-2">
          <svg class="w-5 h-5 text-rose-600 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <span>\${msg}</span>
        </div>
      \`;
    }
  </script>
</body>
</html>
`;
}
