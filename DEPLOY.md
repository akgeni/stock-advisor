# 🚀 How to Deploy Stockify

The easiest way to deploy this application for free is using **Render.com**.

## Prerequisites
1. A [GitHub](https://github.com) account.
2. A [Render](https://render.com) account (you can sign up with GitHub).

## Step 1: Push Code to GitHub

1. Initialize a git repository if you haven't:
   ```bash
   git init
   git add .
   git commit -m "Initial commit"
   ```
2. Create a new repository on GitHub.
3. Push your code:
   ```bash
   git remote add origin https://github.com/YOUR_USERNAME/stock-advisor.git
   git branch -M main
   git push -u origin main
   ```

## Step 2: Deploy on Render

1. Dashboard: Go to your [Render Dashboard](https://dashboard.render.com/).
2. New Web Service: Click **"New +"** -> **"Web Service"**.
3. Connect GitHub: Select "Build and deploy from a Git repository" and stick to your `stock-advisor` repo.
4. Configure:
   - **Name**: `stock-advisor-app` (or similar)
   - **Region**: Singapore (or nearest to you)
   - **Branch**: `main`
   - **Root Directory**: `.` (leave blank)
   - **Runtime**: `Node`
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
   - **Plan**: Free

5. **Deploy**: Click "Create Web Service".

## ⚠️ Important Note on Persistence
On free cloud platforms (Render/Heroku/Vercel), the filesystem is **ephemeral**. 
This means:
- **Watchlist Uploads**: If you upload a new CSV, it will be lost when the app restarts (which happens automatically every day).
- **History**: Recommendations history might be reset.

To fix this for production:
1. Use a database service (like MongoDB Atlas or Render Postgres).
2. Or use a paid plan with persistent disk.
