import { useMemo, useState } from "react";
import type { FormEvent } from "react";
import { useStoreData } from "../../features/admin/StoreDataContext";
import type { CategoryInput, CategoryStatus } from "../../types/product";
import { slugify } from "../../utils/slug";

type CategoryForm = {
  name: string;
  emoji: string;
  background: string;
  status: CategoryStatus;
};

const emptyForm: CategoryForm = {
  name: "",
  emoji: "📁",
  background: "#dff4ff",
  status: "active",
};

export default function CategoriesAdminPage() {
  const { categories, products, loading, error: loadError, createCategory, updateCategory, deleteCategory, toggleCategoryVisibility } = useStoreData();
  const [form, setForm] = useState<CategoryForm>(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [keyword, setKeyword] = useState("");
  const [saving, setSaving] = useState(false);

  const filteredCategories = useMemo(() => {
    const normalized = keyword.trim().toLocaleLowerCase("vi");
    return categories.filter((category) => !normalized || category.name.toLocaleLowerCase("vi").includes(normalized));
  }, [categories, keyword]);

  function resetForm() {
    setForm(emptyForm);
    setEditingId(null);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    const name = form.name.trim();
    if (!name) {
      setMessage("Vui lòng nhập tên danh mục.");
      return;
    }

    const input: CategoryInput = {
      name,
      slug: slugify(name),
      emoji: form.emoji.trim() || "📁",
      background: form.background,
      status: form.status,
    };

    setSaving(true);
    const result = editingId
      ? await updateCategory(editingId, input)
      : await createCategory(input);
    setSaving(false);
    setMessage(result.message);

    if (result.success) resetForm();
  }

  function startEdit(id: string) {
    const category = categories.find((item) => item.id === id);
    if (!category) return;
    setEditingId(id);
    setForm({
      name: category.name,
      emoji: category.emoji,
      background: category.background,
      status: category.status,
    });
    setMessage("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function handleDelete(id: string, name: string) {
    if (!window.confirm(`Xóa danh mục "${name}"?`)) return;
    const result = await deleteCategory(id);
    setMessage(result.message);
    if (result.success && editingId === id) resetForm();
  }

  if (loading) {
    return <section className="rounded-3xl bg-white p-8 text-center shadow-sm">Đang tải danh mục...</section>;
  }

  if (loadError) {
    return <section className="rounded-3xl bg-[#fff0eb] p-8 text-center font-semibold text-[#a43c12] shadow-sm">{loadError}</section>;
  }

  return (
    <section>
      <div>
        <p className="text-sm font-bold uppercase tracking-[0.2em] text-[#006397]">Danh mục</p>
        <h1 className="mt-2 text-3xl font-black sm:text-4xl">Quản lý danh mục</h1>
        <p className="mt-3 text-[#3f4850]">Tạo, sửa, ẩn hoặc xóa danh mục sản phẩm.</p>
      </div>

      <div className="mt-8 grid gap-6 xl:grid-cols-[380px_1fr]">
        <form onSubmit={handleSubmit} className="h-fit rounded-3xl bg-white p-6 shadow-sm xl:sticky xl:top-26">
          <h2 className="text-xl font-black">{editingId ? "Sửa danh mục" : "Tạo danh mục"}</h2>

          <label className="mt-5 block text-sm font-bold">
            Tên danh mục <span className="text-[#a43c12]">*</span>
            <input value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} className="mt-2 h-12 w-full rounded-2xl border border-[#cfd6dd] bg-[#f7f9ff] px-4 font-normal outline-none focus:border-[#006397]" placeholder="Ví dụ: Đồ trang trí" />
          </label>

          <div className="mt-5 grid grid-cols-[1fr_100px] gap-3">
            <label className="text-sm font-bold">
              Biểu tượng
              <input value={form.emoji} onChange={(event) => setForm((current) => ({ ...current, emoji: event.target.value }))} className="mt-2 h-12 w-full rounded-2xl border border-[#cfd6dd] bg-[#f7f9ff] px-4 font-normal outline-none focus:border-[#006397]" />
            </label>
            <label className="text-sm font-bold">
              Màu nền
              <input type="color" value={form.background} onChange={(event) => setForm((current) => ({ ...current, background: event.target.value }))} className="mt-2 h-12 w-full rounded-2xl border border-[#cfd6dd] bg-[#f7f9ff] p-1" />
            </label>
          </div>

          <label className="mt-5 block text-sm font-bold">
            Trạng thái
            <select value={form.status} onChange={(event) => setForm((current) => ({ ...current, status: event.target.value as CategoryStatus }))} className="mt-2 h-12 w-full rounded-2xl border border-[#cfd6dd] bg-[#f7f9ff] px-4 font-normal outline-none focus:border-[#006397]">
              <option value="active">Đang hiển thị</option>
              <option value="hidden">Đang ẩn</option>
            </select>
          </label>

          <div className="mt-5 grid aspect-[2/1] place-items-center rounded-3xl text-6xl" style={{ backgroundColor: form.background }}>{form.emoji || "📁"}</div>

          {message && <p className="mt-5 rounded-2xl bg-[#edf4ff] px-4 py-3 text-sm font-semibold text-[#006397]">{message}</p>}

          <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
            <button type="submit" disabled={saving} className="min-h-12 rounded-2xl bg-[#006397] px-5 font-bold text-white disabled:cursor-not-allowed disabled:opacity-60">{saving ? "Đang lưu..." : editingId ? "Lưu thay đổi" : "Tạo danh mục"}</button>
            {editingId && <button type="button" onClick={resetForm} className="min-h-12 rounded-2xl bg-[#edf0f3] px-5 font-bold text-[#3f4850]">Hủy sửa</button>}
          </div>
        </form>

        <div>
          <div className="rounded-3xl bg-white p-5 shadow-sm">
            <label className="block text-sm font-bold">
              Tìm danh mục
              <input value={keyword} onChange={(event) => setKeyword(event.target.value)} className="mt-2 h-11 w-full rounded-xl border border-[#cfd6dd] bg-[#f7f9ff] px-4 font-normal outline-none focus:border-[#006397]" placeholder="Nhập tên danh mục" />
            </label>
          </div>

          <div className="mt-5 grid gap-4 md:grid-cols-2">
            {filteredCategories.map((category) => {
              const productCount = products.filter((product) => product.categoryId === category.id).length;
              return (
                <article key={category.id} className="rounded-3xl bg-white p-5 shadow-sm">
                  <div className="flex items-start gap-4">
                    <div className="grid h-20 w-20 shrink-0 place-items-center rounded-3xl text-4xl" style={{ backgroundColor: category.background }}>{category.emoji}</div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="font-black">{category.name}</h2>
                        <span className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${category.status === "active" ? "bg-[#dcf8eb] text-[#14633d]" : "bg-[#edf0f3] text-[#4f5963]"}`}>{category.status === "active" ? "Đang hiện" : "Đang ẩn"}</span>
                      </div>
                      <p className="mt-2 text-sm text-[#707881]">{productCount} sản phẩm</p>
                      <p className="mt-1 truncate text-xs text-[#9aa1a8]">/{category.slug}</p>
                    </div>
                  </div>

                  <div className="mt-5 grid grid-cols-3 gap-2">
                    <button type="button" onClick={() => startEdit(category.id)} className="rounded-xl bg-[#edf4ff] px-3 py-2 text-xs font-bold text-[#006397]">Sửa</button>
                    <button type="button" onClick={() => void toggleCategoryVisibility(category.id)} className="rounded-xl bg-[#fff7e0] px-3 py-2 text-xs font-bold text-[#795b00]">{category.status === "active" ? "Ẩn" : "Hiện"}</button>
                    <button type="button" onClick={() => void handleDelete(category.id, category.name)} className="rounded-xl bg-[#fff0eb] px-3 py-2 text-xs font-bold text-[#a43c12]">Xóa</button>
                  </div>
                </article>
              );
            })}
          </div>

          {filteredCategories.length === 0 && <div className="mt-5 rounded-3xl bg-white p-12 text-center text-[#707881]">Không có danh mục phù hợp.</div>}
        </div>
      </div>
    </section>
  );
}
