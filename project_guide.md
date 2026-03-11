# Unified Digital Marketer - Project Overview & Startup Guide

## 📌 Project Overview
**Unified Digital Marketer** is a social media scheduling application that allows users to create, schedule, and publish content across various platforms automatically. 

The application is built using a modern full-stack JavaScript architecture, split between a React-based frontend and a serverless-friendly Node.js backend. It leverages Supabase for data and media storage, and uses messaging APIs (WhatsApp, Telegram, etc.) for publishing content.

### 🏗️ Architecture & Tech Stack
- **Frontend (`/client`)**: Built with **React** and **Vite**. It handles the user interface for creating posts, managing schedules, and configuring platform settings.
- **Backend (`/server` & `/api`)**: Built with **Node.js** and **Express**. It handles API routing, cron job execution for scheduled posts, file uploads via `multer`, and integrations with social media platforms (WhatsApp, Telegram, and likely Instagram).
- **Database & Storage**: **Supabase** (PostgreSQL) is used to store post metadata and schedule states. Supabase Storage is used for image assets.
- **Deployment Strategy**:
  - **Vercel**: Hosts the frontend static site and serverless API endpoints (configured via `vercel.json`).
  - **Railway**: Hosts a persistent backend instance for WhatsApp via `whatsapp-web.js` (configured via `railway.json`), as WhatsApp requires a continuous background connection which Vercel Serverless functions cannot provide.

---

## 🚀 How to Start the Application Locally

To run this application locally, you will need to start both the frontend development server and the backend express server.

### Prerequisites
- Node.js (v18+ recommended)
- `npm` installed
- A valid `.env` file in the root or `/server` directory containing your Supabase and API credentials. (Refer to `.env.example`).

### Step 1: Start the Backend (Server)
The backend requires environment variables to connect to Supabase and other services.

1. Open a terminal and navigate to the project directory:
   ```bash
   cd d:\projects\Unified-Digital-Marketer
   ```
2. Install the necessary dependencies for the root/server. *(Since `package.json` relies on the root layer for its execution config, run it here. If `node_modules` is already present in `/server`, this step might be optional)*:
   ```bash
   npm install
   ```
3. Run the backend server. It listens on port `3001` by default:
   ```bash
   cd server
   node index.js
   ```

### Step 2: Start the Frontend (Client)
The Vite development server will host the frontend UI.

1. Open a new terminal and navigate to the `client` directory:
   ```bash
   cd d:\projects\Unified-Digital-Marketer\client
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. Start the Vite development server:
   ```bash
   npm run dev
   ```

### Step 3: Access the Application
Usually, Vite starts the development server on `http://localhost:5173`. Open this URL in your browser to access the application UI. The frontend is configured to communicate with your local backend at `http://localhost:3001`.

---

## 🛠️ Complete Guide & Core Workflows

### 1. Creating and Scheduling a Post
- Users upload an image and provide a caption in the frontend.
- The `POST /api/posts` endpoint is hit. The image is uploaded directly to **Supabase Storage**.
- The server creates a database record in Supabase with the status `'Pending'` or `'Processing'` (if immediate).

### 2. Automated Publishing (Cron Jobs)
- The application uses cron jobs (triggered via `/api/cron` on Vercel) to periodically check for scheduled posts.
- The cron job (`server/cron.js`) executes, finding posts whose `scheduled_time` has been reached.
- It leverages the `socialManager` (`server/services/socialManager.js`) to publish the payload sequentially to the connected platforms.

### 3. WhatsApp Integration
- Because WhatsApp requires a persistent device session, scanning a QR code is required.
- You can access the connection page locally via HTTP (`http://localhost:3001/whatsapp-connect`).
- In production, Vercel proxies all `/api/whatsapp/*` requests to the Railway backend instance to maintain the persistent session state.

### 4. Admin and Settings
- The server has endpoints to reset "stuck" processing posts (`/api/admin/reset-stuck`) to keep social media publishing robust.
- Configuration and keys are stored and retrieved using `configService.js` and `telegramService.js`.

### 🚨 Troubleshooting Tips
1. **IPv6 Hanging Issues**: If the backend stalls during network requests, `node:dns` is already configured in `server/index.js` to force IPv4 (`ipv4first`).
2. **Uploading Issues**: If local file saving fails, ensure `server/uploads` exists or check folder permissions. (Note: In production on Vercel, this is bypassed as Vercel has read-only file systems).
3. **Database Unreachable**: Ensure your IP address is whitelisted in Supabase, and your `.env` contains valid `SUPABASE_URL` and `SUPABASE_ANON_KEY`.
