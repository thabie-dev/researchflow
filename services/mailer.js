const nodemailer = require('nodemailer');
const config = require('../config');

let transport = null;

function configured() {
  return Boolean(config.smtp.host && config.smtp.user && config.smtp.pass);
}

function getTransport() {
  if (!transport) {
    transport = nodemailer.createTransport({
      host: config.smtp.host,
      port: config.smtp.port,
      secure: config.smtp.port === 465,
      auth: { user: config.smtp.user, pass: config.smtp.pass },
    });
  }
  return transport;
}

const escapeHtml = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// Resolves to { sent: true } or { sent: false, reason }; never throws, so inviting still works if mail fails.
async function sendInvite({ to, inviter, projectTitle, role }) {
  if (!configured()) return { sent: false, reason: 'Email is not set up on the server (add SMTP settings to .env).' };
  const roleText = role === 'reviewer' ? 'reviewer (you can read, comment and give feedback)' : 'co-author (you can write and edit)';
  const link = config.appUrl;
  const text = `${inviter} invited you to the research project "${projectTitle}" on ResearchFlow as a ${roleText}.\n\nSign up or sign in with this email address (${to}) to open it:\n${link}\n`;
  const html = `<p><strong>${escapeHtml(inviter)}</strong> invited you to the research project <strong>${escapeHtml(projectTitle)}</strong> on ResearchFlow as a ${escapeHtml(roleText)}.</p>`
    + `<p>Sign up or sign in with this email address (${escapeHtml(to)}) to open it:</p><p><a href="${escapeHtml(link)}">${escapeHtml(link)}</a></p>`;
  try {
    await getTransport().sendMail({
      from: config.smtp.from || config.smtp.user,
      to,
      subject: `${inviter} invited you to "${projectTitle}" on ResearchFlow`,
      text,
      html,
    });
    return { sent: true };
  } catch (err) {
    console.error('[mailer] invite failed:', err.message);
    return { sent: false, reason: `The email could not be sent (${err.message}).` };
  }
}

module.exports = { sendInvite, configured };
