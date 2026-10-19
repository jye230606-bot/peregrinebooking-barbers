import { fullAddress, tenant } from "@/config/tenant";
import { reviews } from "@/content/reviews";
import { ShareButton } from "./Actions";
import { ParallaxPhoto, Reveal } from "./Motion";

/**
 * Who and where: the photo, the name and address, the rating, sharing and
 * directions. Services and prices live in the booking sheet.
 */

export function Profile() {
  const average = (reviews.reduce((n, r) => n + r.rating, 0) / reviews.length).toFixed(1);
  const maps = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(fullAddress())}`;

  return (
    <section className="vb-section vb-wide" id="profile" aria-labelledby="profile-h">
      <Reveal className="vb-cover">
        <ParallaxPhoto
          src="/brand/vbarbersz-photo.jpeg"
          width={1996}
          height={1122}
          alt={`${tenant.barber} cutting a client’s hair`}
        />
      </Reveal>

      <div className="vb-profile">
        <Reveal className="vb-profile-id" index={1}>
          <h2 id="profile-h" className="vb-profile-name">
            {tenant.booksyName}
          </h2>
          <p className="vb-profile-address">{fullAddress()}</p>
          <div className="vb-profile-meta">
            <a href="#reviews" className="vb-rating-link">
              <span className="vb-stars" aria-hidden="true">
                ★★★★★
              </span>
              <strong>{average}</strong>
              <span className="vb-muted">· {reviews.length} reviews</span>
            </a>
          </div>
        </Reveal>
        <Reveal className="vb-profile-actions" index={2}>
          <ShareButton title={`${tenant.name} · ${tenant.barber}`} />
          <a className="vb-pill vb-pill-ghost" href={maps} target="_blank" rel="noopener noreferrer">
            <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M8 14.5s5-4.3 5-8.3A5 5 0 0 0 3 6.2c0 4 5 8.3 5 8.3z" />
              <circle cx="8" cy="6.2" r="1.8" />
            </svg>
            Directions
          </a>
        </Reveal>
      </div>

    </section>
  );
}
