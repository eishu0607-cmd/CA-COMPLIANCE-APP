# CA-COMPLIANCE-APP

A robust web application designed for Chartered Accountants (CAs) and financial firms to efficiently track client deadlines, manage portal authentications, and streamline compliance workflows.

---

## 🚀 Features

- **Firm & User Registration:** Multi-tenant setup matching users to their respective professional firms.
- **Role-Based Access Control:** Secure user permissions built directly into account management.
- **Deadline Tracking:** Dedicated system to monitor critical statutory filings and client tasks.
- **Session Management:** Secure token-based session tracking for active login compliance.

---

## 🛠️ Tech Stack

- **Backend:** Node.js, Express
- **Database:** SQLite via `better-sqlite3`
- **Authentication:** Crypto-based password hashing (Scrypt) with secure salts and tokens
- **Hosting/Deployment:** Render

---

## 📂 Project Structure

```text
├── public/               # Static assets (images, global icons)
├── auth.js               # Database schema initialization and auth controllers
├── db.js                 # Database configuration module
├── server.js             # Main Express application server entrypoint
├── package.json          # Node dependencies and project metadata
├── clients.html          # Client management interface
├── deadlines.html        # Compliance deadlines dashboard
├── deadlines.js          # Deadlines page client logic
├── login.html            # User login panel
├── portal.html           # Main user portal dashboard
├── reminders.js          # Notification and reminder utility scripts
├── signup.html           # Firm registration/setup workflow
└── style.css             # Unified application styling stylesheet
```

---

## 💻 Local Setup Instructions

### 1. Prerequisites
Ensure you have [Node.js](https://nodejs.org) installed on your machine.

### 2. Clone the Repository
```bash
git clone https://github.com
cd CA-COMPLIANCE-APP
```

### 3. Install Dependencies
```bash
npm install
```

### 4. Run the Application
```bash
npm start
```
The server will initialize your SQLite database (`database.db`) automatically and begin listening on your specified port (typically `http://localhost:3000`).

---

## 🌐 Production Deployment (Render)

This application is configured for deployment on **Render**. 

### Deployment Configurations:
- **Environment:** Node
- **Build Command:** `npm install`
- **Start Command:** `node server.js`

⚠️ **Important Note on Persistence:** Because SQLite stores data in a local file (`database.db`), ensure your Render Web Service utilizes a **Persistent Disk** mounted at your root project directory to avoid losing data between server restarts or automatic redeployments.
