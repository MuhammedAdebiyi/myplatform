// Email templates for verification flows.
// myplatform renders the full HTML per request — NotificationHub's
// single-notification API only accepts raw {subject, html} in payload
// (CreateNotificationCommand has no template reference; TemplateId exists
// only on Campaigns). Templates registered in NotificationHub are therefore
// not used for this flow.
//
// Requirements: table-based layout, inline CSS only (Gmail/Outlook strip
// <style> and don't render flexbox/grid), max 480px, white background.

const INK = '#26241F';
const DIM = '#6B675C';
const ACCENT = '#C4707A';
const BORDER = '#E7E4DC';
const CODE_BG = '#F7F5F1';

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function shell(innerRows: string, footerNote: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="color-scheme" content="light">
  <title>myplatform</title>
</head>
<body style="margin:0;padding:0;background-color:#FFFFFF;font-family:-apple-BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#FFFFFF;">
    <tr>
      <td align="center" style="padding:40px 16px;">
        <table role="presentation" width="480" cellpadding="0" cellspacing="0" border="0" style="width:480px;max-width:480px;background-color:#FFFFFF;">
          <tr>
            <td style="padding:0 8px 28px 8px;">
              <span style="font-size:18px;font-weight:700;letter-spacing:-0.3px;color:${INK};font-family:Consolas,'JetBrains Mono','Courier New',monospace;">myplatform</span>
              <span style="display:block;width:40px;height:3px;background-color:${ACCENT};font-size:0;line-height:0;">&nbsp;</span>
            </td>
          </tr>
${innerRows}
          <tr>
            <td style="padding:32px 8px 0 8px;border-top:1px solid ${BORDER};">
              <p style="margin:16px 0 0 0;font-size:12px;line-height:18px;color:${DIM};">${footerNote}</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function textRow(html: string): string {
  return `          <tr>
            <td style="padding:0 8px 16px 8px;font-size:15px;line-height:24px;color:${INK};font-family:-apple-BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
              ${html}
            </td>
          </tr>`;
}

export interface VerificationEmailInput {
  name: string;
  code: string;
  appUrl: string;
}

export function renderVerificationCodeEmail(input: VerificationEmailInput): { subject: string; html: string } {
  const name = escapeHtml(input.name);
  const code = escapeHtml(input.code);
  const appUrl = escapeHtml(input.appUrl);

  const innerRows = [
    textRow(`Hi ${name},`),
    textRow('Use this code to verify your email address. It expires in 15 minutes.'),
    `          <tr>
            <td style="padding:8px 8px 24px 8px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:${CODE_BG};border:1px solid ${BORDER};border-radius:6px;">
                <tr>
                  <td align="center" style="padding:28px 16px;">
                    <span style="display:inline-block;font-size:34px;line-height:42px;font-weight:700;letter-spacing:12px;color:${INK};font-family:Consolas,'JetBrains Mono','Courier New',monospace;padding-left:12px;">${code}</span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>`,
    textRow('If you didn&rsquo;t create a myplatform account, you can safely ignore this email.'),
    textRow(`&mdash; The myplatform team`),
  ].join('\n');

  return {
    subject: 'Your myplatform verification code',
    html: shell(innerRows, `myplatform &middot; you&rsquo;re receiving this because you signed up at ${appUrl}`),
  };
}

export interface AccountActivatedEmailInput {
  name: string;
  appUrl: string;
}

export function renderAccountActivatedEmail(input: AccountActivatedEmailInput): { subject: string; html: string } {
  const name = escapeHtml(input.name);
  const appUrl = escapeHtml(input.appUrl);

  const innerRows = [
    textRow(`Hi ${name},`),
    textRow('Your email address is verified and your account is fully active. You&rsquo;re ready to connect a repository and start deploying.'),
    textRow(`&mdash; The myplatform team`),
  ].join('\n');

  return {
    subject: 'Your myplatform account is verified',
    html: shell(innerRows, `myplatform &middot; you&rsquo;re receiving this because you signed up at ${appUrl}`),
  };
}
