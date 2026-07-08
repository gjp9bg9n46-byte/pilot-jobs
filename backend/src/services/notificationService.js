const admin = require('../config/firebase');
const logger = require('../config/logger');

// Two token families reach this service:
//   - Expo push tokens ("ExponentPushToken[…]") from the mobile app — must be
//     sent through Expo's push API (firebase-admin cannot deliver to them).
//   - FCM tokens from the web app — sent through firebase-admin as before.
function isExpoToken(token) {
  return typeof token === 'string' && token.startsWith('ExponentPushToken');
}

async function sendExpoPush(token, title, body, data = {}) {
  const res = await fetch('https://exp.host/--/api/v2/push/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({
      to: token,
      title,
      body,
      sound: 'default',
      priority: 'high',
      channelId: 'job_alerts',
      data,
    }),
  });
  const json = await res.json().catch(() => null);
  const status = json?.data?.status ?? json?.data?.[0]?.status;
  if (!res.ok || status === 'error') {
    throw new Error(json?.data?.message || json?.data?.[0]?.message || `Expo push HTTP ${res.status}`);
  }
  return json;
}

async function sendJobAlert(fcmToken, job, matchScore, alert = null) {
  const title = `New Job Match — ${Math.round(matchScore)}% fit`;
  const body = `${job.title} at ${job.company} (${job.location || job.country || ''})`;
  const data = {
    type: 'MATCH_ALERT',
    jobId: job.id,
    matchScore: String(matchScore),
    // Full alert object serialised so the mobile client can prepend without a refetch.
    alert: alert ? JSON.stringify(alert) : '',
  };

  try {
    if (isExpoToken(fcmToken)) {
      const response = await sendExpoPush(fcmToken, title, body, data);
      logger.info(`Expo push sent for job ${job.id}`);
      return response;
    }

    const message = {
      token: fcmToken,
      notification: { title, body },
      data,
      apns: { payload: { aps: { sound: 'default', badge: 1 } } },
      android: { priority: 'high', notification: { sound: 'default', channelId: 'job_alerts' } },
    };
    const response = await admin.messaging().send(message);
    logger.info(`Push sent: ${response}`);
    return response;
  } catch (err) {
    logger.error(`Push failed for token ${fcmToken.slice(0, 10)}...: ${err.message}`);
    throw err;
  }
}

async function sendBulk(tokens, title, body, data = {}) {
  if (!tokens.length) return;
  const expoTokens = tokens.filter(isExpoToken);
  const fcmTokens = tokens.filter((t) => !isExpoToken(t));

  let sent = 0;
  let failed = 0;

  // Expo tokens — batched (Expo accepts arrays of up to 100 messages).
  for (let i = 0; i < expoTokens.length; i += 100) {
    const chunk = expoTokens.slice(i, i + 100);
    try {
      await fetch('https://exp.host/--/api/v2/push/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(chunk.map((to) => ({ to, title, body, sound: 'default', data }))),
      });
      sent += chunk.length;
    } catch (err) {
      failed += chunk.length;
      logger.error(`Expo bulk push failed: ${err.message}`);
    }
  }

  if (fcmTokens.length > 0) {
    const message = {
      tokens: fcmTokens,
      notification: { title, body },
      data,
      android: { priority: 'high' },
    };
    const response = await admin.messaging().sendEachForMulticast(message);
    sent += response.successCount;
    failed += response.failureCount;
  }

  logger.info(`Bulk push: ${sent} sent, ${failed} failed`);
  return { successCount: sent, failureCount: failed };
}

module.exports = { sendJobAlert, sendBulk, isExpoToken };
