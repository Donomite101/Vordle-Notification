const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const http = require('http');
const https = require('https');
const admin = require('firebase-admin');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 10000;

// ─────────────────────────────────────────────────────────────
//  Firebase Admin SDK Init  (robust multi-format parsing)
// ─────────────────────────────────────────────────────────────
let db = null;
let firebaseReady = false;

function parseServiceAccount() {
  let raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!raw) throw new Error('FIREBASE_SERVICE_ACCOUNT_JSON env var is missing');

  // Strip surrounding single or double quotes that some dashboards add
  raw = raw.trim();
  if ((raw.startsWith("'") && raw.endsWith("'")) ||
      (raw.startsWith('"') && raw.endsWith('"'))) {
    raw = raw.slice(1, -1);
  }

  // Render sometimes double-escapes the newlines in private_key → fix them
  // "\\n" (literal backslash-n) should become "\n" (actual newline)
  raw = raw.replace(/\\\\n/g, '\\n');

  return JSON.parse(raw);
}

try {
  const serviceAccount = parseServiceAccount();
  console.log('[Firebase] Parsed service account for:', serviceAccount.client_email);

  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    projectId: process.env.FIREBASE_PROJECT_ID || 'vordle-word-puzzle-game',
  });
  db = admin.firestore();
  firebaseReady = true;
  console.log('[Firebase] ✅ Admin SDK initialized successfully.');
} catch (err) {
  console.error('[Firebase] ❌ Admin SDK init FAILED:', err.message);
  // Print first 200 chars of the raw value for diagnosis (no private key leakage)
  const raw = (process.env.FIREBASE_SERVICE_ACCOUNT_JSON || '').slice(0, 200);
  console.error('[Firebase] Raw env (first 200 chars):', raw);
}

// ─────────────────────────────────────────────────────────────
//  Middleware
// ─────────────────────────────────────────────────────────────
app.use(helmet());
app.use(cors());
app.use(express.json());
app.use(morgan('combined'));

// ─────────────────────────────────────────────────────────────
//  Health Check
// ─────────────────────────────────────────────────────────────
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'ok',
    firebase: firebaseReady,
    timestamp: new Date().toISOString(),
  });
});

// ─────────────────────────────────────────────────────────────
//  POST /api/register-token
//  Called by Flutter on every fresh FCM token. Stores user profile.
// ─────────────────────────────────────────────────────────────
app.post('/api/register-token', async (req, res) => {
  const { userId, fcmToken, level, streak, coins, timezone, platform } = req.body;
  if (!userId || !fcmToken) {
    return res.status(400).json({ error: 'userId and fcmToken required' });
  }

  if (firebaseReady) {
    try {
      await db.collection('users').doc(userId).set({
        userId,
        fcmToken,
        level: level || 1,
        streak: streak || 0,
        coins: coins || 0,
        timezone: timezone || 330, // IST default (330 min)
        platform: platform || 'android',
        registeredAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      }, { merge: true });

      console.log(`[Register] User ${userId} | Level ${level} | Streak ${streak} | TZ ${timezone}`);
      return res.status(200).json({ success: true });
    } catch (err) {
      console.error('[Register] Firestore error:', err.message);
      return res.status(500).json({ error: 'Firestore write failed' });
    }
  }

  return res.status(200).json({ success: true, note: 'firebase_not_ready' });
});

// ─────────────────────────────────────────────────────────────
//  POST /api/sync
//  Progress sync (existing endpoint — now also updates Firestore)
// ─────────────────────────────────────────────────────────────
app.post('/api/sync', async (req, res) => {
  const { userId, currentLevel, streakCount, coins, fcmToken } = req.body;
  if (!userId) return res.status(400).json({ error: 'Missing userId' });

  const data = {
    userId,
    level: currentLevel || 1,
    streak: streakCount || 0,
    coins: coins || 0,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    ...(fcmToken ? { fcmToken } : {}),
  };

  if (firebaseReady) {
    try {
      await db.collection('users').doc(userId).set(data, { merge: true });
    } catch (err) {
      console.error('[Sync] Firestore error:', err.message);
    }
  }

  console.log(`[Sync] ${userId} → Level ${currentLevel}, Streak ${streakCount}, Coins ${coins}`);
  res.status(200).json({ success: true, data });
});

// ─────────────────────────────────────────────────────────────
//  GET /api/reengage
//  Message content endpoint (unchanged — used as fallback)
// ─────────────────────────────────────────────────────────────
app.get('/api/reengage', (req, res) => {
  const level = parseInt(req.query.level) || 1;
  const streak = parseInt(req.query.streak) || 0;

  const messages = {
    warmup: [
      { title: 'Vordle is crying... 🥺', body: `Level ${level} is waiting. Come back and crush it!` },
      { title: 'Um, hello? 👀', body: `You left Level ${level} hanging. Don't make it awkward.` },
      { title: 'Bestie, be for real. 💅', body: `Your brain cells are literally begging you to solve Level ${level}.` },
      { title: 'Is it me? Am I the problem? 🥀', body: 'Just 2 minutes of Vordle. Your vocabulary misses you.' },
    ],
    daily: streak > 0 ? [
      { title: "Your streak is packin' its bags. 🧳", body: `Solve a puzzle to keep your ${streak}-day streak alive!` },
      { title: 'Urgent: Streak in Danger! 🥶', body: `1 puzzle away from losing your ${streak}-day streak. Don't break now!` },
      { title: "Don't break the chain! 🔗", body: `Your ${streak}-day streak is legendary. Level ${level} is ready! 🔥` },
      { title: 'This is getting awkward. 😬', body: `That ${streak}-day streak won't protect itself. Come play Level ${level}.` },
    ] : [
      { title: 'Your Daily Word Fix is Ready! 🏆', body: `Complete Level ${level} and start a new winning streak!` },
      { title: 'Word Champion Challenge! 🌟', body: `Level ${level} is calling. Keep those cognitive skills sharp!` },
      { title: "Did you forget today's puzzle? 🤔", body: 'A brand new Vordle puzzle awaits. Come claim your rewards!' },
    ],
    reactivation: [
      { title: 'Okay, I see how it is. 💔', body: `It's fine. I'll just sit here at Level ${level}... alone... forever.` },
      { title: 'We need to talk. 💬', body: 'Your word game skills are getting rusty. Come back for 50 free coins!' },
      { title: 'Rent is due. 🏠', body: `Your daily brain exercise is overdue. Crush Level ${level} right now.` },
      { title: 'Are you ignoring me? 😒', body: "Even Duolingo thinks you're being cold. Prove you're still a spelling champion!" },
    ],
  };

  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
  res.status(200).json({
    warmup: pick(messages.warmup),
    daily: pick(messages.daily),
    reactivation: pick(messages.reactivation),
  });
});

// ─────────────────────────────────────────────────────────────
//  POST /api/send-notification  (internal — called by scheduler)
//  Sends a single FCM notification to one user. Used by Next.js.
// ─────────────────────────────────────────────────────────────
app.post('/api/send-notification', async (req, res) => {
  // Simple secret check — set SCHEDULER_SECRET in env
  const authHeader = req.headers['x-scheduler-secret'];
  if (authHeader !== process.env.SCHEDULER_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const { userId, title, body, type } = req.body;
  if (!userId || !title || !body) {
    return res.status(400).json({ error: 'userId, title, body required' });
  }

  if (!firebaseReady) return res.status(503).json({ error: 'Firebase not ready' });

  try {
    // Get user token from Firestore
    const userDoc = await db.collection('users').doc(userId).get();
    if (!userDoc.exists) return res.status(404).json({ error: 'User not found' });

    const userData = userDoc.data();
    const fcmToken = userData.fcmToken;
    if (!fcmToken) return res.status(400).json({ error: 'No FCM token for user' });

    // Check daily cap (max 3 notifications per user per day)
    const today = new Date().toISOString().slice(0, 10); // "2025-05-31"
    const capRef = db.collection('notification_log').doc(`${userId}_${today}`);
    const capDoc = await capRef.get();
    const sentToday = capDoc.exists ? (capDoc.data().count || 0) : 0;

    if (sentToday >= 3) {
      console.log(`[FCM] Skipped ${userId} — daily cap reached (${sentToday}/3)`);
      return res.status(200).json({ skipped: true, reason: 'daily_cap', sent: sentToday });
    }

    // Send FCM notification
    const message = {
      token: fcmToken,
      notification: { title, body },
      android: {
        priority: 'high',
        notification: {
          channelId: 'vordle_reengagement',
          color: '#FFD54F',
          sound: 'default',
          priority: 'high',
        },
      },
      apns: {
        payload: { aps: { sound: 'default', badge: 1 } },
      },
      data: {
        type: type || 'reengagement',
        userId,
        click_action: 'FLUTTER_NOTIFICATION_CLICK',
      },
    };

    const result = await admin.messaging().send(message);
    console.log(`[FCM] Sent to ${userId}: "${title}" | msgId: ${result}`);

    // Update daily cap counter
    await capRef.set({
      userId,
      date: today,
      count: admin.firestore.FieldValue.increment(1),
      lastType: type || 'reengagement',
      lastSentAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });

    return res.status(200).json({ success: true, messageId: result, sentToday: sentToday + 1 });
  } catch (err) {
    console.error('[FCM] Send error:', err.message);
    // Handle invalid/expired token
    if (err.code === 'messaging/registration-token-not-registered') {
      // Remove stale token from Firestore
      if (firebaseReady) {
        await db.collection('users').doc(userId).update({ fcmToken: admin.firestore.FieldValue.delete() });
        console.log(`[FCM] Removed stale token for ${userId}`);
      }
      return res.status(410).json({ error: 'Token expired, removed' });
    }
    return res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────
//  GET /api/users-to-notify
//  Returns users who should receive a notification based on
//  their last activity and timezone. Called by Next.js cron.
// ─────────────────────────────────────────────────────────────
app.get('/api/users-to-notify', async (req, res) => {
  const authHeader = req.headers['x-scheduler-secret'];
  if (authHeader !== process.env.SCHEDULER_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  if (!firebaseReady) return res.status(503).json({ error: 'Firebase not ready' });

  try {
    const now = new Date();
    const currentUTCHour = now.getUTCHours();
    const currentUTCMinute = now.getUTCMinutes();
    const today = now.toISOString().slice(0, 10);

    // Fetch all users with valid FCM tokens
    const snapshot = await db.collection('users')
      .where('fcmToken', '!=', null)
      .limit(500)
      .get();

    if (snapshot.empty) return res.status(200).json({ users: [] });

    const eligible = [];

    for (const doc of snapshot.docs) {
      const user = doc.data();
      const userId = user.userId;
      if (!userId || !user.fcmToken) continue;

      // ── Daily cap check ──────────────────────────────────────
      const capRef = db.collection('notification_log').doc(`${userId}_${today}`);
      const capDoc = await capRef.get();
      const sentToday = capDoc.exists ? (capDoc.data().count || 0) : 0;
      if (sentToday >= 3) continue;

      // ── Smart timing based on user activity ──────────────────
      // Read their hour histogram from Firestore sub-collection
      const histSnap = await db.collection('user_activity')
        .doc(userId)
        .collection('hour_histogram')
        .orderBy('count', 'desc')
        .limit(3)
        .get();

      let bestHours = [9, 14, 20]; // fallback: 9 AM, 2 PM, 8 PM
      if (!histSnap.empty) {
        bestHours = histSnap.docs.map(d => d.data().hour);
      }

      // ── Convert user's local preferred hours to UTC ──────────
      const tzOffsetMinutes = user.timezone || 330; // default IST
      const tzOffsetHours = tzOffsetMinutes / 60;

      // Check if current UTC time matches any of this user's preferred hours
      // with ±10 minute window
      let shouldNotify = false;
      let notifyType = 'daily';

      for (let i = 0; i < bestHours.length; i++) {
        const preferredLocalHour = bestHours[i];
        // Convert preferred local hour back to UTC
        const preferredUTCHour = ((preferredLocalHour - tzOffsetHours) + 24) % 24;
        const preferredUTCHourFloor = Math.floor(preferredUTCHour);

        // Match within ±10 minutes
        const withinWindow = (
          currentUTCHour === preferredUTCHourFloor &&
          currentUTCMinute >= 0 && currentUTCMinute <= 10
        );

        if (withinWindow) {
          shouldNotify = true;
          // First slot = warmup, second = daily, third = winback
          notifyType = i === 0 ? 'warmup' : i === 1 ? 'daily' : 'reactivation';
          break;
        }
      }

      if (!shouldNotify) continue;

      // ── Only notify users who haven't been active in 1+ hours ─
      const activityDoc = await db.collection('user_activity').doc(userId).get();
      if (activityDoc.exists) {
        const lastSeen = activityDoc.data().lastSeen?.toDate();
        if (lastSeen) {
          const hoursSinceActive = (now - lastSeen) / (1000 * 60 * 60);
          if (hoursSinceActive < 1) {
            continue; // User was recently active, skip
          }
        }
      }

      eligible.push({
        userId,
        fcmToken: user.fcmToken,
        level: user.level || 1,
        streak: user.streak || 0,
        notifyType,
        sentToday,
      });
    }

    console.log(`[Scheduler] ${eligible.length} users eligible for notification at ${now.toISOString()}`);
    return res.status(200).json({ users: eligible, checkedAt: now.toISOString() });
  } catch (err) {
    console.error('[Scheduler] Error fetching users:', err.message);
    return res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────
//  Render Free Tier Keep-Awake
// ─────────────────────────────────────────────────────────────
const SELF_URL = process.env.SELF_URL ? process.env.SELF_URL.trim() : null;
if (SELF_URL) {
  console.log(`[Keep-Alive] Initializing self-ping: ${SELF_URL}`);
  const pingModule = SELF_URL.startsWith('https://') ? https : http;
  setInterval(() => {
    try {
      const req = pingModule.get(`${SELF_URL}/health`, (res) => {
        console.log(`[Keep-Alive] Ping OK: ${res.statusCode}`);
        res.resume();
      });
      req.on('error', (err) => console.error(`[Keep-Alive] Error: ${err.message}`));
      req.setTimeout(10000, () => { req.destroy(); });
    } catch (err) {
      console.error(`[Keep-Alive] Threw: ${err.message}`);
    }
  }, 4 * 60 * 1000);
}

// ─────────────────────────────────────────────────────────────
//  Global error guards
// ─────────────────────────────────────────────────────────────
process.on('uncaughtException', (err) => console.error('[Server] Uncaught:', err.message));
process.on('unhandledRejection', (r) => console.error('[Server] Unhandled rejection:', r));

app.listen(PORT, () => console.log(`🚀 Vordle Server running on port ${PORT}`));
