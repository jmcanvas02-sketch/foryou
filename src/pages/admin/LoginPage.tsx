import { useState } from "react";
import type { FormEvent } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { useAdminAuth } from "../../features/admin/AdminAuthContext";

export default function LoginPage() {
  const { isAuthenticated, loading, login } = useAdminAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  if (!loading && isAuthenticated) {
    const target =
      (location.state as { from?: string } | null)?.from ?? "/admin";

    return <Navigate to={target} replace />;
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSubmitting(true);

    const result = await login(email, password);

    if (!result.success) {
      setError(result.message ?? "Đăng nhập không thành công.");
      setSubmitting(false);
      return;
    }

    const target =
      (location.state as { from?: string } | null)?.from ?? "/admin";

    navigate(target, { replace: true });
  }

  return (
    <div className="w-full max-w-md rounded-[32px] bg-white p-7 shadow-[0_25px_65px_-30px_rgba(0,99,151,0.5)] sm:p-9">
      <div className="grid h-16 w-16 place-items-center rounded-2xl bg-[#d1e4fb] text-3xl">
        🔐
      </div>

      <p className="mt-6 text-sm font-bold uppercase tracking-[0.18em] text-[#006397]">
        InGiDay Admin
      </p>

      <h1 className="mt-2 text-3xl font-black">Đăng nhập quản trị</h1>

      <p className="mt-3 text-sm leading-6 text-[#3f4850]">
        Sử dụng tài khoản quản trị đã tạo trong Supabase.
      </p>

      <form onSubmit={handleSubmit} className="mt-7 space-y-5">
        <label className="block text-sm font-bold">
          Email
          <input
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className="mt-2 h-12 w-full rounded-2xl border border-[#bfc7d2] bg-[#f7f9ff] px-4 font-normal outline-none focus:border-[#006397]"
            autoComplete="username"
            required
            disabled={submitting}
          />
        </label>

        <label className="block text-sm font-bold">
          Mật khẩu
          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className="mt-2 h-12 w-full rounded-2xl border border-[#bfc7d2] bg-[#f7f9ff] px-4 font-normal outline-none focus:border-[#006397]"
            autoComplete="current-password"
            required
            disabled={submitting}
          />
        </label>

        {error && (
          <p
            className="rounded-2xl bg-[#fff0eb] px-4 py-3 text-sm font-semibold text-[#a43c12]"
            role="alert"
          >
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={submitting || loading}
          className="min-h-13 w-full rounded-2xl bg-[#006397] px-6 font-bold text-white shadow-lg shadow-[#006397]/20 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {submitting || loading ? "Đang đăng nhập..." : "Đăng nhập"}
        </button>
      </form>
    </div>
  );
}
