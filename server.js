const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const http = require('http');
const https = require('https');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 10000;

// Enable security headers, CORS, and logging
app.use(helmet());
app.use(cors());
app.use(express.json());
app.use(morgan('combined'));

// In-memory data store for progress syncing
// In production, you can connect this to a free MongoDB or PostgreSQL database
const usersDb = {};

// Health check endpoint for Render monitoring
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok', timestamp: new Date() });
});

/**
 * Endpoint: POST /api/sync
 * Purpose: Securely backs up player progress (currentLevel, streakCount, coins)
 */
app.post('/api/sync', (req, res) => {
  const { userId, currentLevel, streakCount, coins } = req.body;

  if (!userId) {
    return res.status(400).json({ error: 'Missing required field: userId' });
  }

  // Update user database
  usersDb[userId] = {
    userId,
    currentLevel: currentLevel || 1,
    streakCount: streakCount || 0,
    coins: coins || 0,
    lastSync: new Date()
  };

  console.log(`[Sync] User ${userId} backed up -> Level: ${currentLevel}, Streak: ${streakCount}, Coins: ${coins}`);

  res.status(200).json({
    message: 'Progress synced successfully',
    data: usersDb[userId]
  });
});

/**
 * Endpoint: GET /api/reengage
 * Purpose: Serves fresh, trending notification messages to the app in real-time
 */
app.get('/api/reengage', (req, res) => {
  const level = parseInt(req.query.level) || 1;
  const streak = parseInt(req.query.streak) || 0;

  const messages = {
    warmup: [
      {
        title: 'Quick Brain Warm-Up! 🧠',
        body: `Ready to test your vocabulary? Level ${level} has some tricky words waiting today!`
      },
      {
        title: 'Vordle Riddle of the Day 🔍',
        body: `Word masters are currently tackling Level ${level}. Can you solve it in under 60 seconds?`
      }
    ],
    streakAlert: [
      {
        title: 'Don\'t let your streak freeze! 🥶',
        body: `Your fantastic ${streak}-day streak is about to expire! Keep your fire burning at Level ${level}! 🔥`
      },
      {
        title: 'Urgent Streak Alert! 🔥',
        body: `You are just 1 puzzle away from losing your ${streak}-day winning streak! Save it now!`
      }
    ],
    standard: [
      {
        title: 'Your Daily Puzzle is Ready! 🏆',
        body: `Start a brand new winning streak today! Beat Level ${level} and grab free coins.`
      },
      {
        title: 'Spelling muscles resting? 💪',
        body: `Keep your cognitive skills sharp. Level ${level} is calling a Word Genius like you!`
      }
    ]
  };

  // Choose the best category based on user's streak
  let selectedCategory = messages.standard;
  if (streak > 0) {
    selectedCategory = messages.streakAlert;
  } else if (Math.random() > 0.5) {
    selectedCategory = messages.warmup;
  }

  // Grab a random message from the category
  const randomIndex = Math.floor(Math.random() * selectedCategory.length);
  const selectedMessage = selectedCategory[randomIndex];

  res.status(200).json(selectedMessage);
});

// --- Render Free Tier Keep-Awake Engine ---
const SELF_URL = process.env.SELF_URL;
if (SELF_URL) {
  console.log(`[Keep-Alive] Initializing self-ping scheduler: ${SELF_URL}`);
  const pingClient = SELF_URL.startsWith('https') ? https : http;
  setInterval(() => {
    pingClient.get(`${SELF_URL}/health`, (res) => {
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
