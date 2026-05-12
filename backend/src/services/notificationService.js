const admin = require('../config/firebase');
const logger = require('../config/logger');

async function sendJobAlert(fcmToken, job, matchScore) {
  const message = {
    token: fcmToken,
    notification: {
      title: `New Job Match — ${Math.round(matchScore)}% fit`,
      body: `${job.title} at ${job.company} (${job.location})`,
    },
    data: {
      jobId: job.id,
      type: 'JOB_MATCH',
      matchScore: String(matchScore),
    },
    apns: {
      payload: { aps: { sound: 'default', badge: 1 } },
    },
    android: {
      priority: 'high',
      notification: { sound: 'default', channelId: 'job_alerts' },
    },
  };

  try {
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
  const message = {
    tokens,
    notification: { title, body },
    data,
    android: { priority: 'high' },
  };
  const response = await admin.messaging().sendEachForMulticast(message);
  logger.info(`Bulk push: ${response.successCount} sent, ${response.failureCount} failed`);
  return response;
}

module.exports = { sendJobAlert, sendBulk };
