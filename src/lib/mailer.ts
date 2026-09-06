import nodemailer from "nodemailer";

// Hex equivalents of the app's oklch() palette (src/app/login/page.tsx etc.) —
// email clients don't support oklch(), so these are pinned conversions, not
// independently chosen colors. Keep them in sync if the app palette changes.
const ACCENT = "#e96e50";
const BORDER = "#e1ddda";
const MUTED = "#68625e";
const BG = "#fcf9f7";
const INK = "#2b2724";

export type EmailContent = {
  heading: string;
  paragraphs: string[];
  cta?: { label: string; url: string };
  footer?: string;
};

function escapeHtml(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function buildHtml({ heading, paragraphs, cta, footer }: EmailContent) {
  const paragraphsHtml = paragraphs
    .map((p) => `<p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:${INK};">${escapeHtml(p)}</p>`)
    .join("");
  const ctaHtml = cta
    ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:8px 0 20px;">
        <tr><td style="border-radius:8px;background:${ACCENT};">
          <a href="${cta.url}" style="display:inline-block;padding:12px 24px;font-size:15px;font-weight:700;color:#ffffff;text-decoration:none;border-radius:8px;">${escapeHtml(cta.label)}</a>
        </td></tr>
      </table>
      <p style="margin:0 0 24px;font-size:12.5px;line-height:1.5;color:${MUTED};word-break:break-all;">Or copy this link: <a href="${cta.url}" style="color:${ACCENT};">${cta.url}</a></p>`
    : "";
  const footerHtml = footer ? `<p style="margin:0;font-size:13px;line-height:1.5;color:${MUTED};">${escapeHtml(footer)}</p>` : "";

  return `<!doctype html>
<html>
  <body style="margin:0;padding:32px 16px;background:${BG};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="max-width:480px;margin:0 auto;background:#ffffff;border:1px solid ${BORDER};border-radius:16px;">
      <tr><td style="padding:32px;">
        <div style="font-size:20px;font-weight:800;letter-spacing:-0.02em;color:${INK};margin-bottom:24px;">Rally</div>
        <h1 style="margin:0 0 16px;font-size:19px;font-weight:700;color:${INK};">${escapeHtml(heading)}</h1>
        ${paragraphsHtml}
        ${ctaHtml}
        ${footerHtml}
      </td></tr>
    </table>
  </body>
</html>`;
}

function buildText({ heading, paragraphs, cta, footer }: EmailContent) {
  return [heading, "", ...paragraphs, cta ? `${cta.label}: ${cta.url}` : "", footer ?? ""].filter(Boolean).join("\n\n");
}

export function buildEmail(content: EmailContent) {
  return { html: buildHtml(content), text: buildText(content) };
}

export async function sendMail(to: string, subject: string, content: EmailContent) {
  const transport = nodemailer.createTransport(process.env.EMAIL_SERVER);
  const { html, text } = buildEmail(content);
  await transport.sendMail({ to, from: process.env.EMAIL_FROM, subject, text, html });
}
