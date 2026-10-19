"use client";

import { useState } from "react";

/** The small client-side buttons the server-rendered profile needs. */

/** Share the page: the phone's own sheet where there is one, else copy the link. */
export function ShareButton({ title }: { title: string }) {
  const [copied, setCopied] = useState(false);
  async function share() {
    const url = window.location.origin + window.location.pathname;
    try {
      if (navigator.share) {
        await navigator.share({ title, url });
        return;
      }
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      // Dismissed the share sheet, or clipboard blocked: nothing to do.
    }
  }
  return (
    <button type="button" className="vb-pill vb-pill-ghost" onClick={share}>
      <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M8 10.5V2M4.5 5.5L8 2l3.5 3.5M3 9v4.5h10V9" />
      </svg>
      <span aria-live="polite">{copied ? "Link copied" : "Share"}</span>
    </button>
  );
}
