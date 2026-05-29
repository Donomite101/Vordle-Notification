const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const http = require('http');
const admin = require('firebase-admin');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 10000;

// Enable security headers, CORS, and logging
app.use(helmet());
app.use(cors());
app.use(express.json());
app.use(morgan('combined'));

// --- 1. Firebase Admin SDK Initialization ---
// To send actual push notifications, you will download the service account JSON from Firebase Console,
// encode it as a Base64 string, and save it in your Render environment variables as `FIREBASE_CREDENTIALS`.
const firebaseCredentialsB64 = process.env.FIREBASE_CREDENTIALS;
let fcmEnabled = false;

if (firebaseCredentialsB64) {
  try {
    const serviceAccount = JSON.parse(Buffer.from(firebaseCredentialsB64, 'base64').toString('ascii'));
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount)
    });
    fcmEnabled = true;
    console.log('[Firebase] Admin SDK initialized successfully. FCM notifications are active!');
  } catch (err) {
    console.error('[Firebase] Failed to parse credentials Base64 string:', err.message);
  }
} else {
  console.log('[Firebase] No FIREBASE_CREDENTIALS environment variable found. FCM running in dry-run mode.');
}

// In-memory data store for demonstration
// In production, you would connect this to a cloud database like MongoDB or PostgreSQL (both supported by Render)
const usersDb = {};

// Health check endpoint for Render monitoring
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok', timestamp: new Date() });
});

/**
 * Endpoint: POST /api/sync
 * Purpose: Securely backs up progress AND registers their FCM Push Token
 */
app.post('/api/sync', (req, res) => {
  const { userId, currentLevel, streakCount, coins, fcmToken } = req.body;

  if (!userId) {
    return res.status(400).json({ error: 'Missing required field: userId' });
  }

  // Update user database
  usersDb[userId] = {
    userId,
    currentLevel: currentLevel || 1,
    streakCount: streakCount || 0,
    coins: coins || 0,
    fcmToken: fcmToken || usersDb[userId]?.fcmToken || null,
    lastSync: new Date() // Tracks exactly when the user last played
  };

  console.log(`[Sync] User ${userId} updated -> Level: ${currentLevel}, Streak: ${streakCount}, HasToken: ${!!fcmToken}`);

  res.status(200).json({
    message: 'Progress and push token synced successfully',
    data: usersDb[userId]
  });
});

/**
 * Helper: Sends a high-priority push notification using Firebase Cloud Messaging
 */
async function sendPushNotification(fcmToken, title, body) {
  if (!fcmEnabled) {
    console.log(`[FCM Dry-Run] Would send push -> Token: ${fcmToken.substring(0, 10)}... | Title: "${title}" | Body: "${body}"`);
    return;
  }

  const message = {
    notification: { title, body },
    android: {
      priority: 'high',
      notification: {
        channelId: 'vordle_reengagement', // matches awesome_notifications channel
        color: '#FFD54F',
        sound: 'default'
      }
    },
    apns: {
      payload: {
        aps: {
          alert: { title, body },
          sound: 'default',
          badge: 1
        }
      }
    },
    token: fcmToken
  };

  try {
    const response = await admin.messaging().send(message);
    console.log(`[FCM] Notification sent successfully! MessageID: ${response}`);
  } catch (error) {
    console.error(`[FCM] Error dispatching push to token:`, error.message);
  }
}

/**
 * Background Scheduler: Runs every hour to find inactive players and send re-engagement push notifications
 */
setInterval(async () => {
  console.log('[Scheduler] Running hourly inactivity sweep...');
  const now = new Date();

  for (const userId in usersDb) {
    const user = usersDb[userId];
    if (!user.fcmToken) continue;

    const hoursInactive = (now - user.lastSync) / (1000 * 60 * 60);

    // If user has been inactive for exactly 24 to 25 hours, send a daily reminder
    if (hoursInactive >= 24 && hoursInactive < 25) {
      const level = user.currentLevel;
      const streak = user.streakCount;

      let title = 'Your Daily Puzzle is Ready! 🏆';
      let body = `Start a new daily winning streak! Complete Level ${level} to claim bonus coins!`;

      if (streak > 0) {
        title = 'Streak Alert! 🔥 Don\'t freeze!';
        body = `Your fantastic ${streak}-day streak is about to break! Protect it by solving Level ${level}!`;
      }

      console.log(`[Scheduler] User ${userId} has been inactive for 24 hours. Dispatching push!`);
      await sendPushNotification(user.fcmToken, title, body);
    }
  }
}, 60 * 60 * 1000); // Check once every hour

// --- 2. Render Free Tier Keep-Awake Engine ---
const SELF_URL = process.env.SELF_URL;
if (SELF_URL) {
  console.log(`[Keep-Alive] Initializing self-ping scheduler: ${SELF_URL}`);
  setInterval(() => {
    http.get(`${SELF_URL}/health`, (res) => {
      console.log(`[Keep-Alive] Self-ping successful: ${res.statusCode}`);
    }).on('error', (err) => {
      console.error(`[Keep-Alive] Self-ping failed:`, err.message);
    });
  }, 10 * 60 * 1000); // Pings itself every 10 minutes to prevent container sleep
} else {
  console.log('[Keep-Alive] No SELF_URL configured. Keep-alive self-ping is inactive.');
}

// Start Server
app.listen(PORT, () => {
  console.log(`Vordle Server is active on port ${PORT}`);
});
