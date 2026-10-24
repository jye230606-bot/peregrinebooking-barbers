// The Workers runtime module, imported lazily by the mailers. Only the part
// this app uses; the real types come from the runtime.
declare module 'cloudflare:workers' {
  export const env: {
    EMAIL: {
      send(message: {
        from: string | { email: string; name?: string }
        to: string | string[]
        subject: string
        text?: string
        html?: string
        replyTo?: string
        attachments?: { content: string | ArrayBuffer; filename: string; type: string; disposition: 'attachment' | 'inline' }[]
      }): Promise<{ messageId: string }>
    }
  }
}
