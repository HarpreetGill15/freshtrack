import { connect as tlsConnect, type TLSSocket } from 'node:tls'
import { connect as netConnect, type Socket } from 'node:net'

/**
 * Sends one email through Gmail (smtp.gmail.com, implicit TLS on 465) with a Google "app password".
 * Written with Node built-ins only, so no new package is needed. Used when GMAIL_USER and
 * GMAIL_APP_PASSWORD are set in Vercel; otherwise send-reminder falls back to Resend.
 */
export type MailOptions = {
  user: string
  pass: string
  to: string[]
  subject: string
  html: string
  /** Plain-text copy sent alongside the HTML; corporate spam filters distrust HTML-only mail. */
  text?: string
  /**
   * Display name on the From line. Left empty by default so the email shows as the hgmgr Gmail
   * itself — the store's filter let hgmgr mail through but dropped the same mail labelled
   * "FreshTrack" (a name that doesn't match the address looks like impersonation to it).
   */
  fromName?: string
  /** Tests only: talk to a local plain-text server instead of Gmail. */
  server?: { host: string; port: number; secure: boolean }
}

export const gmailConfigured = () => Boolean(process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD)

export function gmailFromEnv() {
  return {
    user: String(process.env.GMAIL_USER ?? '').trim(),
    // Google shows app passwords as four groups of four letters; spaces don't matter.
    pass: String(process.env.GMAIL_APP_PASSWORD ?? '').replace(/\s+/g, ''),
    fromName: String(process.env.GMAIL_FROM_NAME ?? '').trim(),
  }
}

const b64 = (s: string) => Buffer.from(s, 'utf8').toString('base64')
const encodeHeader = (s: string) => (/^[\x20-\x7e]*$/.test(s) ? s : `=?UTF-8?B?${b64(s)}?=`)
const wrap76 = (s: string) => s.replace(/.{1,76}/g, '$&\r\n')
const cleanAddress = (s: string) => s.replace(/[\r\n<>]/g, '').trim()

function buildMessage(from: string, fromName: string, to: string[], subject: string, html: string, text: string) {
  const domain = from.split('@')[1] || 'gmail.com'
  const id = `<${Date.now().toString(36)}.${Math.random().toString(36).slice(2)}@${domain}>`
  const boundary = `ft-${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`
  return [
    fromName ? `From: ${encodeHeader(fromName)} <${from}>` : `From: ${from}`,
    `To: ${to.join(', ')}`,
    `Subject: ${encodeHeader(subject)}`,
    `Date: ${new Date().toUTCString()}`,
    `Message-ID: ${id}`,
    'MIME-Version: 1.0',
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    '',
    `--${boundary}`,
    'Content-Type: text/plain; charset=UTF-8',
    'Content-Transfer-Encoding: base64',
    '',
    wrap76(b64(text)),
    `--${boundary}`,
    'Content-Type: text/html; charset=UTF-8',
    'Content-Transfer-Encoding: base64',
    '',
    wrap76(b64(html)),
    `--${boundary}--`,
    '',
  ].join('\r\n')
}

/** Rough plain-text version of an HTML email, used when no text copy is given. */
export function htmlToText(html: string) {
  return html
    .replace(/<(style|head)[\s\S]*?<\/\1>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|h1|h2|h3|tr|div|li)>/gi, '\n')
    .replace(/<\/t[dh]>/gi, '  ')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&')
    .replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim()
}

export async function sendGmail(opts: MailOptions): Promise<{ ok: true }> {
  const from = cleanAddress(opts.user)
  const to = opts.to.map(cleanAddress).filter(Boolean)
  if (!from || !opts.pass) throw new Error('GMAIL_USER or GMAIL_APP_PASSWORD is not set in Vercel.')
  if (!to.length) throw new Error('No recipient.')
  const server = opts.server ?? { host: 'smtp.gmail.com', port: 465, secure: true }

  const socket: TLSSocket | Socket = await new Promise((resolve, reject) => {
    const s = server.secure
      ? tlsConnect({ host: server.host, port: server.port, servername: server.host }, () => resolve(s))
      : netConnect({ host: server.host, port: server.port }, () => resolve(s))
    s.once('error', reject)
    s.setTimeout(20000, () => s.destroy(new Error('Email server timed out')))
  })
  socket.setEncoding('utf8')

  // Reads one full SMTP reply (handles multi-line "250-" replies).
  let buffer = ''
  const waiters: ((line: string) => void)[] = []
  const replies: string[] = []
  const pending: string[] = []
  let failed: Error | null = null
  socket.on('data', (chunk: string) => {
    buffer += chunk
    let i
    while ((i = buffer.indexOf('\r\n')) >= 0) {
      const line = buffer.slice(0, i)
      buffer = buffer.slice(i + 2)
      replies.push(line)
      if (/^\d{3} /.test(line) || /^\d{3}$/.test(line)) {
        const full = replies.splice(0).join('\n')
        const w = waiters.shift()
        if (w) w(full)
        else pending.push(full)
      }
    }
  })
  socket.on('error', e => { failed = e })
  const reply = () => new Promise<string>((resolve, reject) => {
    if (failed) return reject(failed)
    if (pending.length) return resolve(pending.shift()!)
    waiters.push(resolve)
    socket.once('close', () => reject(failed ?? new Error('Email server closed the connection')))
  })
  const expect = async (code: number, what: string) => {
    const r = await reply()
    if (!r.startsWith(String(code))) {
      if (/^535/.test(r)) throw new Error('Gmail rejected the login. Check GMAIL_USER, and that GMAIL_APP_PASSWORD is an app password (not the normal Gmail password).')
      throw new Error(`Email failed at ${what}: ${r.split('\n').pop()?.slice(0, 200)}`)
    }
    return r
  }
  const send = (line: string) => socket.write(`${line}\r\n`)

  try {
    await expect(220, 'connect')
    send(`EHLO ${process.env.VERCEL_URL || 'localhost'}`)
    await expect(250, 'hello')
    send(`AUTH PLAIN ${Buffer.from(`\0${from}\0${opts.pass}`, 'utf8').toString('base64')}`)
    await expect(235, 'login')
    send(`MAIL FROM:<${from}>`)
    await expect(250, 'sender')
    for (const r of to) {
      send(`RCPT TO:<${r}>`)
      await expect(250, `recipient ${r}`)
    }
    send('DATA')
    await expect(354, 'data')
    const body = buildMessage(from, opts.fromName ?? '', to, opts.subject, opts.html, opts.text ?? htmlToText(opts.html))
      .split('\r\n').map(l => (l.startsWith('.') ? `.${l}` : l)).join('\r\n') // dot-stuffing
    socket.write(`${body}\r\n.\r\n`)
    await expect(250, 'send')
    send('QUIT')
    return { ok: true }
  } finally {
    socket.end()
  }
}
