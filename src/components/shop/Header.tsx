import { useState } from "react";
import type { FormEvent } from "react";
import { Link, NavLink, useNavigate } from "react-router-dom";
import { useCart } from "../../features/cart/CartContext";
import { useSettings } from "../../features/settings/SettingsContext";
import { formatCurrency } from "../../utils/currency";

const navItems = [
  { label: "Trang chủ", to: "/" },
  { label: "Sản phẩm", to: "/san-pham" },
  { label: "In theo yêu cầu", to: "/in-rieng" },
  { label: "Liên hệ", to: "/lien-he" },
];

function SearchIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="m21 21-4.35-4.35m1.35-5.65a7 7 0 1 1-14 0 7 7 0 0 1 14 0Z" />
    </svg>
  );
}

function CartIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M3 4h2l1.6 10.1a2 2 0 0 0 2 1.7h7.8a2 2 0 0 0 2-1.6L20 7H6" />
      <path d="M9 20h.01M17 20h.01" />
    </svg>
  );
}

function MenuIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4 7h16M4 12h16M4 17h16" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="m6 6 12 12M18 6 6 18" />
    </svg>
  );
}

export default function Header() {
  const [query, setQuery] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  const navigate = useNavigate();
  const { itemCount } = useCart();
  const { settings } = useSettings();

  function handleSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = query.trim();
    navigate(value ? `/san-pham?q=${encodeURIComponent(value)}` : "/san-pham");
    setMenuOpen(false);
  }

  return (
    <header className="storefront-header">
      <div className="storefront-announcement">
        <div className="sf-container storefront-announcement__inner">
          <span className="storefront-announcement__dot" aria-hidden="true" />
          <span>
            Miễn phí vận chuyển cho đơn hàng từ{" "}
            <strong>{formatCurrency(settings.freeShippingThreshold)}</strong>
          </span>
        </div>
      </div>

      <div className="storefront-header__main">
        <div className="sf-container storefront-header__inner">
          <Link
            to="/"
            className="storefront-brand"
            aria-label={`${settings.storeName} - Trang chủ`}
            onClick={() => setMenuOpen(false)}
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

          <nav className="storefront-nav" aria-label="Điều hướng chính">
            {navItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === "/"}
                className={({ isActive }) =>
                  `storefront-nav__link${isActive ? " is-active" : ""}`
                }
              >
                {item.label}
              </NavLink>
            ))}
          </nav>

          <div className="storefront-header__actions">
            <form
              className="storefront-search storefront-search--desktop"
              role="search"
              onSubmit={handleSearch}
            >
              <SearchIcon />
              <input
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Tìm món đồ xinh xắn..."
                aria-label="Tìm sản phẩm"
              />
            </form>

            <Link
              to="/gio-hang"
              className="storefront-cart-button"
              aria-label={`Giỏ hàng có ${itemCount} sản phẩm`}
              onClick={() => setMenuOpen(false)}
            >
              <CartIcon />
              {itemCount > 0 && (
                <span className="storefront-cart-button__badge">
                  {itemCount > 99 ? "99+" : itemCount}
                </span>
              )}
            </Link>

            <button
              type="button"
              className="storefront-menu-button"
              aria-expanded={menuOpen}
              aria-controls="storefront-mobile-menu"
              aria-label={menuOpen ? "Đóng menu" : "Mở menu"}
              onClick={() => setMenuOpen((current) => !current)}
            >
              {menuOpen ? <CloseIcon /> : <MenuIcon />}
            </button>
          </div>
        </div>
      </div>

      {menuOpen && (
        <div
          id="storefront-mobile-menu"
          className="storefront-mobile-menu"
        >
          <div className="sf-container storefront-mobile-menu__inner">
            <form
              className="storefront-search storefront-search--mobile"
              role="search"
              onSubmit={handleSearch}
            >
              <SearchIcon />
              <input
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Tìm sản phẩm..."
                aria-label="Tìm sản phẩm"
              />
            </form>

            <nav
              className="storefront-mobile-nav"
              aria-label="Điều hướng di động"
            >
              {navItems.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.to === "/"}
                  onClick={() => setMenuOpen(false)}
                  className={({ isActive }) =>
                    `storefront-mobile-nav__link${
                      isActive ? " is-active" : ""
                    }`
                  }
                >
                  <span>{item.label}</span>
                  <span aria-hidden="true">→</span>
                </NavLink>
              ))}
            </nav>
          </div>
        </div>
      )}
    </header>
  );
}
