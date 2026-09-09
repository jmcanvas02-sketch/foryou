/* eslint-disable react-hooks/set-state-in-effect */

import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { fetchProductSlugBySku } from "../../services/products";

type ShortLinkState = "loading" | "not_found" | "error";

export default function ProductShortLinkPage() {
  const { sku = "" } = useParams();
  const navigate = useNavigate();
  const [state, setState] = useState<ShortLinkState>("loading");
  const [error, setError] = useState("");
  const [retryVersion, setRetryVersion] = useState(0);

  useEffect(() => {
    let active = true;

    setState("loading");
    setError("");

    void fetchProductSlugBySku(sku, {
      force: retryVersion > 0,
    })
      .then((slug) => {
        if (!active) {
          return;
        }

        if (!slug) {
          setState("not_found");
          return;
        }

        navigate(`/san-pham/${slug}`, {
          replace: true,
        });
      })
      .catch((loadError: unknown) => {
        if (!active) {
          return;
        }

        setState("error");
        setError(
          loadError instanceof Error
            ? loadError.message
            : "Không thể mở liên kết sản phẩm.",
        );
      });

    return () => {
      active = false;
    };
  }, [navigate, retryVersion, sku]);

  if (state === "loading") {
    return (
      <section className="mx-auto my-16 max-w-xl rounded-3xl bg-white p-8 text-center shadow-sm">
        <p className="text-sm font-bold uppercase tracking-[0.2em] text-[#006397]">
          InGiDay
        </p>
        <h1 className="mt-3 text-2xl font-black text-[#091d2e]">
          Đang mở sản phẩm...
        </h1>
      </section>
    );
  }

  return (
    <section className="mx-auto my-16 max-w-xl rounded-3xl bg-white p-8 text-center shadow-sm">
      <p className="text-sm font-bold uppercase tracking-[0.2em] text-[#006397]">
        InGiDay
      </p>
      <h1 className="mt-3 text-2xl font-black text-[#091d2e]">
        {state === "not_found"
          ? "Không tìm thấy sản phẩm"
          : "Không thể mở liên kết"}
      </h1>
      <p className="mt-3 text-[#59636d]">
        {state === "not_found"
          ? "Mã sản phẩm không tồn tại hoặc sản phẩm đang được ẩn."
          : error}
      </p>
      <div className="mt-6 flex flex-wrap justify-center gap-3">
        {state === "error" && (
          <button
            type="button"
            onClick={() => setRetryVersion((current) => current + 1)}
            className="rounded-xl bg-[#006397] px-5 py-3 text-sm font-bold text-white"
          >
            Thử lại
          </button>
        )}
        <Link
          to="/san-pham"
          className="rounded-xl bg-[#edf4ff] px-5 py-3 text-sm font-bold text-[#006397]"
        >
          Xem tất cả sản phẩm
        </Link>
      </div>
    </section>
  );
}
