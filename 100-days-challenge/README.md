# 🔥 100 Days Challenge — Production Web Application

A complete, production-grade personal self-improvement and habit tracking companion built for the 100-day journey from **29 September 2026** to **6 January 2027**.

Designed and engineered with strict **Firebase Authentication**, persistent **Cloud Firestore** document modeling, hardened **Firestore Security Rules**, Indian Standard Time (**IST / Asia/Kolkata**) calculations, automatic streak tracking, habit-wise analytics, and a responsive mobile-first productivity UI.

---

## ⚡ Quick Start

### 1. Launch the Application
Simply double-click:
```cmd
start.bat
```
Or run directly from terminal:
```bash
npm start
```
The application will launch and be accessible at:
👉 **[http://localhost:5000](http://localhost:5000)**

### 2. Run the Verification & Integration Test Suite
```bash
npm test
```
Executes the full unit and end-to-end integration suite verifying:
- IST date boundary calculations (Day 1: 29 Sep 2026, Day 100: 6 Jan 2027)
- Automatic streak algorithms (Current Streak, Longest Streak, Active Days)
- Real-time Firestore document persistence across page refreshes and browser reopens
- User document isolation and security rules enforcement (`request.auth.uid == uid`)
- Historical integrity preservation when targets are edited, disabled, or deleted

---

## 🏗️ Architecture & Tech Stack

- **Frontend**: Pure modern HTML5 (semantic elements, native dialogs, accessible forms), CSS3 with glassmorphism, responsive CSS grid/flexbox, Inter & JetBrains Mono typography.
- **Authentication**: Firebase Authentication supporting Sign Up (Full Name, Email, Password, Confirmation), Sign In, Forgot Password, Logout, Profile update, and password visibility toggles.
- **Main Persistent Database**: Cloud Firestore with persistent storage, zero data loss across page refresh, browser close, logout, or login from another session.
- **Charts & Data Visualization**: Interactive weekly progress chart with high-DPI canvas rendering, animated gradient bars, and tooltips.
- **Timezone**: Indian Standard Time (`Asia/Kolkata`, UTC+5:30) with UTC-safe date calculations to eliminate timezone drift.
- **Built-in Time Machine (Simulator)**: Allows previewing and simulating challenge dates (e.g. Pre-Challenge, Day 1, Day 15, Day 50, Day 100) for instant evaluation.

---

## 📂 Firestore Database Schema

Data is strictly organized in subcollections scoped by the user's authenticated `uid`:

```
users/{uid}
├── name: string (e.g. "Alex Morgan")
├── email: string (e.g. "alex@example.com")
├── challengeStartDate: "2026-09-29"
├── challengeEndDate: "2027-01-06"
├── createdAt: ISO timestamp
└── updatedAt: ISO timestamp

users/{uid}/targets/{targetId}
├── name: string (e.g. "Solve 2 DSA problems")
├── category: "Career" | "Study" | "Fitness" | "Health" | "Personal"
├── targetValue: string (e.g. "2 problems", "30 mins", "2L")
├── description: string
├── active: boolean (true = appears in daily checklist)
├── createdAt: ISO timestamp
└── updatedAt: ISO timestamp

users/{uid}/days/{dayNumber}  (where dayNumber is 1..100)
├── dayNumber: integer (1 to 100)
├── date: "YYYY-MM-DD"
├── completedTargets: array of targetIds
├── totalTargets: integer (count of active targets)
├── completedCount: integer
├── completionPercentage: integer (0 to 100)
├── status: "completed" | "partial" | "inactive"
└── updatedAt: ISO timestamp
```

---

## 🔒 Firestore Security Rules (`firestore.rules`)

The project includes production-ready, hardened Cloud Firestore Security Rules in [`firestore.rules`](file:///c:/Users/varsha/Desktop/100-days-challenge/firestore.rules):

1. **Default Deny Strategy**: Denies all unauthenticated and arbitrary reads and writes across the database.
2. **Owner Isolation**: Enforces `request.auth != null && request.auth.uid == uid` for every read, write, update, and delete operation on `users/{uid}` and all its subcollections.
3. **Data Integrity & Schema Bounds**:
   - `category` restricted strictly to `Career`, `Study`, `Fitness`, `Health`, `Personal`.
   - `dayNumber` validated to be an integer between 1 and 100 matching the document ID.
   - Field length bounds enforced against resource exhaustion attacks.
   - Immutability enforced on `createdAt`, `dayNumber`, and `date` during updates.

To deploy the security rules to your Google Cloud / Firebase console:
```bash
firebase deploy --only firestore:rules
```

---

## 🚀 Key Feature Highlights

1. **Auth & Profile**:
   - Clean tabbed Sign In / Sign Up with client-side validation and friendly error handling.
   - User display name retrieved from Firestore `users/{uid}` and reflected throughout greeting, headers, and profile.
   - Quick Test button for instant account filling.

2. **Dashboard**:
   - Dynamic greeting: `Welcome back, [Name] 👋`
   - Challenge Day status badge: `Day X / 100` (or pre-challenge countdown).
   - 5 Statistics Cards: 🔥 Current Streak, 🏆 Longest Streak, 📅 Active Days, ✅ Completed Tasks, ❌ Inactive Days.
   - Large Overall Challenge Progress bar (`0%` to `100%`).
   - Interactive 7-Day Weekly Progress chart updating immediately on checkbox toggles.

3. **🎯 My Targets**:
   - Create core habits once with category badges, optional quantifiable metrics, and descriptions.
   - Active/Inactive toggles.
   - Editing and deleting preserves all past historical daily completion logs.
   - Category filtering (Career, Study, Fitness, Health, Personal).

4. **✅ Today's Challenge**:
   - Automatically computes current day using fixed start date: 29 September 2026 in IST.
   - Day navigator allows inspecting past days.
   - **Future days are locked** (`🔒 Future Day Locked`) to prevent recording future dates.
   - Instant Firestore persistence on every checkbox click with animated progress bar (`X / Y completed`, `Z% Complete`).

5. **📅 100 Days Activity**:
   - Complete 100-cell heatmap grid color-coded:
     - 🟢 Completed (All targets done)
     - 🟡 Partial (At least 1 target done)
     - 🔴 Inactive (0 targets)
     - 🔒 Future / Locked
   - Clicking any past or current day opens the Day Detail modal displaying the exact checklist breakdown (`Target 1: ✅`, `Target 2: ❌`) and completion rate.

6. **📈 Habit-wise Progress & Final Report**:
   - Evaluates each habit across all elapsed challenge days to show completion consistency.
   - Day 100 Final Report Screen with trophy badge, total active days, longest streak, and consistency rating.

---

## ⚙️ Connecting to your Firebase Cloud Project

1. Open the application at [http://localhost:5000](http://localhost:5000).
2. Click the **🟢 Cloud Status** button in the header or go to **Profile ➔ Firebase Config**.
3. Paste your Firebase Web App configuration JSON:
```json
{
  "apiKey": "AIzaSy...",
  "authDomain": "your-project.firebaseapp.com",
  "projectId": "your-project",
  "storageBucket": "your-project.appspot.com",
  "messagingSenderId": "123456789",
  "appId": "1:123456789:web:abcdef..."
}
```
4. Click **Save & Connect**. The application will instantly synchronize with your Cloud project while maintaining local offline resilience.
