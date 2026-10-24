"use client";

import { useMemo, useState } from "react";
import { reviews, type Review } from "@/content/reviews";
import { Reveal, WordsReveal } from "./Motion";

/**
 * Every Booksy review, as Booksy lays them out: the average and how the stars
 * fall, then each review with who left it, for which service, with which
 * barber and when. Sort and filter are the reader's; the default is all of
 * them, newest first. Text is rendered exactly as imported.
 */

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sept", "Oct", "Nov", "Dec"];
const when = (key: string) => {
  const [y, m, d] = key.split("-").map(Number);
  return `${d} ${MONTHS[m - 1]} ${y}`;
};

const CLAMP = 140; // characters before "Show more"
const FIRST = 6;

type Sort = "newest" | "oldest";
type Filter = "all" | "comments" | string; // or a service name

function ReviewCard({ r, index }: { r: Review; index: number }) {
  const [open, setOpen] = useState(false);
  const long = (r.body?.length ?? 0) > CLAMP;
  return (
    <li className="vb-review-card vb-rise" style={{ "--i": index } as React.CSSProperties}>
      <div className="vb-review-top">
        <span className="vb-avatar" aria-hidden="true">
          {r.author.slice(0, 1).toUpperCase()}
        </span>
        <span className="vb-review-who">
          <strong>{r.author}</strong>
          <span className="vb-confirmed">
            <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M3.5 8.5l3 3 6-7" />
            </svg>
            Confirmed client
          </span>
        </span>
        <span className="vb-review-date">{when(r.reviewedOn)}</span>
      </div>
      <span className="vb-stars" aria-label={`${r.rating} out of 5 stars`}>
        {"★".repeat(r.rating)}
      </span>
      {r.body && (
        <p className={`vb-review-body${long && !open ? " vb-clamped" : ""}`}>
          {r.body}
        </p>
      )}
      {long && (
        <button type="button" className="vb-text-button" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
          {open ? "Show less" : "Show more"}
        </button>
      )}
      <p className="vb-review-meta">
        Service: <span>{r.service}</span>
      </p>
    </li>
  );
}

export function Reviews() {
  const [sort, setSort] = useState<Sort>("newest");
  const [filter, setFilter] = useState<Filter>("all");
  const [all, setAll] = useState(false);

  const average = (reviews.reduce((n, r) => n + r.rating, 0) / reviews.length).toFixed(1);
  const counts = [5, 4, 3, 2, 1].map((star) => ({ star, n: reviews.filter((r) => r.rating === star).length }));
  const services = Array.from(new Set(reviews.map((r) => r.service)));

  const shown = useMemo(() => {
    const list = reviews.filter((r) =>
      filter === "all" ? true : filter === "comments" ? r.body !== null : r.service === filter,
    );
    list.sort((a, b) => (sort === "newest" ? b.reviewedOn.localeCompare(a.reviewedOn) : a.reviewedOn.localeCompare(b.reviewedOn)));
    return list;
  }, [sort, filter]);

  const visible = all ? shown : shown.slice(0, FIRST);
  const filters: { id: Filter; label: string; n: number }[] = [
    { id: "all", label: "All", n: reviews.length },
    { id: "comments", label: "With comments", n: reviews.filter((r) => r.body).length },
    ...services.map((s) => ({ id: s, label: s, n: reviews.filter((r) => r.service === s).length })),
  ];

  return (
    <section className="vb-section vb-wide" id="reviews" aria-labelledby="reviews-h">
      <div className="vb-section-head">
        <WordsReveal
          id="reviews-h"
          className="vb-section-title"
          parts={[{ text: "Reviews" }]}
        />
      </div>

      <div className="vb-reviews-layout">
        <Reveal className="vb-block vb-review-summary">
          <p className="vb-review-avg">{average}</p>
          <span className="vb-stars vb-stars-lg" aria-hidden="true">
            ★★★★★
          </span>
          <p className="vb-label" style={{ margin: 0 }}>
            Based on {reviews.length} reviews on Booksy
          </p>
          <ul className="vb-bars" aria-label="How the stars fall">
            {counts.map(({ star, n }) => (
              <li key={star}>
                <span>{star}</span>
                <span className="vb-bar" aria-hidden="true">
                  <i style={{ "--fill": n / reviews.length } as React.CSSProperties} />
                </span>
                <span className="vb-muted">{n}</span>
                <span className="vb-sr">
                  {star} stars: {n}
                </span>
              </li>
            ))}
          </ul>
        </Reveal>

        <div className="vb-review-feed">
          <Reveal className="vb-review-controls" index={1}>
            <div className="vb-filter" role="group" aria-label="Filter reviews">
              {filters.map((f) => (
                <button
                  key={f.id}
                  type="button"
                  className="vb-filter-chip"
                  aria-pressed={filter === f.id}
                  onClick={() => {
                    setFilter(f.id);
                    setAll(false);
                  }}
                >
                  {f.label} <span>{f.n}</span>
                </button>
              ))}
            </div>
            <label className="vb-sort">
              <span className="vb-sr">Sort reviews</span>
              <select value={sort} onChange={(e) => setSort(e.target.value as Sort)}>
                <option value="newest">Newest first</option>
                <option value="oldest">Oldest first</option>
              </select>
            </label>
          </Reveal>

          <ul className="vb-review-list" key={`${sort}-${filter}`}>
            {visible.map((r, i) => (
              <ReviewCard key={r.id} r={r} index={i} />
            ))}
          </ul>

          {shown.length > FIRST && (
            <button type="button" className="vb-btn vb-btn-ghost vb-btn-center" onClick={() => setAll((a) => !a)}>
              {all ? "Show fewer" : `Show all ${shown.length} reviews`}
            </button>
          )}
        </div>
      </div>
    </section>
  );
}
