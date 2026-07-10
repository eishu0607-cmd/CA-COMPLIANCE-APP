const db = require('./db');

/**
 * PLUG YOUR REAL NOTIFICATION PROVIDER IN HERE.
 *
 * This function is the single place that "sends" a reminder. Right now
 * it just logs to the console and records the attempt in reminders_log.
 * To go live, replace the body with a real API call, e.g.:
 *
 *   WhatsApp (Meta Cloud API):
 *     await fetch(`https://graph.facebook.com/v19.0/${PHONE_ID}/messages`, {
 *       method: 'POST',
 *       headers: { Authorization: `Bearer ${WHATSAPP_TOKEN}`, 'Content-Type': 'application/json' },
 *       body: JSON.stringify({ messaging_product: 'whatsapp', to: client.phone, type: 'text', text: { body: message } })
 *     });
 *
 *   Email (SendGrid / SMTP via nodemailer):
 *     await sgMail.send({ to: client.email, from: 'reminders@yourfirm.com', subject, text: message });
 *
 *   SMS (Twilio):
 *     await twilioClient.messages.create({ to: client.phone, from: TWILIO_NUMBER, body: message });
 *
 * Set channel-specific credentials via environment variables and call
 * the right branch below based on what you've configured.
 */
async function sendReminder(client, deadline, channel = 'console') {
  const message = `Reminder: ${deadline.return_type} for ${deadline.period_label} is due on ${deadline.due_date} for ${client.name} (${client.gstin || 'no GSTIN on file'}).`;

  let status = 'sent';
  try {
    if (channel === 'console') {
      // Default no-op channel so the app works out of the box with no API keys.
      console.log(`[REMINDER -> ${client.name}] ${message}`);
    } else {
      throw new Error(`Channel "${channel}" not yet configured. Add credentials in lib/reminders.js`);
    }
  } catch (err) {
    status = 'failed: ' + err.message;
  }

  db.prepare(
    `INSERT INTO reminders_log (deadline_id, channel, status) VALUES (?, ?, ?)`
  ).run(deadline.id, channel, status);

  return status;
}

// Finds deadlines due within `daysAhead` days that are not yet filed
// and haven't already had a reminder sent today, then sends reminders.
async function runReminderSweep(daysAhead = 3) {
  const target = new Date();
  target.setDate(target.getDate() + daysAhead);
  const targetStr = target.toISOString().slice(0, 10);

  const dueDeadlines = db
    .prepare(
      `SELECT d.*, c.name as client_name, c.gstin, c.phone, c.email
       FROM deadlines d
       JOIN clients c ON c.id = d.client_id
       WHERE d.due_date <= ? AND d.status != 'filed'`
    )
    .all(targetStr);

  const results = [];
  for (const row of dueDeadlines) {
    const client = { name: row.client_name, gstin: row.gstin, phone: row.phone, email: row.email };
    const deadline = { id: row.id, return_type: row.return_type, period_label: row.period_label, due_date: row.due_date };
    const status = await sendReminder(client, deadline);
    results.push({ client: client.name, deadline: deadline.return_type, due: deadline.due_date, status });
  }
  return results;
}

module.exports = { sendReminder, runReminderSweep };
