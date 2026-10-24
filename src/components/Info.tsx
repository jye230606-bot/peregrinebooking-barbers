import { area, tenant } from "@/config/tenant";
import { BookButton } from "./Actions";
import { Hours } from "./Hours";
import { Mark } from "./Mark";
import { Reveal, WordsReveal } from "./Motion";

/**
 * Finding him and when: a map of the suburb, the hours and special dates,
 * payment and Instagram. Facts only. Then the footer. The street address is
 * only given once someone has booked.
 */

export function Info() {
  const query = encodeURIComponent(`${area()} Australia`);

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
              title={`Map of ${area()}`}
              src={`https://maps.google.com/maps?q=${query}&z=13&output=embed`}
              loading="lazy"
              referrerPolicy="no-referrer"
            />
            <div className="vb-map-card">
              <p className="vb-lead" style={{ margin: 0 }}>
                {tenant.booksyName}
              </p>
              <p className="vb-muted" style={{ margin: 0 }}>
                {area()} · the exact address comes with your booking confirmation.
              </p>
              <BookButton />
            </div>
          </Reveal>

          <Reveal className="vb-block" index={1}>
            <h3 className="vb-card-title">Business hours</h3>
            <Hours />
          </Reveal>

          <Reveal className="vb-block vb-stack" index={2}>
            <h3 className="vb-card-title">Payment</h3>
            <p className="vb-lead" style={{ margin: 0 }}>
              {tenant.payment}
            </p>
          </Reveal>

          <Reveal className="vb-block vb-stack" index={3}>
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
          {tenant.name} · {area()} ·{" "}
          <a href={`https://www.instagram.com/${tenant.instagram}/`} target="_blank" rel="noopener noreferrer" style={{ color: "var(--c-fg)" }}>
            @{tenant.instagram}
          </a>
        </p>
        <p className="vb-powered">
          Powered by{" "}
          <a href="https://www.peregrinepartners.space" target="_blank" rel="noopener">
            PeregrineOffice
          </a>
        </p>
      </footer>
    </>
  );
}
