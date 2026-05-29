# Vordle Game Sync & Cloud Push Backend

This Node.js Express server runs on **Render.com** to:
1. Keep itself awake 24/7 (never sleeps on the Free tier!).
2. Securely synchronize user levels, streaks, and coins.
3. Automatically sweep for inactive users and send real-time Firebase Cloud Messaging (FCM) push notifications when a user is inactive for 24 hours.

---

## How to Set Up Environment Variables on Render

To make the system work fully, go to your **Render Dashboard** -> Select your **Web Service** -> click **Environment** on the left menu, and add the following two variables:

### 1. `SELF_URL` (Keeps the Server Awake 24/7)
* **Key:** `SELF_URL`
* **Value:** Your live Render web service URL (e.g. `https://vordle-backend.onrender.com`)
* **How it helps:** The server will make a tiny network request to itself every 10 minutes. Render sees this network activity and **never puts your Free tier server to sleep**. No more 30-second cold starts!

### 2. `FIREBASE_CREDENTIALS` (Enables FCM Push Notifications)
To allow your Render server to talk to Google's FCM servers, it needs your Firebase credentials:
1. Go to your [Firebase Console](https://console.firebase.google.com/).
2. Select your project -> click the gear icon (**Project Settings**) -> go to the **Service Accounts** tab.
3. Click **Generate New Private Key** to download a JSON file.
4. Encode this JSON file as a Base64 string. (You can do this easily in your terminal):
   * **Windows (PowerShell):**
     ```powershell
     [Convert]::ToBase64String([System.IO.File]::ReadAllBytes("path/to/firebase-adminsdk.json"))
     ```
   * **Mac / Linux:**
     ```bash
     base64 -i path/to/firebase-adminsdk.json
     ```
5. Copy the generated Base64 string.
6. Add it to Render:
   * **Key:** `FIREBASE_CREDENTIALS`
   * **Value:** *(Paste the Base64 string you copied)*

---

## How to Deploy on Render.com

1. Create a new repository on GitHub and push these files to it.
2. Go to [Render Dashboard](https://dashboard.render.com/) -> **New** -> **Web Service**.
3. Link your new GitHub repository.
4. Set the **Runtime** to `Node` and choose the **Free** tier.
5. Click **Deploy**!

---

## API Endpoints

### 1. Sync & Push Token Registry
* **POST** `/api/sync`
* **Body:**
```json
{
  "userId": "unique_device_id",
  "currentLevel": 14,
  "streakCount": 5,
  "coins": 450,
  "fcmToken": "fcm_push_token_from_device"
}
```

### 2. Health & Keep-Alive Check
* **GET** `/health`
* Used internally by the keep-alive script to prevent container sleep.
