import { area, tenant } from "@/config/tenant";
import { reviews } from "@/content/reviews";
import { ShareButton } from "./Actions";
import { ParallaxPhoto, Reveal } from "./Motion";

/**
 * Who and where: the photo, the name and suburb, the rating and sharing. The
 * street address comes with the booking. Services and prices live in the
 * booking sheet.
 */

export function Profile() {
  const average = (reviews.reduce((n, r) => n + r.rating, 0) / reviews.length).toFixed(1);

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
          <p className="vb-profile-address">{area()}</p>
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
        </Reveal>
      </div>

    </section>
  );
}
