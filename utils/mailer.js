const { Resend } = require("resend");

const resend = new Resend(process.env.RESEND_API_KEY);

async function sendBookingNotification(booking, spaceName) {
  const html = `
    <h2>New Booking Request — Maison S</h2>
    <p><strong>Type:</strong> ${booking.type}</p>
    <p><strong>Space:</strong> ${spaceName}</p>
    <p><strong>Name:</strong> ${booking.name}</p>
    <p><strong>Email:</strong> ${booking.email}</p>
    <p><strong>Phone:</strong> ${booking.phone}</p>
    <p><strong>Guests:</strong> ${booking.guests}</p>
    <p><strong>Date:</strong> ${booking.date}</p>
    ${booking.notes ? `<p><strong>Notes:</strong> ${booking.notes}</p>` : ""}
    <hr>
    <p style="color:#888;font-size:12px;">Log in to the admin dashboard to confirm or decline this request.</p>
  `;

  await resend.emails.send({
    from: "Maison S <onboarding@resend.dev>",
    to: process.env.ADMIN_EMAIL,
    subject: `New Booking Request — ${booking.name} (${booking.date})`,
    html
  });
}

async function sendCustomerMessage(booking, subject, message) {
  const messageHtml = message
    .split("\n")
    .map((line) => `<p style="margin:0 0 14px;">${line}</p>`)
    .join("");

  const html = `
    <div style="background:#f5efe4;padding:40px 20px;font-family:'DM Sans',Arial,sans-serif;">
      <div style="max-width:520px;margin:0 auto;background:#ffffff;border-radius:4px;overflow:hidden;">

        <div style="background:#1d1a16;padding:32px 40px;text-align:center;">
          <div style="font-family:Georgia,serif;font-size:22px;letter-spacing:2px;color:#ffffff;">
            MAISON <span style="color:#d8ad5b;">S</span>
          </div>
          <div style="font-size:10px;letter-spacing:2px;text-transform:uppercase;color:#999;margin-top:4px;">
            A Private Culinary &amp; Creative Atelier
          </div>
        </div>

        <div style="padding:36px 40px;">
          <p style="margin:0 0 20px;color:#1d1a16;">Dear ${booking.name || "Guest"},</p>
          <div style="color:#333;font-size:14px;line-height:1.7;">
            ${messageHtml}
          </div>

          <hr style="border:none;border-top:1px solid #eee;margin:28px 0;">

          <p style="font-size:12px;color:#999;margin:0;">
            Regarding your ${booking.type || "booking"} request for ${booking.date || "your selected date"}.
          </p>
        </div>

        <div style="background:#f5efe4;padding:20px 40px;text-align:center;font-size:11px;color:#8a7f6f;">
          Maison S &middot; hello@maison-s.ng &middot; @maison.sng
        </div>

      </div>
    </div>
  `;

  await resend.emails.send({
    from: "Maison S <onboarding@resend.dev>",
    to: booking.email,
    subject,
    html
  });
}

module.exports = { sendBookingNotification, sendCustomerMessage };