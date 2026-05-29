# Vordle Game Sync & Re-engagement Backend

This Node.js Express server runs on **Render.com** to:
1. Keep itself awake 24/7 (never sleeps on the Free tier!).
2. Securely synchronize user levels, streaks, and coins.
3. Automatically serve dynamic notification marketing copy to the app in real-time.

---

## How to Set Up Environment Variables on Render

To prevent your Free tier server from sleeping, go to your **Render Dashboard** -> Select your **Web Service** -> click **Environment** on the left menu, and add the following variable:

### `SELF_URL` (Keeps the Server Awake 24/7)
* **Key:** `SELF_URL`
* **Value:** Your live Render web service URL (e.g., `https://vordle-backend.onrender.com`)
* **How it helps:** The server will make a tiny network request to itself every 10 minutes. Render sees this network activity and **never puts your Free tier server to sleep**. No more 30-second cold starts!

---

## How to Deploy on Render.com

1. Create a new repository on GitHub and push these files to it.
2. Go to [Render Dashboard](https://dashboard.render.com/) -> **New** -> **Web Service**.
3. Link your new GitHub repository.
4. Set the **Runtime** to `Node` and choose the **Free** tier.
5. Click **Deploy**!

---

## API Endpoints

### 1. Progress Sync
* **POST** `/api/sync`
* **Body:**
```json
{
  "userId": "unique_device_id",
  "currentLevel": 14,
  "streakCount": 5,
  "coins": 450
}
```

### 2. Dynamic Copy Generator
* **GET** `/api/reengage?level=12&streak=4`
* Returns dynamic marketing notification copies in real-time.

### 3. Health & Keep-Alive Check
* **GET** `/health`
* Used internally by the keep-alive script to prevent container sleep.
