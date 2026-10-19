import { fullAddress, tenant } from '../../config/tenant.ts'
import type { Booking } from '../types.ts'
import { serviceById } from '../rules.ts'
import { longDateLabel, shopDateKey, timeLabel } from '../time.ts'
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
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

const money = (cents: number) => `$${(cents / 100).toFixed(cents % 100 ? 2 : 0)}`

function when(b: Booking) {
  return `${longDateLabel(shopDateKey(new Date(b.startsAt)))}, ${timeLabel(b.startsAt)}–${timeLabel(b.endsAt)}`
}

// Email clients can't read the page's tokens, so the palette is written out
// here: near-black on white, and the blue for the one button.
function html(lines: string[], link?: { href: string; label: string }) {
  const [first, ...rest] = lines
  const head = `<p style="margin:0 0 16px;font-size:22px;font-weight:600;letter-spacing:-0.02em">${esc(first)}</p>`
  const body = rest.map((l) => `<p style="margin:0 0 12px">${esc(l)}</p>`).join('')
  const button = link
    ? `<p style="margin:24px 0 8px"><a href="${esc(link.href)}" style="display:inline-block;padding:14px 24px;border-radius:999px;background:#08C8F0;color:#050505;text-decoration:none;font-weight:600">${esc(link.label)}</a></p>`
    : ''
  return `<div style="font-family:'Inter Tight',Inter,-apple-system,'Segoe UI',Helvetica,Arial,sans-serif;font-size:15px;line-height:1.55;color:#050505;max-width:520px">${head}${body}${button}</div>`
}

/** The messages an event sends. Pure, so tests can read them. */
export function messagesFor(
  event: BookingEvent,
  b: Booking,
  opts: { manageUrl?: string; ownerEmail?: string; now?: Date },
): Message[] {
  const service = serviceById(b.serviceId)?.name ?? 'Appointment'
  const out: Message[] = []
  const guestTo = b.customer.email
  const ownerTo = opts.ownerEmail
  const replyTo = ownerTo || undefined
  const where = fullAddress()
  const price = money(b.priceCentsSnapshot)
  const ics = { filename: 'booking.ics', content: bookingIcs(b, opts.now), contentType: 'text/calendar' }
  const manage = opts.manageUrl ? { href: opts.manageUrl, label: 'Change or cancel' } : undefined
  const customerLine = [b.customer.name, b.customer.phone, b.customer.email].filter(Boolean).join(' · ')

  if (event === 'created' || event === 'rescheduled') {
    if (guestTo) {
      const lines = [
        `${event === 'created' ? 'Booking confirmed' : 'Booking moved'}: ${service}.`,
        when(b),
        where,
        `${price}. ${tenant.payment}`,
        ...(opts.manageUrl
          ? [`To change or cancel, use this link up to ${tenant.rules.guestChangeCutoffHours} hours before: ${opts.manageUrl}`]
          : []),
      ]
      out.push({
        to: guestTo,
        replyTo,
        subject: `${event === 'created' ? 'Booked' : 'Moved'}: ${service}, ${when(b)}`,
        text: lines.join('\n\n'),
        html: html(lines, manage),
        attachments: [ics],
      })
    }
    if (ownerTo) {
      const lines = [`${event === 'created' ? 'New booking' : 'Booking moved'}: ${service}, ${when(b)}.`, customerLine, ...(b.notes ? [`Notes: ${b.notes}`] : [])]
      out.push({
        to: ownerTo,
        subject: `${event === 'created' ? 'New' : 'Moved'}: ${b.customer.name}, ${when(b)}`,
        text: lines.join('\n\n'),
        html: html(lines),
      })
    }
  }

  if (event === 'cancelled-by-guest' || event === 'cancelled-by-owner') {
    if (guestTo) {
      const lines = [
        event === 'cancelled-by-guest'
          ? `Your ${service.toLowerCase()} on ${when(b)} has been cancelled.`
          : `Your ${service.toLowerCase()} on ${when(b)} has been cancelled by ${tenant.name}.`,
        `Questions: @${tenant.instagram} on Instagram.`,
        `— ${tenant.barber}`,
      ]
      out.push({ to: guestTo, replyTo, subject: `Cancelled: ${service}, ${when(b)}`, text: lines.join('\n\n'), html: html(lines) })
    }
    if (ownerTo && event === 'cancelled-by-guest') {
      const lines = [`Cancelled by the guest: ${service}, ${when(b)}.`, customerLine]
      out.push({ to: ownerTo, subject: `Cancelled: ${b.customer.name}, ${when(b)}`, text: lines.join('\n\n'), html: html(lines) })
    }
  }

  return out
}

/** Send an event's messages. Never throws: the booking has already stood or fallen. */
export async function notify(
  mailer: Mailer | null,
  event: BookingEvent,
  b: Booking,
  opts: { manageUrl?: string; ownerEmail?: string },
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
