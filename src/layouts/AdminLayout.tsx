import { useState } from "react";
import {
  Link,
  NavLink,
  Outlet,
  useNavigate,
} from "react-router-dom";

import { useAdminAuth } from "../features/admin/AdminAuthContext";

const navItems = [
  {
    label: "Tổng quan",
    to: "/admin",
    icon: "▦",
    end: true,
  },
  {
    label: "Doanh thu",
    to: "/admin/doanh-thu",
    icon: "💰",
  },
  {
    label: "Phân tích",
    to: "/admin/phan-tich",
    icon: "📊",
  },
  {
    label: "Sản phẩm",
    to: "/admin/san-pham",
    icon: "📦",
  },
  {
    label: "Danh mục",
    to: "/admin/danh-muc",
    icon: "🗂️",
  },
  {
    label: "Đơn hàng",
    to: "/admin/don-hang",
    icon: "🧾",
  },
  {
    label: "Khách hàng",
    to: "/admin/khach-hang",
    icon: "👥",
  },
  {
    label: "Mã giảm giá",
    to: "/admin/ma-giam-gia",
    icon: "🏷️",
  },
  {
    label: "Banner",
    to: "/admin/banner",
    icon: "🖼️",
  },
  {
    label: "Chính sách",
    to: "/admin/chinh-sach",
    icon: "§",
  },
  {
    label: "Pixel quảng cáo",
    to: "/admin/pixel-quang-cao",
    icon: "📡",
  },
  {
    label: "Chi phí Ads",
    to: "/admin/bao-cao-chi-phi-ads",
    icon: "📣",
  },
  {
    label: "Cài đặt",
    to: "/admin/cai-dat",
    icon: "⚙️",
  },
];

export default function AdminLayout() {
  const [menuOpen, setMenuOpen] = useState(false);
  const { logout } = useAdminAuth();
  const navigate = useNavigate();

  function handleLogout() {
    logout();
    navigate("/admin/dang-nhap", {
      replace: true,
    });
  }

  return (
    <div className="min-h-screen bg-[#f4f7fb] lg:grid lg:grid-cols-[280px_1fr]">
      {menuOpen && (
        <button
          type="button"
          aria-label="Đóng menu"
          className="fixed inset-0 z-40 bg-[#091d2e]/45 lg:hidden"
          onClick={() => setMenuOpen(false)}
        />
      )}
      <aside
        className={`fixed inset-y-0 left-0 z-50 flex w-[280px] flex-col bg-[#203243] p-5 text-white transition-transform lg:sticky lg:top-0 lg:h-screen lg:translate-x-0 ${menuOpen ? "translate-x-0" : "-translate-x-full"}`}
      >
        <div className="flex items-center justify-between">
          <Link
            to="/admin"
            className="text-2xl font-black tracking-tight"
          >
            InGiDay Admin
          </Link>
          <button
            type="button"
            onClick={() => setMenuOpen(false)}
            className="grid h-10 w-10 place-items-center rounded-xl bg-white/10 lg:hidden"
          >
            ✕
          </button>
        </div>
        <p className="mt-2 text-xs text-[#b9cada]">
          Quản lý cửa hàng
        </p>
        <nav className="mt-8 grid gap-2 overflow-y-auto">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              onClick={() => setMenuOpen(false)}
              className={({ isActive }) =>
                `flex min-h-12 items-center gap-3 rounded-2xl px-4 text-sm font-semibold transition ${isActive ? "bg-[#fe7e4f] text-white" : "text-[#dce8f2] hover:bg-white/10"}`
              }
            >
              <span className="w-6 text-center text-lg">
                {item.icon}
              </span>
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="mt-auto space-y-2 border-t border-white/10 pt-5">
          <Link
            to="/"
            target="_blank"
            className="flex min-h-11 items-center rounded-xl px-4 text-sm font-semibold text-[#dce8f2] hover:bg-white/10"
          >
            Mở cửa hàng ↗
          </Link>
          <button
            type="button"
            onClick={handleLogout}
            className="flex min-h-11 w-full items-center rounded-xl px-4 text-left text-sm font-semibold text-[#ffd8c9] hover:bg-white/10"
          >
            Đăng xuất
          </button>
        </div>
      </aside>
      <div className="min-w-0">
        <header className="sticky top-0 z-30 flex h-18 items-center justify-between border-b border-[#dce3ea] bg-white/90 px-5 backdrop-blur lg:px-8">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setMenuOpen(true)}
              className="grid h-11 w-11 place-items-center rounded-xl bg-[#edf4ff] text-xl lg:hidden"
            >
              ☰
            </button>
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#006397]">
                Quản trị
              </p>
              <p className="font-black text-[#091d2e]">
                InGiDay
              </p>
            </div>
          </div>
          <div className="grid h-10 w-10 place-items-center rounded-full bg-[#d1e4fb] font-black text-[#006397]">
            A
          </div>
        </header>
        <main className="p-5 lg:p-8 xl:p-10">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
