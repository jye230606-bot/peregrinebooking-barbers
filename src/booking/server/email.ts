import { fullAddress, tenant, type TenantConfig } from '../../config/tenant.ts'
import type { Booking } from '../types.ts'
import { serviceById } from '../rules.ts'
import { dateLabel, shopDateKey, timeLabel, weekdayName, weekdayOf } from '../time.ts'
import { bookingIcs } from '../ics.ts'

/**
 * Booking emails over Resend: the guest's confirmation (with the manage link
 * and an .ics), an alert to Vance, and notices when a booking is moved or
 * cancelled. All optional — with RESEND_API_KEY unset, each message is logged
 * and the booking stands. A failed send is logged, never surfaced.
 */

export type Message = {
  to: string
  subject: string
  text: string
  html: string
  replyTo?: string
  attachments?: { filename: string; content: string; contentType: string }[]
}

export interface Mailer {
  send(message: Message): Promise<void>
}

export function resendMailer(env: NodeJS.ProcessEnv = process.env, fetcher: typeof fetch = (...a) => fetch(...a)): Mailer | null {
  const apiKey = env.RESEND_API_KEY
  const from = env.BOOKING_FROM_EMAIL
  if (!apiKey || !from) return null
  return {
    async send({ to, subject, text, html, replyTo, attachments }) {
      const res = await fetcher('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from,
          to: [to],
          subject,
          text,
          html,
          ...(replyTo ? { reply_to: replyTo } : {}),
          ...(attachments
            ? {
                attachments: attachments.map((a) => ({
                  filename: a.filename,
                  content: Buffer.from(a.content).toString('base64'),
                  content_type: a.contentType,
                })),
              }
            : {}),
        }),
      })
      if (!res.ok) throw new Error(`Resend returned ${res.status}: ${await res.text()}`)
    },
  }
}

export type BookingEvent = 'created' | 'rescheduled' | 'cancelled-by-guest' | 'cancelled-by-owner'

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')

const money = (cents: number) => `$${(cents / 100).toFixed(cents % 100 ? 2 : 0)}`

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

/** 'Wednesday 21 October' — no year: it's always within weeks. */
function longDay(b: Booking) {
  const key = shopDateKey(new Date(b.startsAt))
  const [, m, d] = key.split('-').map(Number)
  return `${weekdayName(weekdayOf(key))} ${d} ${MONTHS[m - 1]}`
}
/** 'Wed 21 Oct at 10:45', for subject lines. */
const shortWhen = (b: Booking) => `${dateLabel(shopDateKey(new Date(b.startsAt)))} at ${timeLabel(b.startsAt)}`
const span = (b: Booking) => `${timeLabel(b.startsAt)} – ${timeLabel(b.endsAt)}`

// --- the layout ------------------------------------------------------------------
//
// Modelled on the confirmations clients get from Booksy and the like: the shop
// up top, a headline, a card of details, big buttons, the policy, a footer.
// Tables and inline styles, because that's all email clients reliably render;
// the palette is V Barbers' (near-black, white, electric blue) written out,
// since emails can't read the page's tokens.

const C = { ink: '#050505', paper: '#ffffff', page: '#f2f2ef', line: '#e6e6e1', muted: '#6b6b66', blue: '#08C8F0' }
const FONT = `'Inter Tight',Inter,-apple-system,'Segoe UI',Helvetica,Arial,sans-serif`

type Row = { label: string; value: string; href?: string }
type Button = { label: string; href: string; primary?: boolean }
type Layout = {
  preheader: string
  eyebrow: string
  title: string
  intro?: string
  rows: Row[]
  buttons?: Button[]
  note?: string
  shop: TenantConfig
}

function render(l: Layout): string {
  const rows = l.rows
    .map(
      (r, i) => `<tr>
<td style="padding:14px 0;${i ? `border-top:1px solid ${C.line};` : ''}font:13px/1.4 ${FONT};color:${C.muted};width:96px;vertical-align:top">${esc(r.label)}</td>
<td style="padding:14px 0;${i ? `border-top:1px solid ${C.line};` : ''}font:15px/1.45 ${FONT};color:${C.ink};font-weight:500">${
        r.href ? `<a href="${esc(r.href)}" style="color:${C.ink};text-decoration:underline">${esc(r.value)}</a>` : esc(r.value)
      }</td></tr>`,
    )
    .join('')
  const buttons = (l.buttons ?? [])
    .map(
      (b) =>
        `<a href="${esc(b.href)}" style="display:inline-block;margin:0 8px 10px 0;padding:14px 22px;border-radius:999px;font:600 15px/1 ${FONT};text-decoration:none;${
          b.primary ? `background:${C.blue};color:${C.ink}` : `background:${C.paper};color:${C.ink};border:1px solid ${C.ink}`
        }">${esc(b.label)}</a>`,
    )
    .join('')
  const ig = `https://www.instagram.com/${l.shop.instagram}/`
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"></head>
<body style="margin:0;padding:0;background:${C.page}">
<div style="display:none;max-height:0;overflow:hidden;opacity:0">${esc(l.preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.page}"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:${C.paper};border-radius:20px;overflow:hidden">
<tr><td style="background:${C.ink};padding:22px 28px;font:700 18px/1 ${FONT};letter-spacing:0.08em;color:${C.paper}">${esc(l.shop.name.toUpperCase())}</td></tr>
<tr><td style="height:4px;background:${C.blue};font-size:0;line-height:0">&nbsp;</td></tr>
<tr><td style="padding:28px 28px 8px">
<p style="margin:0 0 6px;font:600 12px/1.2 ${FONT};letter-spacing:0.08em;text-transform:uppercase;color:${C.muted}">${esc(l.eyebrow)}</p>
<h1 style="margin:0 0 10px;font:700 26px/1.15 ${FONT};letter-spacing:-0.02em;color:${C.ink}">${esc(l.title)}</h1>
${l.intro ? `<p style="margin:0 0 8px;font:15px/1.55 ${FONT};color:${C.ink}">${esc(l.intro)}</p>` : ''}
</td></tr>
<tr><td style="padding:8px 28px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0">${rows}</table></td></tr>
${buttons ? `<tr><td style="padding:16px 28px 6px">${buttons}</td></tr>` : ''}
${l.note ? `<tr><td style="padding:6px 28px 24px;font:13px/1.5 ${FONT};color:${C.muted}">${esc(l.note)}</td></tr>` : '<tr><td style="height:18px"></td></tr>'}
<tr><td style="padding:20px 28px;border-top:1px solid ${C.line};font:12px/1.6 ${FONT};color:${C.muted}">
${esc(l.shop.name)} · ${esc(fullAddress(l.shop))}<br><a href="${ig}" style="color:${C.muted}">@${esc(l.shop.instagram)}</a> on Instagram<br>Powered by <a href="https://www.peregrinepartners.space" style="color:${C.muted}">PeregrineOffice</a>
</td></tr>
</table></td></tr></table></body></html>`
}

/** The same message without HTML, for clients that show plain text. */
function plain(l: Layout): string {
  return [
    l.title,
    ...(l.intro ? [l.intro] : []),
    l.rows.map((r) => `${r.label}: ${r.value}`).join('\n'),
    ...(l.buttons ?? []).map((b) => `${b.label}: ${b.href}`),
    ...(l.note ? [l.note] : []),
    `${l.shop.name} · ${fullAddress(l.shop)} · @${l.shop.instagram} on Instagram`,
  ].join('\n\n')
}

const message = (to: string, subject: string, l: Layout, extra: Partial<Message> = {}): Message => ({
  to,
  subject,
  text: plain(l),
  html: render(l),
  ...extra,
})

/** The messages an event sends. Pure, so tests can read them. */
export function messagesFor(
  event: BookingEvent,
  b: Booking,
  opts: { manageUrl?: string; ownerEmail?: string; now?: Date; cfg?: TenantConfig; siteUrl?: string },
): Message[] {
  const cfg = opts.cfg ?? tenant
  const service = serviceById(b.serviceId, cfg)?.name ?? 'Appointment'
  const out: Message[] = []
  const guestTo = b.customer.email
  const ownerTo = opts.ownerEmail
  const replyTo = ownerTo || undefined
  const site = (opts.siteUrl ?? (opts.manageUrl ? new URL(opts.manageUrl).origin : process.env.SITE_URL ?? '')).replace(/\/$/, '')
  const maps = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(fullAddress(cfg))}`
  const calendar = `https://www.peregrinepartners.space/console/shop/${cfg.slug}?date=${shopDateKey(new Date(b.startsAt))}`
  const ics = { filename: `${cfg.slug.replace(/^v/, 'v-')}-booking.ics`, content: bookingIcs(b, opts.now), contentType: 'text/calendar' }
  const preheader = `${service} with ${cfg.barber}, ${longDay(b)} at ${timeLabel(b.startsAt)}`
  const details: Row[] = [
    { label: 'Service', value: service },
    { label: 'When', value: `${longDay(b)}, ${span(b)}` },
    { label: 'With', value: cfg.barber },
    { label: 'Price', value: money(b.priceCentsSnapshot) },
    { label: 'Where', value: fullAddress(cfg), href: maps },
  ]
  const client: Row[] = [
    { label: 'Client', value: b.customer.name },
    ...(b.customer.phone ? [{ label: 'Mobile', value: b.customer.phone, href: `tel:${b.customer.phone}` }] : []),
    ...(b.customer.email ? [{ label: 'Email', value: b.customer.email, href: `mailto:${b.customer.email}` }] : []),
    { label: 'Service', value: `${service} · ${money(b.priceCentsSnapshot)}` },
    { label: 'When', value: `${longDay(b)}, ${span(b)}` },
    ...(b.notes ? [{ label: 'Notes', value: b.notes }] : []),
  ]
  const first = b.customer.name.split(' ')[0]

  if (event === 'created' || event === 'rescheduled') {
    const moved = event === 'rescheduled'
    if (guestTo) {
      out.push(
        message(
          guestTo,
          `${moved ? 'Moved' : "You're booked"}: ${service}, ${shortWhen(b)}`,
          {
            preheader,
            eyebrow: moved ? 'Booking moved' : 'Booking confirmed',
            title: moved ? `Your new time is set, ${first}.` : `You're booked in, ${first}.`,
            intro: moved ? 'Here are the updated details.' : 'See you soon.',
            rows: [...details, ...(moved ? [] : [{ label: 'Payment', value: cfg.payment.replace(/^Pay (by )?/, '').replace(/\.$/, '') }])],
            buttons: [
              ...(opts.manageUrl ? [{ label: 'Change or cancel', href: opts.manageUrl, primary: true }] : []),
              { label: 'Get directions', href: maps },
            ],
            note: `Need to change it? You can move or cancel online up to ${cfg.rules.guestChangeCutoffHours} hours before. The calendar file attached adds it to your phone.`,
            shop: cfg,
          },
          { replyTo, attachments: [ics] },
        ),
      )
    }
    if (ownerTo) {
      out.push(
        message(ownerTo, `${moved ? 'Moved' : 'New booking'}: ${b.customer.name}, ${service}, ${shortWhen(b)}`, {
          preheader: `${b.customer.name} · ${service} · ${longDay(b)} at ${timeLabel(b.startsAt)}`,
          eyebrow: moved ? 'Booking moved' : 'New booking',
          title: `${b.customer.name} ${moved ? 'moved to' : 'booked'} ${longDay(b)} at ${timeLabel(b.startsAt)}`,
          rows: client,
          buttons: [{ label: 'Open calendar', href: calendar, primary: true }],
          note: b.source === 'web' ? 'Booked online.' : undefined,
          shop: cfg,
        }),
      )
    }
  }

  if (event === 'cancelled-by-guest' || event === 'cancelled-by-owner') {
    if (guestTo) {
      out.push(
        message(
          guestTo,
          `Cancelled: ${service}, ${shortWhen(b)}`,
          {
            preheader: `Your ${service.toLowerCase()} on ${longDay(b)} is cancelled`,
            eyebrow: 'Booking cancelled',
            title: event === 'cancelled-by-guest' ? `You're all cancelled, ${first}.` : `${cfg.barber} has cancelled your booking.`,
            intro:
              event === 'cancelled-by-guest'
                ? 'Your time is free for someone else. Book again whenever suits.'
                : `Sorry about that. Message @${cfg.instagram} on Instagram if you have questions, or pick another time.`,
            rows: details.slice(0, 3),
            buttons: site ? [{ label: 'Book again', href: site, primary: true }] : [],
            shop: cfg,
          },
          { replyTo },
        ),
      )
    }
    if (ownerTo && event === 'cancelled-by-guest') {
      out.push(
        message(ownerTo, `Cancelled: ${b.customer.name}, ${service}, ${shortWhen(b)}`, {
          preheader: `${b.customer.name} cancelled ${longDay(b)} at ${timeLabel(b.startsAt)}`,
          eyebrow: 'Cancelled by client',
          title: `${b.customer.name} cancelled ${longDay(b)} at ${timeLabel(b.startsAt)}`,
          intro: 'That time is open for bookings again.',
          rows: client,
          buttons: [{ label: 'Open calendar', href: calendar, primary: true }],
          shop: cfg,
        }),
      )
    }
  }

  return out
}

/** Send an event's messages. Never throws: the booking has already stood or fallen. */
export async function notify(
  mailer: Mailer | null,
  event: BookingEvent,
  b: Booking,
  opts: { manageUrl?: string; ownerEmail?: string; cfg?: TenantConfig; siteUrl?: string },
): Promise<void> {
  const messages = messagesFor(event, b, opts)
  if (!mailer) {
    // No addresses or names: logs are not the place for a guest's details.
    console.log(`[email off] ${event} for booking ${b.id}: ${messages.length} message(s) not sent (RESEND_API_KEY unset)`)
    return
  }
  for (const m of messages) {
    try {
      await mailer.send(m)
    } catch (e) {
      console.error(`[email] ${event} to ${m.to} failed:`, e instanceof Error ? e.message : e)
    }
  }
}
