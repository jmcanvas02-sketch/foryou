/* eslint-disable react-hooks/set-state-in-effect */
import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useStoreData } from "../../features/admin/StoreDataContext";
import { useDebouncedValue } from "../../hooks/useDebouncedValue";
import type { Product, ProductStatus } from "../../types/product";
import { formatCurrency } from "../../utils/currency";
import { optimizeCloudinaryUrl } from "../../lib/cloudinary";

const PAGE_SIZE = 50;

const statusLabels: Record<ProductStatus, string> = {
  active: "Đang bán",
  hidden: "Đang ẩn",
  out_of_stock: "Hết hàng",
};

const statusClasses: Record<ProductStatus, string> = {
  active: "bg-[#dcf8eb] text-[#14633d]",
  hidden: "bg-[#edf0f3] text-[#4f5963]",
  out_of_stock: "bg-[#fff0eb] text-[#a43c12]",
};

function primaryImage(product: Product) {
  return (
    (product.images ?? []).find((image) => image.isPrimary) ??
    (product.images ?? [])[0]
  );
}

function productShortUrl(product: Product) {
  const sku = product.sku?.trim().toUpperCase();

  if (!sku) {
    return "";
  }

  return new URL(
    `/p/${encodeURIComponent(sku)}`,
    window.location.origin,
  ).toString();
}

async function copyText(text: string) {
  if (navigator.clipboard && window.isSecureContext) {
    try {
      await navigator.clipboard.writeText(text);
      return;
    } catch {
      // Fall back to the legacy copy path below.
    }
  }

  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  textarea.style.pointerEvents = "none";
  document.body.appendChild(textarea);
  textarea.select();

  const copied = document.execCommand("copy");
  textarea.remove();

  if (!copied) {
    throw new Error("Trình duyệt không cho phép sao chép tự động.");
  }
}

export default function ProductsAdminPage() {
  const {
    products,
    categories,
    loading,
    error: loadError,
    loadProductPage,
    bulkDeleteProducts,
    bulkUpdateProductStatus,
    bulkAddProductsToCategories,
    duplicateProduct,
  } = useStoreData();

  const [keyword, setKeyword] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [status, setStatus] = useState<ProductStatus | "">("");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [pageLoading, setPageLoading] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [bulkStatus, setBulkStatus] = useState<ProductStatus | "">("");
  const [bulkCategoryIds, setBulkCategoryIds] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [messageSuccess, setMessageSuccess] = useState(false);
  const [reloadToken, setReloadToken] = useState(0);

  const debouncedKeyword = useDebouncedValue(keyword, 350);
  const selectAllRef = useRef<HTMLInputElement>(null);
  const bulkCollectionsRef = useRef<HTMLDetailsElement>(null);
  const loadProductPageRef = useRef(loadProductPage);

  useEffect(() => {
    loadProductPageRef.current = loadProductPage;
  }, [loadProductPage]);

  useEffect(() => {
    setPage(1);
  }, [categoryId, debouncedKeyword, status]);

  useEffect(() => {
    setSelectedIds([]);
    setBulkCategoryIds([]);
    if (bulkCollectionsRef.current) {
      bulkCollectionsRef.current.open = false;
    }
  }, [categoryId, debouncedKeyword, page, status]);

  useEffect(() => {
    if (loading) return;

    let active = true;
    const loadingTimer = window.setTimeout(() => {
      if (active) {
        setPageLoading(true);
      }
    }, 150);

    void loadProductPageRef.current({
      page,
      pageSize: PAGE_SIZE,
      keyword: debouncedKeyword,
      categoryId,
      status,
    }).then((result) => {
      window.clearTimeout(loadingTimer);
      if (!active) return;

      if (!result.success || !result.data) {
        setMessageSuccess(false);
        setMessage(result.message);
        setPageLoading(false);
        return;
      }

      const nextTotalPages = Math.max(1, result.data.totalPages);
      if (page > nextTotalPages) {
        setPage(nextTotalPages);
        return;
      }

      setTotal(result.data.total);
      setPageLoading(false);
    });

    return () => {
      active = false;
      window.clearTimeout(loadingTimer);
    };
  }, [categoryId, debouncedKeyword, loading, page, reloadToken, status]);

  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);
  const pageIds = useMemo(() => products.map((product) => product.id), [products]);
  const allSelected =
    pageIds.length > 0 && pageIds.every((id) => selectedSet.has(id));
  const someSelected =
    pageIds.some((id) => selectedSet.has(id)) && !allSelected;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const firstItem = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const lastItem = Math.min(page * PAGE_SIZE, total);

  useEffect(() => {
    if (selectAllRef.current) {
      selectAllRef.current.indeterminate = someSelected;
    }
  }, [someSelected]);

  function toggleSelection(id: string) {
    setSelectedIds((current) =>
      current.includes(id)
        ? current.filter((item) => item !== id)
        : [...current, id],
    );
  }

  function toggleSelectAll() {
    setSelectedIds((current) => {
      if (allSelected) {
        return current.filter((id) => !pageIds.includes(id));
      }

      return [...new Set([...current, ...pageIds])];
    });
  }

  function toggleBulkCategory(categoryId: string) {
    setBulkCategoryIds((current) =>
      current.includes(categoryId)
        ? current.filter((id) => id !== categoryId)
        : [...current, categoryId],
    );
  }

  async function handleBulkAddCategories() {
    if (selectedIds.length === 0 || busy) return;

    if (bulkCategoryIds.length === 0) {
      setMessageSuccess(false);
      setMessage("Vui lòng chọn ít nhất một bộ sưu tập.");
      return;
    }

    setBusy(true);
    setMessage("");

    const result = await bulkAddProductsToCategories(
      selectedIds,
      bulkCategoryIds,
    );

    setBusy(false);
    setMessageSuccess(result.success);
    setMessage(result.message);

    if (result.success) {
      setSelectedIds([]);
      setBulkCategoryIds([]);
      if (bulkCollectionsRef.current) {
        bulkCollectionsRef.current.open = false;
      }
      setReloadToken((current) => current + 1);
    }
  }

  async function runBulkStatus(ids: string[], nextStatus: ProductStatus) {
    if (ids.length === 0 || busy) return;

    setBusy(true);
    setMessage("");
    const result = await bulkUpdateProductStatus(ids, nextStatus);
    setBusy(false);
    setMessageSuccess(result.success);
    setMessage(result.message);

    if (result.success) {
      setSelectedIds([]);
      setBulkStatus("");
      setBulkCategoryIds([]);
      setReloadToken((current) => current + 1);
    }
  }

  async function handleBulkStatus() {
    if (!bulkStatus) {
      setMessageSuccess(false);
      setMessage("Vui lòng chọn trạng thái cần áp dụng.");
      return;
    }

    await runBulkStatus(selectedIds, bulkStatus);
  }

  async function runDelete(ids: string[]) {
    if (ids.length === 0 || busy) return;

    setBusy(true);
    setMessage("");
    const result = await bulkDeleteProducts(ids);
    setBusy(false);
    setMessageSuccess(result.success);
    setMessage(result.message);

    if (result.success) {
      setSelectedIds([]);
      setBulkCategoryIds([]);
      setReloadToken((current) => current + 1);
    }
  }

  function handleDeleteSelected() {
    if (selectedIds.length === 0) return;
    if (!window.confirm(`Xóa ${selectedIds.length} sản phẩm đã chọn?`)) return;
    void runDelete(selectedIds);
  }

  function handleDeleteOne(product: Product) {
    if (!window.confirm(`Xóa sản phẩm "${product.name}"?`)) return;
    void runDelete([product.id]);
  }

  async function handleDuplicate(id: string) {
    if (busy) return;
    setBusy(true);
    setMessage("");
    const result = await duplicateProduct(id);
    setBusy(false);
    setMessageSuccess(result.success);
    setMessage(result.message);
    if (result.success) {
      setReloadToken((current) => current + 1);
    }
  }

  async function handleCopyShortLink(product: Product) {
    const shortUrl = productShortUrl(product);

    if (!shortUrl) {
      setMessageSuccess(false);
      setMessage(`Sản phẩm "${product.name}" chưa có mã SKU.`);
      return;
    }

    try {
      await copyText(shortUrl);
      setMessageSuccess(true);
      setMessage(`Đã sao chép link ngắn: ${shortUrl}`);
    } catch (copyError) {
      setMessageSuccess(false);
      setMessage(
        copyError instanceof Error
          ? copyError.message
          : "Không thể sao chép link ngắn.",
      );
    }
  }
  if (loading) {
    return (
      <section className="rounded-3xl bg-white p-8 text-center shadow-sm">
        Đang tải sản phẩm...
      </section>
    );
  }

  if (loadError) {
    return (
      <section className="rounded-3xl bg-[#fff0eb] p-8 text-center font-semibold text-[#a43c12] shadow-sm">
        {loadError}
      </section>
    );
  }

  return (
    <section>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm font-bold uppercase tracking-[0.2em] text-[#006397]">
            Sản phẩm
          </p>
          <h1 className="mt-2 text-3xl font-black sm:text-4xl">
            Quản lý sản phẩm
          </h1>
          <p className="mt-3 text-[#3f4850]">
            Thêm, sửa, nhân bản, đổi trạng thái hoặc xóa sản phẩm.
          </p>
        </div>
        <Link
          to="/admin/san-pham/them"
          className="inline-flex min-h-12 items-center rounded-2xl bg-[#fe7e4f] px-6 font-bold text-white"
        >
          + Thêm sản phẩm
        </Link>
      </div>

      <div className="mt-8 grid gap-4 rounded-3xl bg-white p-5 shadow-sm md:grid-cols-3">
        <label className="text-sm font-bold">
          Tìm kiếm
          <input
            value={keyword}
            onChange={(event) => setKeyword(event.target.value)}
            className="mt-2 h-11 w-full rounded-xl border border-[#cfd6dd] bg-[#f7f9ff] px-4 font-normal outline-none focus:border-[#006397]"
            placeholder="Tên hoặc mã sản phẩm"
          />
        </label>

        <label className="text-sm font-bold">
          Danh mục
          <select
            value={categoryId}
            onChange={(event) => setCategoryId(event.target.value)}
            className="mt-2 h-11 w-full rounded-xl border border-[#cfd6dd] bg-[#f7f9ff] px-4 font-normal outline-none focus:border-[#006397]"
          >
            <option value="">Tất cả danh mục</option>
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </select>
        </label>

        <label className="text-sm font-bold">
          Trạng thái
          <select
            value={status}
            onChange={(event) => setStatus(event.target.value as ProductStatus | "")}
            className="mt-2 h-11 w-full rounded-xl border border-[#cfd6dd] bg-[#f7f9ff] px-4 font-normal outline-none focus:border-[#006397]"
          >
            <option value="">Tất cả trạng thái</option>
            <option value="active">Đang bán</option>
            <option value="hidden">Đang ẩn</option>
            <option value="out_of_stock">Hết hàng</option>
          </select>
        </label>
      </div>

      {message && (
        <p
          className={`mt-5 rounded-2xl px-4 py-3 text-sm font-semibold ${
            messageSuccess
              ? "bg-[#dcf8eb] text-[#14633d]"
              : "bg-[#fff0eb] text-[#a43c12]"
          }`}
        >
          {message}
        </p>
      )}

      <div className="mt-6 overflow-hidden rounded-3xl bg-white shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#e3e8ee] px-5 py-4">
          <p className="text-sm text-[#3f4850]">
            Hiển thị <strong>{firstItem}–{lastItem}</strong> trong{" "}
            <strong>{total}</strong> sản phẩm
          </p>

          {selectedIds.length > 0 && (
            <div className="flex flex-wrap items-center justify-end gap-2">
              <span className="text-sm font-bold text-[#006397]">
                Đã chọn {selectedIds.length}/{products.length}
              </span>
              <details
                ref={bulkCollectionsRef}
                className="w-full sm:w-auto"
              >
                <summary className="flex h-10 min-w-56 cursor-pointer list-none items-center justify-between gap-3 rounded-xl border border-[#cfd6dd] bg-white px-3 text-sm font-bold text-[#006397]">
                  <span className="max-w-52 truncate">
                    {bulkCategoryIds.length > 0
                      ? categories
                          .filter((category) =>
                            bulkCategoryIds.includes(category.id),
                          )
                          .map((category) => category.name)
                          .join(", ")
                      : "+ Thêm vào bộ sưu tập"}
                  </span>
                  <span aria-hidden="true">⌄</span>
                </summary>
                <div className="mt-2 w-full min-w-72 rounded-2xl border border-[#dce3ea] bg-white p-3 shadow-lg sm:w-80">
                  <div className="max-h-56 space-y-1 overflow-y-auto">
                    {categories.map((category) => (
                      <label
                        key={category.id}
                        className="flex cursor-pointer items-center gap-3 rounded-xl px-3 py-2 text-sm hover:bg-[#f7f9ff]"
                      >
                        <input
                          type="checkbox"
                          checked={bulkCategoryIds.includes(category.id)}
                          onChange={() =>
                            toggleBulkCategory(category.id)
                          }
                          disabled={busy}
                          className="h-4 w-4 accent-[#006397]"
                        />
                        <span>
                          {category.name}
                          {category.status === "hidden"
                            ? " (đang ẩn)"
                            : ""}
                        </span>
                      </label>
                    ))}
                  </div>
                  <button
                    type="button"
                    onClick={() => void handleBulkAddCategories()}
                    disabled={busy || bulkCategoryIds.length === 0}
                    className="mt-3 h-10 w-full rounded-xl bg-[#006397] px-4 text-sm font-bold text-white disabled:opacity-60"
                  >
                    Thêm vào bộ sưu tập
                  </button>
                </div>
              </details>
              <select
                value={bulkStatus}
                onChange={(event) =>
                  setBulkStatus(event.target.value as ProductStatus | "")
                }
                disabled={busy}
                className="h-10 rounded-xl border border-[#cfd6dd] bg-white px-3 text-sm outline-none disabled:opacity-60"
              >
                <option value="">Chọn trạng thái</option>
                <option value="active">Đang bán</option>
                <option value="hidden">Đang ẩn</option>
                <option value="out_of_stock">Hết hàng</option>
              </select>
              <button
                type="button"
                onClick={() => void handleBulkStatus()}
                disabled={busy}
                className="h-10 rounded-xl bg-[#006397] px-4 text-sm font-bold text-white disabled:opacity-60"
              >
                Áp dụng
              </button>
              <button
                type="button"
                onClick={handleDeleteSelected}
                disabled={busy}
                className="h-10 rounded-xl bg-[#fff0eb] px-4 text-sm font-bold text-[#a43c12] disabled:opacity-60"
              >
                Xóa đã chọn
              </button>
            </div>
          )}
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[1040px] border-collapse text-left text-sm">
            <thead className="bg-[#f7f9ff] text-xs uppercase tracking-wide text-[#5f6872]">
              <tr>
                <th className="w-12 px-5 py-4">
                  <input
                    ref={selectAllRef}
                    type="checkbox"
                    checked={allSelected}
                    onChange={toggleSelectAll}
                    disabled={products.length === 0 || pageLoading || busy}
                    aria-label="Chọn tất cả sản phẩm trên trang"
                    className="h-4 w-4 accent-[#006397]"
                  />
                </th>
                <th className="px-4 py-4">Sản phẩm</th>
                <th className="px-4 py-4">Danh mục</th>
                <th className="px-4 py-4">Giá</th>
                <th className="px-4 py-4">Tồn kho</th>
                <th className="px-4 py-4">Trạng thái</th>
                <th className="px-5 py-4 text-right">Thao tác</th>
              </tr>
            </thead>

            <tbody className="divide-y divide-[#edf0f3]">
              {pageLoading && (
                <tr>
                  <td colSpan={7} className="px-5 py-12 text-center text-[#707881]">
                    Đang tải sản phẩm...
                  </td>
                </tr>
              )}

              {!pageLoading &&
                products.map((product) => {
                  const image = primaryImage(product);

                  return (
                    <tr key={product.id} className="hover:bg-[#fbfcfe]">
                      <td className="px-5 py-4">
                        <input
                          type="checkbox"
                          checked={selectedSet.has(product.id)}
                          onChange={() => toggleSelection(product.id)}
                          disabled={busy}
                          aria-label={`Chọn sản phẩm ${product.name}`}
                          className="h-4 w-4 accent-[#006397]"
                        />
                      </td>
                      <td className="px-4 py-4">
                        <div className="flex items-center gap-3">
                          <div
                            className="grid h-14 w-14 shrink-0 place-items-center overflow-hidden rounded-2xl text-3xl"
                            style={{ backgroundColor: product.background }}
                          >
                            {image ? (
                              <img
                                src={optimizeCloudinaryUrl(image.url, 180)}
                                alt={product.name}
                                className="h-full w-full object-cover"
                                loading="lazy"
                              />
                            ) : (
                              product.emoji
                            )}
                          </div>
                          <div className="min-w-0">
                            <p className="max-w-xs truncate font-bold text-[#091d2e]">
                              {product.name}
                            </p>
                            <p className="mt-1 text-xs text-[#707881]">
                              {product.sku ?? "Chưa có mã"}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-4 text-[#3f4850]">
                        {product.categoryName}
                      </td>
                      <td className="px-4 py-4 font-bold text-[#a43c12]">
                        {formatCurrency(product.price)}
                      </td>
                      <td className="px-4 py-4 font-semibold">{product.stock}</td>
                      <td className="px-4 py-4">
                        <span
                          className={`inline-flex rounded-full px-3 py-1 text-xs font-bold ${statusClasses[product.status]}`}
                        >
                          {statusLabels[product.status]}
                        </span>
                      </td>
                      <td className="px-5 py-4">
                        <div className="flex flex-wrap justify-end gap-2">
                          <button
              type="button"
              onClick={() => void handleCopyShortLink(product)}
              disabled={busy || !product.sku}
              title={
                product.sku
                  ? `Sao chép ${window.location.origin}/p/${product.sku}`
                  : "Sản phẩm chưa có mã SKU"
              }
              className="rounded-xl bg-[#e8f7f2] px-3 py-2 text-xs font-bold text-[#14633d] disabled:cursor-not-allowed disabled:opacity-50"
            >
              Copy link ngắn
            </button>
            <Link
                            to={`/admin/san-pham/${product.id}/sua`}
                            className="rounded-xl bg-[#edf4ff] px-3 py-2 text-xs font-bold text-[#006397]"
                          >
                            Sửa
                          </Link>
                          <button
                            type="button"
                            onClick={() => void handleDuplicate(product.id)}
                            disabled={busy}
                            className="rounded-xl bg-[#f2ecff] px-3 py-2 text-xs font-bold text-[#6543a8] disabled:opacity-60"
                          >
                            Nhân bản
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              void runBulkStatus(
                                [product.id],
                                product.status === "hidden" ? "active" : "hidden",
                              )
                            }
                            disabled={busy}
                            className="rounded-xl bg-[#fff7e0] px-3 py-2 text-xs font-bold text-[#795b00] disabled:opacity-60"
                          >
                            {product.status === "hidden" ? "Hiện" : "Ẩn"}
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteOne(product)}
                            disabled={busy}
                            className="rounded-xl bg-[#fff0eb] px-3 py-2 text-xs font-bold text-[#a43c12] disabled:opacity-60"
                          >
                            Xóa
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}

              {!pageLoading && products.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-5 py-14 text-center text-[#707881]">
                    Không có sản phẩm phù hợp.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[#e3e8ee] px-5 py-4">
          <p className="text-sm text-[#707881]">
            Trang <strong>{page}</strong>/{totalPages} · 50 sản phẩm/trang
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setPage((current) => Math.max(1, current - 1))}
              disabled={page <= 1 || pageLoading || busy}
              className="rounded-xl bg-[#edf4ff] px-4 py-2 text-sm font-bold text-[#006397] disabled:cursor-not-allowed disabled:opacity-40"
            >
              Trang trước
            </button>
            <button
              type="button"
              onClick={() =>
                setPage((current) => Math.min(totalPages, current + 1))
              }
              disabled={page >= totalPages || pageLoading || busy}
              className="rounded-xl bg-[#edf4ff] px-4 py-2 text-sm font-bold text-[#006397] disabled:cursor-not-allowed disabled:opacity-40"
            >
              Trang sau
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
