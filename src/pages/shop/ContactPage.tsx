import { Link } from "react-router-dom";
import { useSettings } from "../../features/settings/SettingsContext";
import { usePageMeta } from "../../hooks/usePageMeta";
import {
  configuredSocialLinks,
  normalizeExternalUrl,
} from "../../utils/externalUrl";
import "./ContactPage.css";

function ArrowIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  );
}

export default function ContactPage() {
  const { settings } = useSettings();
  const messengerUrl = normalizeExternalUrl(
    settings.messengerUrl,
  );
  const socialLinks = configuredSocialLinks(
    settings.socialLinks,
  );
  const phoneHref = settings.phone
    ? `tel:${settings.phone.replace(/[^+\d]/g, "")}`
    : "";
  const hasDirectContact = Boolean(
    settings.phone ||
      settings.email ||
      settings.address ||
      messengerUrl,
  );

  usePageMeta({
    title: `Liên hệ | ${settings.storeName}`,
    description: `Liên hệ ${settings.storeName} qua điện thoại, email, Messenger hoặc các kênh mạng xã hội đang hoạt động.`,
    canonicalPath: "/lien-he",
  });

  return (
    <main className="contact-page">
      <section className="contact-page__hero">
        <div className="sf-container contact-page__hero-inner">
          <div>
            <p className="contact-page__eyebrow">Liên hệ InGiDay</p>
            <h1>Chạm đúng kênh, gặp đúng chủ shop</h1>
            <p className="contact-page__lead">
              Chọn cách liên hệ thuận tiện nhất. Các kênh bên dưới được cập nhật trực tiếp từ trang quản trị của cửa hàng.
            </p>
          </div>

          <Link to="/in-rieng" className="contact-page__custom-cta">
            Gửi yêu cầu in riêng
            <ArrowIcon />
          </Link>
        </div>
      </section>

      <section className="sf-container contact-page__content">
        <div className="contact-page__section-heading">
          <p>Kênh trực tiếp</p>
          <h2>Trao đổi với cửa hàng</h2>
        </div>

        {hasDirectContact ? (
          <div className="contact-page__contact-grid">
            {settings.phone && (
              <a href={phoneHref} className="contact-page__card">
                <span className="contact-page__card-label">Điện thoại</span>
                <strong>{settings.phone}</strong>
                <small>Chạm để gọi</small>
              </a>
            )}

            {settings.email && (
              <a
                href={`mailto:${settings.email}`}
                className="contact-page__card"
              >
                <span className="contact-page__card-label">Email</span>
                <strong>{settings.email}</strong>
                <small>Chạm để gửi thư</small>
              </a>
            )}

            {messengerUrl && (
              <a
                href={messengerUrl}
                target="_blank"
                rel="noreferrer"
                className="contact-page__card contact-page__card--accent"
              >
                <span className="contact-page__card-label">Messenger</span>
                <strong>Nhắn trực tiếp với chủ shop</strong>
                <small>Mở Messenger ↗</small>
              </a>
            )}

            {settings.address && (
              <article className="contact-page__card">
                <span className="contact-page__card-label">Địa chỉ</span>
                <strong>{settings.address}</strong>
                <small>Thông tin do cửa hàng cung cấp</small>
              </article>
            )}
          </div>
        ) : (
          <div className="contact-page__empty">
            Thông tin liên hệ trực tiếp đang được cập nhật.
          </div>
        )}

        <div className="contact-page__social-section">
          <div className="contact-page__section-heading">
            <p>Mạng xã hội</p>
            <h2>Theo dõi InGiDay trên các nền tảng</h2>
          </div>

          {socialLinks.length > 0 ? (
            <div className="contact-page__social-grid">
              {socialLinks.map((social) => (
                <a
                  key={social.key}
                  href={social.url}
                  target="_blank"
                  rel="noreferrer"
                  className="contact-page__social-link"
                >
                  <span>{social.label}</span>
                  <ArrowIcon />
                </a>
              ))}
            </div>
          ) : (
            <div className="contact-page__empty">
              Cửa hàng chưa công khai kênh mạng xã hội nào.
            </div>
          )}
        </div>
      </section>
    </main>
  );
}
