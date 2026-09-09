import { Link } from "react-router-dom";
import { useSettings } from "../../features/settings/SettingsContext";
import {
  configuredSocialLinks,
  normalizeExternalUrl,
} from "../../utils/externalUrl";

const exploreLinks = [
  { label: "Tất cả sản phẩm", to: "/san-pham" },
  { label: "Yêu cầu in riêng", to: "/in-rieng" },
  { label: "Liên hệ", to: "/lien-he" },
  { label: "Giỏ hàng", to: "/gio-hang" },
];

const policyLinks = [
  { label: "Chính sách giao hàng", to: "/chinh-sach-giao-hang" },
  { label: "Chính sách đổi trả", to: "/chinh-sach-doi-tra" },
  { label: "Chính sách bảo hành", to: "/chinh-sach-bao-hanh" },
  { label: "Chính sách bảo mật", to: "/chinh-sach-bao-mat" },
  { label: "Điều khoản sử dụng", to: "/dieu-khoan-su-dung" },
];

function ArrowIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  );
}

export default function Footer() {
  const { settings } = useSettings();
  const messengerUrl = normalizeExternalUrl(
    settings.messengerUrl,
  );
  const socialLinks = configuredSocialLinks(
    settings.socialLinks,
  );

  return (
    <footer className="storefront-footer">
      <div className="sf-container">
        <div className="storefront-footer__panel">
          <div className="storefront-footer__intro">
            <Link
              to="/"
              className="storefront-brand storefront-brand--footer"
              aria-label={`${settings.storeName} - Trang chủ`}
            >
              {settings.logoUrl ? (
                <img
                  src={settings.logoUrl}
                  alt={settings.storeName}
                  className="storefront-brand__logo"
                />
              ) : (
                <span className="storefront-brand__wordmark">
                  {settings.storeName}
                  <span aria-hidden="true">?</span>
                </span>
              )}
            </Link>

            <p>{settings.footerDescription}</p>

            <Link
              to="/in-rieng"
              className="sf-button sf-button--primary storefront-footer__cta"
            >
              Yêu cầu thiết kế
              <ArrowIcon />
            </Link>
          </div>

          <div className="storefront-footer__column">
            <h2>Khám phá</h2>
            <div className="storefront-footer__links">
              {exploreLinks.map((item) => (
                <Link key={item.to} to={item.to}>
                  {item.label}
                </Link>
              ))}
            </div>
          </div>

          <div className="storefront-footer__column">
            <h2>Chính sách</h2>
            <div className="storefront-footer__links">
              {policyLinks.map((item) => (
                <Link key={item.to} to={item.to}>
                  {item.label}
                </Link>
              ))}
            </div>
          </div>

          <div className="storefront-footer__column">
            <h2>Liên hệ</h2>
            <div className="storefront-footer__contact">
              {settings.phone && (
                <a href={`tel:${settings.phone.replace(/\s+/g, "")}`}>
                  <span>Điện thoại</span>
                  {settings.phone}
                </a>
              )}

              {settings.email && (
                <a href={`mailto:${settings.email}`}>
                  <span>Email</span>
                  {settings.email}
                </a>
              )}

              {settings.address && (
                <p>
                  <span>Địa chỉ</span>
                  {settings.address}
                </p>
              )}
              {(settings.legalBusinessName ||
                settings.businessOwnerName ||
                settings.taxCode ||
                settings.businessRegistrationNumber ||
                settings.businessRegistrationDate ||
                settings.businessRegistrationPlace) && (
                <div className="storefront-footer__legal">
                  {settings.legalBusinessName && (
                    <p>
                      <span>Hộ kinh doanh</span>
                      {settings.legalBusinessName}
                    </p>
                  )}

                  {settings.businessOwnerName && (
                    <p>
                      <span>Chủ hộ / người đại diện</span>
                      {settings.businessOwnerName}
                    </p>
                  )}

                  {settings.taxCode && (
                    <p>
                      <span>Mã số thuế</span>
                      {settings.taxCode}
                    </p>
                  )}

                  {settings.businessRegistrationNumber && (
                    <p>
                      <span>Số đăng ký HKD</span>
                      {settings.businessRegistrationNumber}
                    </p>
                  )}

                  {settings.businessRegistrationDate && (
                    <p>
                      <span>Ngày cấp</span>
                      {settings.businessRegistrationDate}
                    </p>
                  )}

                  {settings.businessRegistrationPlace && (
                    <p>
                      <span>Nơi cấp</span>
                      {settings.businessRegistrationPlace}
                    </p>
                  )}
                </div>
              )}

              {messengerUrl && (
                <a
                  href={messengerUrl}
                  target="_blank"
                  rel="noreferrer"
                >
                  <span>Nhắn tin</span>
                  Messenger ↗
                </a>
              )}

              {socialLinks.map((social) => (
                <a
                  key={social.key}
                  href={social.url}
                  target="_blank"
                  rel="noreferrer"
                >
                  <span>Mạng xã hội</span>
                  {social.label} ↗
                </a>
              ))}

              {!settings.phone &&
                !settings.email &&
                !settings.address &&
                !messengerUrl &&
                socialLinks.length === 0 && (
                  <p className="storefront-footer__muted">
                    Thông tin liên hệ sẽ được cập nhật trong trang quản trị.
                  </p>
                )}
            </div>
          </div>
        </div>

        <div className="storefront-footer__bottom">
          <span>
            © {new Date().getFullYear()} {settings.storeName}. All rights
            reserved.
          </span>
          <span>Thiết kế và hoàn thiện sản phẩm in 3D tại Việt Nam.</span>
        </div>
      </div>
    </footer>
  );
}
