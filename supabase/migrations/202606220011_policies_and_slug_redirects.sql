begin;

create table if not exists public.site_policies (
  slug text primary key,
  title text not null,
  content text not null,
  seo_title text not null default '',
  seo_description text not null default '',
  active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (slug = lower(btrim(slug)))
);

drop trigger if exists
trg_site_policies_updated_at
on public.site_policies;

create trigger trg_site_policies_updated_at
before update on public.site_policies
for each row
execute function public.set_updated_at();

insert into public.site_policies (
  slug,
  title,
  content,
  seo_title,
  seo_description,
  active,
  sort_order
)
values
(
  'chinh-sach-giao-hang',
  'Chính sách giao hàng',
  $policy$
## Phạm vi giao hàng

InGiDay tiếp nhận đơn hàng trên toàn quốc thông qua đơn vị vận chuyển phù hợp với khu vực nhận hàng.

## Phí vận chuyển

Phí vận chuyển được hiển thị trong phần tóm tắt đơn hàng trước khi khách xác nhận đặt hàng. Đơn hàng đạt mức miễn phí vận chuyển sẽ được hệ thống tự động áp dụng.

## Thời gian xử lý

Sản phẩm có sẵn được chuẩn bị và bàn giao cho đơn vị vận chuyển trong thời gian sớm nhất. Với sản phẩm in riêng hoặc cần sản xuất thêm, shop sẽ liên hệ để thông báo thời gian dự kiến.

## Kiểm tra thông tin nhận hàng

Khách hàng cần cung cấp đúng họ tên, số điện thoại và địa chỉ. InGiDay có thể liên hệ để xác nhận lại khi thông tin chưa đầy đủ hoặc có dấu hiệu nhầm lẫn.

## Sự cố giao hàng

Khi đơn giao chậm, thất lạc hoặc kiện hàng có dấu hiệu hư hỏng, khách hàng vui lòng liên hệ InGiDay để shop phối hợp với đơn vị vận chuyển xử lý.
$policy$,
  'Chính sách giao hàng | InGiDay',
  'Thông tin phí vận chuyển, thời gian xử lý và giao nhận đơn hàng tại InGiDay.',
  true,
  10
),
(
  'chinh-sach-doi-tra',
  'Chính sách đổi trả',
  $policy$
## Trường hợp được hỗ trợ

InGiDay tiếp nhận yêu cầu khi sản phẩm giao sai mẫu, sai số lượng, thiếu phụ kiện hoặc bị hư hỏng do quá trình vận chuyển.

## Điều kiện sản phẩm

Sản phẩm cần được giữ nguyên hiện trạng khi nhận, chưa qua sử dụng hoặc tự ý sửa chữa. Khách hàng nên lưu lại hình ảnh hoặc video mở kiện để việc xác minh được nhanh hơn.

## Sản phẩm in riêng

Sản phẩm được làm theo nội dung, kích thước hoặc yêu cầu riêng không áp dụng đổi trả do thay đổi sở thích. Shop vẫn hỗ trợ khi sản phẩm không đúng nội dung hai bên đã xác nhận hoặc có lỗi sản xuất.

## Cách gửi yêu cầu

Khách hàng liên hệ InGiDay và cung cấp mã đơn, mô tả tình trạng cùng hình ảnh liên quan. Shop sẽ kiểm tra và phản hồi phương án xử lý phù hợp.

## Chi phí đổi trả

Nếu lỗi thuộc về InGiDay hoặc đơn vị vận chuyển, shop chịu chi phí xử lý hợp lý. Các trường hợp khác sẽ được trao đổi trước khi thực hiện.
$policy$,
  'Chính sách đổi trả | InGiDay',
  'Điều kiện và quy trình hỗ trợ đổi trả sản phẩm tại InGiDay.',
  true,
  20
),
(
  'chinh-sach-bao-hanh',
  'Chính sách bảo hành',
  $policy$
## Phạm vi bảo hành

Sản phẩm được bảo hành theo thông tin công bố tại trang chi tiết sản phẩm hoặc nội dung đã được InGiDay xác nhận khi đặt hàng.

## Trường hợp được hỗ trợ

Shop tiếp nhận lỗi phát sinh từ quá trình sản xuất, lắp ráp hoặc vật liệu trong điều kiện sử dụng thông thường.

## Trường hợp không áp dụng

Bảo hành không áp dụng với hư hỏng do va đập mạnh, nhiệt độ cao, hóa chất, ngâm nước, sử dụng sai mục đích hoặc tự ý sửa đổi sản phẩm.

## Quy trình

Khách hàng cung cấp mã đơn, hình ảnh hoặc video mô tả lỗi. Sau khi kiểm tra, InGiDay sẽ thông báo phương án sửa chữa, thay thế hoặc hỗ trợ khác.

## Sản phẩm không có thời hạn bảo hành riêng

Với sản phẩm không ghi thời hạn bảo hành, shop vẫn tiếp nhận phản hồi và hỗ trợ trên tinh thần hợp lý tùy tình trạng thực tế.
$policy$,
  'Chính sách bảo hành | InGiDay',
  'Phạm vi và quy trình bảo hành sản phẩm InGiDay.',
  true,
  30
),
(
  'chinh-sach-bao-mat',
  'Chính sách bảo mật',
  $policy$
## Thông tin được thu thập

InGiDay thu thập các thông tin cần thiết để xử lý đơn hàng như họ tên, số điện thoại, địa chỉ nhận hàng, nội dung ghi chú và lịch sử giao dịch.

## Mục đích sử dụng

Thông tin được dùng để xác nhận đơn, giao hàng, hỗ trợ khách hàng, phòng chống đơn giả và cải thiện hoạt động của website.

## Phạm vi chia sẻ

InGiDay chỉ chia sẻ dữ liệu cần thiết cho đơn vị vận chuyển, nhà cung cấp dịch vụ hạ tầng hoặc cơ quan có thẩm quyền khi pháp luật yêu cầu. Shop không bán thông tin khách hàng.

## Bảo vệ dữ liệu

Website áp dụng các biện pháp kỹ thuật phù hợp để hạn chế truy cập trái phép. Khách hàng không nên cung cấp thông tin nhạy cảm không cần thiết trong phần ghi chú.

## Yêu cầu liên quan đến dữ liệu

Khách hàng có thể liên hệ InGiDay để hỏi, cập nhật hoặc yêu cầu xử lý thông tin cá nhân trong phạm vi pháp luật và nghĩa vụ lưu trữ đơn hàng cho phép.
$policy$,
  'Chính sách bảo mật | InGiDay',
  'Cách InGiDay thu thập, sử dụng và bảo vệ thông tin khách hàng.',
  true,
  40
),
(
  'dieu-khoan-su-dung',
  'Điều khoản sử dụng',
  $policy$
## Phạm vi áp dụng

Khi truy cập website hoặc đặt hàng, khách hàng xác nhận đã đọc và đồng ý với các điều khoản đang được công bố.

## Thông tin sản phẩm

InGiDay cố gắng trình bày hình ảnh, màu sắc, kích thước và mô tả chính xác. Sản phẩm in 3D có thể có sai khác nhỏ đặc trưng của quá trình sản xuất nhưng không làm thay đổi công năng chính.

## Xác nhận đơn hàng

Đơn hàng chỉ được xem là hợp lệ khi hệ thống tạo mã đơn thành công. InGiDay có thể liên hệ để xác minh thông tin, số lượng lớn hoặc yêu cầu in riêng.

## Hành vi không được chấp nhận

Khách hàng không được lợi dụng website để tạo đơn giả, can thiệp hệ thống, sử dụng nội dung trái pháp luật hoặc gây ảnh hưởng tới hoạt động của cửa hàng.

## Thay đổi điều khoản

InGiDay có thể cập nhật nội dung để phù hợp với hoạt động thực tế. Phiên bản đang hiển thị trên website là phiên bản được áp dụng tại thời điểm sử dụng.
$policy$,
  'Điều khoản sử dụng | InGiDay',
  'Các điều khoản áp dụng khi truy cập và đặt hàng trên website InGiDay.',
  true,
  50
)
on conflict (slug) do nothing;

create table if not exists
public.product_slug_redirects (
  old_slug text primary key,
  product_id uuid not null
    references public.products(id)
    on delete cascade,
  created_at timestamptz not null default now(),
  check (
    old_slug = lower(btrim(old_slug))
  )
);

create index if not exists
product_slug_redirects_product_id_idx
on public.product_slug_redirects (product_id);

create or replace function
public.validate_product_slug_history()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.slug := lower(btrim(new.slug));

  if new.slug = '' then
    raise exception
      'Slug sản phẩm không được để trống.';
  end if;

  if exists (
    select 1
    from public.product_slug_redirects redirect
    where redirect.old_slug = new.slug
      and redirect.product_id <> new.id
  ) then
    raise exception
      'Slug này từng thuộc về sản phẩm khác.';
  end if;

  delete from public.product_slug_redirects
  where old_slug = new.slug
    and product_id = new.id;

  return new;
end;
$$;

create or replace function
public.capture_product_slug_redirect()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if lower(btrim(old.slug)) <>
     lower(btrim(new.slug)) then
    insert into public.product_slug_redirects (
      old_slug,
      product_id
    )
    values (
      lower(btrim(old.slug)),
      new.id
    )
    on conflict (old_slug)
    do update set
      product_id = excluded.product_id,
      created_at = now();
  end if;

  return new;
end;
$$;

drop trigger if exists
products_validate_slug_history
on public.products;

create trigger products_validate_slug_history
before insert or update of slug
on public.products
for each row
execute function
public.validate_product_slug_history();

drop trigger if exists
products_capture_slug_redirect
on public.products;

create trigger products_capture_slug_redirect
after update of slug
on public.products
for each row
execute function
public.capture_product_slug_redirect();

create or replace function
public.resolve_product_slug_redirect(
  p_old_slug text
)
returns text
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select product.slug
  from public.product_slug_redirects redirect
  join public.products product
    on product.id = redirect.product_id
  where redirect.old_slug =
    lower(btrim(coalesce(p_old_slug, '')))
    and product.status in (
      'active',
      'out_of_stock'
    )
  limit 1;
$$;

alter table public.site_policies
enable row level security;

alter table public.product_slug_redirects
enable row level security;

drop policy if exists
site_policies_public_select
on public.site_policies;

create policy site_policies_public_select
on public.site_policies
for select
to anon, authenticated
using (active = true);

drop policy if exists
site_policies_admin_all
on public.site_policies;

create policy site_policies_admin_all
on public.site_policies
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists
product_slug_redirects_public_select
on public.product_slug_redirects;

create policy product_slug_redirects_public_select
on public.product_slug_redirects
for select
to anon, authenticated
using (true);

drop policy if exists
product_slug_redirects_admin_all
on public.product_slug_redirects;

create policy product_slug_redirects_admin_all
on public.product_slug_redirects
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

grant select on public.site_policies
to anon;

grant select on public.product_slug_redirects
to anon;

grant select, insert, update, delete
on public.site_policies
to authenticated;

grant select, insert, update, delete
on public.product_slug_redirects
to authenticated;

revoke all on function
public.resolve_product_slug_redirect(text)
from public;

grant execute on function
public.resolve_product_slug_redirect(text)
to anon, authenticated;

commit;