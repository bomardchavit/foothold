/** Transactional email: Resend when AUTH_RESEND_KEY is set, otherwise printed to the server console. */
export async function sendEmail(to: string, subject: string, html: string, text: string): Promise<{ sent: boolean }> {
  const key = process.env.AUTH_RESEND_KEY;
  if (!key) { console.log(`\n[email] to=${to}\nsubject=${subject}\n${text}\n`); return { sent: false }; }
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: process.env.EMAIL_FROM || "Foothold <digest@example.com>", to, subject, html, text }),
  });
  if (!res.ok) throw new Error(`Resend error ${res.status}: ${await res.text()}`);
  return { sent: true };
}
