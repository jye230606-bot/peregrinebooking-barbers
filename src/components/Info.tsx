import { fullAddress, tenant } from "@/config/tenant";
import { reviews } from "@/content/reviews";
import { BookButton } from "./Actions";
import { Hours } from "./Hours";
import { Mark } from "./Mark";
import { Reveal, WordsReveal } from "./Motion";

/**
 * Finding him and when: the map, the address, the hours and special dates,
 * staff, payment and Instagram. Facts only. Then the footer.
 */

export function Info() {
  const query = encodeURIComponent(fullAddress());
  const maps = `https://www.google.com/maps/search/?api=1&query=${query}`;

  return (
    <>
      <section className="vb-section vb-wide" id="visit" aria-labelledby="visit-h">
        <div className="vb-section-head">
          <WordsReveal
            id="visit-h"
            className="vb-section-title"
            parts={[{ text: "Location & hours" }]}
          />
        </div>

        <div className="vb-visit">
          <Reveal className="vb-map">
            <iframe
              title={`Map of ${fullAddress()}`}
              src={`https://maps.google.com/maps?q=${query}&z=15&output=embed`}
              loading="lazy"
              referrerPolicy="no-referrer"
            />
            <div className="vb-map-card">
              <p className="vb-lead" style={{ margin: 0 }}>
                {tenant.booksyName}
              </p>
              <p className="vb-muted" style={{ margin: 0 }}>
                {fullAddress()}
              </p>
              <a className="vb-pill" href={maps} target="_blank" rel="noopener noreferrer">
                Get directions <span aria-hidden="true">↗</span>
              </a>
            </div>
          </Reveal>

          <Reveal className="vb-block" index={1}>
            <h3 className="vb-card-title">Business hours</h3>
            <Hours />
          </Reveal>

          <Reveal className="vb-block vb-stack vb-barber" index={2}>
            <h3 className="vb-card-title">Staff</h3>
            <div className="vb-barber-row">
              <span className="vb-barber-avatar" aria-hidden="true">
                <Mark />
              </span>
              <div>
                <p className="vb-lead" style={{ margin: 0 }}>
                  {tenant.barber}
                </p>
                <p className="vb-muted" style={{ margin: 0 }}>
                  {reviews.length} reviews
                </p>
              </div>
            </div>
            <BookButton className="vb-btn vb-btn-ghost vb-btn-center" label="Book" />
          </Reveal>

          <Reveal className="vb-block vb-stack" index={3}>
            <h3 className="vb-card-title">Payment</h3>
            <p className="vb-lead" style={{ margin: 0 }}>
              {tenant.payment}
            </p>
          </Reveal>

          <Reveal className="vb-block vb-stack" index={4}>
            <h3 className="vb-card-title">Instagram</h3>
            <a className="vb-btn vb-btn-ghost vb-btn-center" href={`https://www.instagram.com/${tenant.instagram}/`} target="_blank" rel="noopener noreferrer">
              @{tenant.instagram} <span className="vb-btn-arrow" aria-hidden="true">↗</span>
            </a>
          </Reveal>
        </div>
      </section>

      <footer className="vb-footer">
        <Reveal>
          <Mark className="vb-footer-mark" />
        </Reveal>
        <p className="vb-label" style={{ margin: 0 }}>
          {tenant.name} · {fullAddress()} ·{" "}
          <a href={`https://www.instagram.com/${tenant.instagram}/`} target="_blank" rel="noopener noreferrer" style={{ color: "var(--c-fg)" }}>
            @{tenant.instagram}
          </a>
        </p>
      </footer>
    </>
  );
}
