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
 * Purpose: Serves distinct, fresh, trending Gen-Z & Duolingo-style passive-aggressive notification messages in real-time
 */
app.get('/api/reengage', (req, res) => {
  const level = parseInt(req.query.level) || 1;
  const streak = parseInt(req.query.streak) || 0;

  const messages = {
    warmup: [
      {
        title: 'Vordle is crying... 🥺',
        body: `Level ${level} is waiting. I guess 5-letter words aren't as important as your TikTok scroll...`
      },
      {
        title: 'Um, hello? 👀',
        body: `My green owl friend warned me about players like you. Don't make me send him to Level ${level}.`
      },
      {
        title: 'Bestie, be for real. 💅',
        body: `You left me on read. Your brain cells are literally begging you to solve Level ${level}.`
      },
      {
        title: 'Is it me? Am I the problem? 🥀',
        body: `Just 2 minutes of Vordle. No cap, your vocabulary is starting to look a little mid.`
      }
    ],
    daily: streak > 0 ? [
      {
        title: 'Your streak is packin\' its bags. 🧳',
        body: `It is literally about to break. Solve Level ${level} to keep your ${streak}-day streak alive!`
      },
      {
        title: '*Sighs in Spanish* 🦉',
        body: `Your ${streak}-day streak is currently on life support. Only Level ${level} can save it.`
      },
      {
        title: 'Don\'t ghost your streak. 👻',
        body: `A ${streak}-day streak is a terrible thing to waste. Solve Level ${level} before it's gone!`
      },
      {
        title: 'This is getting awkward. 😬',
        body: `That ${streak}-day streak won't protect itself. Level ${level} is ready. Don't flop now.`
      }
    ] : [
      {
        title: 'Your Daily Word Fix is Ready! 🏆',
        body: `Start a new daily winning streak today! Beat Level ${level} and grab free coins.`
      },
      {
        title: 'Spelling muscles resting? 💪',
        body: `Keep your cognitive skills sharp. Level ${level} is calling a Word Genius like you!`
      },
      {
        title: 'Did you forget today\'s puzzle? 🤔',
        body: `A brand new Vordle puzzle awaits. Come claim your daily rewards!`
      }
    ],
    reactivation: [
      {
        title: 'Okay, I see how it is. 💔',
        body: `It's fine. Go play other games. I'll just sit here at Level ${level}... alone... forever.`
      },
      {
        title: 'We need to talk. 💬',
        body: `Did we stutter? Your word game skills are getting rusty. Come back for 50 free coins!`
      },
      {
        title: 'Rent is due. 🏠',
        body: `And by rent, I mean your daily brain exercise. Come crush Level ${level} right now.`
      },
      {
        title: 'Are you ignoring me? 😒',
        body: `Even Duolingo thinks you're being cold. Come prove you're still a spelling champion!`
      }
    ]
  };

  // Grab random messages for each milestone
  const getRandomMessage = (list) => list[Math.floor(Math.random() * list.length)];

  res.status(200).json({
    warmup: getRandomMessage(messages.warmup),
    daily: getRandomMessage(messages.daily),
    reactivation: getRandomMessage(messages.reactivation)
  });
});

// --- Render Free Tier Keep-Awake Engine ---
const SELF_URL = process.env.SELF_URL ? process.env.SELF_URL.trim() : null;
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
