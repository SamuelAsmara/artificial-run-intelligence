# Email — Resend + Supabase Auth

Runi does not send any email itself. Supabase Auth sends the emails
(confirm signup, magic link, password reset, invite); this folder only
documents how the default sender is swapped for Resend and how the
default plain-text template is replaced by the branded one in `templates/`.

## 1. Resend account and API key

1. Sign up at https://resend.com.
2. **Domains → Add Domain** with a domain you control, and add the DNS
   records Resend shows (SPF, DKIM, sometimes DMARC). A Vercel
   `*.vercel.app` address cannot be verified. Without a verified domain,
   Resend's shared sender `onboarding@resend.dev` works for testing —
   but it only delivers to the address the Resend account was opened with.
3. **API Keys → Create API Key**, permission *Sending access*. The key is
   shown once.

## 2. Supabase SMTP settings

Supabase Auth sends over SMTP, and Resend exposes an SMTP endpoint that
takes the API key as the password.

Supabase dashboard → **Authentication → Emails → SMTP Settings**:

| Field | Value |
|---|---|
| Enable custom SMTP | on |
| Sender email | an address on the verified domain, or `onboarding@resend.dev` for testing |
| Sender name | `Runi` |
| Host | `smtp.resend.com` |
| Port | `465` (SSL) — `587` (STARTTLS) also works |
| Username | `resend` |
| Password | the Resend API key |

Two more settings on the same dashboard have to match the deployment, or
the links inside the emails land on the wrong page:

- **Authentication → URL Configuration → Site URL**: the production URL
  (`https://runi-coach.vercel.app`).
- **Redirect URLs**: `https://runi-coach.vercel.app/**` and
  `http://localhost:3000/**`. The app passes `/auth/callback` (signup) and
  `/auth/reset` (password reset) as redirect targets; a target that is not
  on this list is silently replaced by the Site URL.

## 3. Branded template

**Authentication → Emails → Templates → Confirm sign up**: paste the
contents of `templates/confirm-signup.html` into the message body and
set a plain subject line (for example `Confirm your Runi account`). The
`{{ .ConfirmationURL }}` placeholder is Supabase's own template syntax and
is filled in automatically.

The other templates (Magic Link, Reset Password, Invite, Change Email)
still use Supabase's default text; the same shell can be reused with the
placeholder each template expects (`{{ .Token }}`, `{{ .ConfirmationURL }}`).

## 4. Verifying

Sign up with a fresh address on `/signup` and confirm that the email that
arrives is the branded one and that its button completes the signup. Then
request a password reset from `/login` and confirm the link opens
`/auth/reset`.

## Files

- `templates/confirm-signup.html` — the branded confirmation email, table
  based so it renders the same in Outlook, Gmail and Apple Mail.
