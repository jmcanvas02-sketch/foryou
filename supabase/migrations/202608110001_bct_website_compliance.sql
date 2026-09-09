-- InGiDay - legal identity fields for website e-commerce compliance.
-- This migration only extends store_settings.
-- It intentionally does NOT populate real household-business identity data.
-- The owner will enter legal values later from the Admin settings page.

alter table public.store_settings
  add column if not exists legal_business_name text,
  add column if not exists business_owner_name text,
  add column if not exists tax_code text,
  add column if not exists business_registration_number text,
  add column if not exists business_registration_date date,
  add column if not exists business_registration_place text;

comment on column public.store_settings.legal_business_name is
  'Registered legal name of the merchant/household business shown on the storefront.';

comment on column public.store_settings.business_owner_name is
  'Registered household-business owner or legal representative name.';

comment on column public.store_settings.tax_code is
  'Merchant/household-business tax identification number.';

comment on column public.store_settings.business_registration_number is
  'Business/household-business registration certificate number when applicable.';

comment on column public.store_settings.business_registration_date is
  'Issue date of the business/household-business registration certificate.';

comment on column public.store_settings.business_registration_place is
  'Issuing authority/place of the business/household-business registration certificate.';

-- BCT_POLICY_NORMALIZATION_V1
-- Normalize the five public storefront policies before the website-notification filing.
-- This migration is not applied yet. It is safe to edit because it is a new, unapplied migration.
-- Real merchant identity values are intentionally not hard-coded here.

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

Phí vận chuyển được hiển thị trong phần tóm tắt đơn hàng trước khi khách hàng xác nhận đặt hàng. Nếu đơn hàng đạt mức miễn phí vận chuyển đang được website công bố, hệ thống sẽ tự động áp dụng.

## Thời gian xử lý

Sản phẩm có sẵn được chuẩn bị và bàn giao cho đơn vị vận chuyển trong thời gian phù hợp với tình trạng đơn hàng. Với sản phẩm in riêng hoặc cần sản xuất thêm, InGiDay sẽ trao đổi thời gian dự kiến với khách hàng.

## Thông tin nhận hàng

Khách hàng cần cung cấp chính xác họ tên, số điện thoại và địa chỉ nhận hàng. InGiDay có thể liên hệ để xác nhận lại khi thông tin chưa đầy đủ hoặc có dấu hiệu nhầm lẫn.

## Theo dõi và sự cố giao hàng

Khi đơn giao chậm, thất lạc hoặc kiện hàng có dấu hiệu hư hỏng, khách hàng có thể liên hệ InGiDay qua các kênh được công bố trên website để được phối hợp kiểm tra với đơn vị vận chuyển.

## Kiểm tra khi nhận hàng

Khách hàng nên kiểm tra tình trạng bên ngoài của kiện hàng và sản phẩm ngay khi nhận. Nếu phát hiện giao sai, thiếu, hư hỏng hoặc bất thường, khách hàng nên lưu lại hình ảnh hoặc video để hỗ trợ việc xác minh.
$policy$,
  'Chính sách giao hàng | InGiDay',
  'Thông tin phạm vi giao hàng, phí vận chuyển, xử lý đơn và sự cố giao nhận tại InGiDay.',
  true,
  10
),
(
  'chinh-sach-doi-tra',
  'Chính sách đổi trả',
  $policy$
## Trường hợp được hỗ trợ

InGiDay tiếp nhận yêu cầu đổi trả hoặc phương án hỗ trợ phù hợp khi sản phẩm giao sai mẫu, sai số lượng, thiếu phụ kiện, hư hỏng trong quá trình vận chuyển hoặc có lỗi sản xuất được xác minh.

## Điều kiện sản phẩm

Khách hàng nên giữ sản phẩm và phụ kiện liên quan ở hiện trạng phù hợp để InGiDay có thể kiểm tra nguyên nhân. Hình ảnh hoặc video khi mở kiện có thể giúp quá trình xác minh nhanh hơn.

## Sản phẩm in riêng

Sản phẩm được làm theo nội dung, kích thước, màu sắc hoặc yêu cầu riêng không áp dụng đổi trả chỉ vì thay đổi sở thích sau khi sản phẩm đã được thực hiện đúng nội dung hai bên xác nhận. InGiDay vẫn hỗ trợ nếu sản phẩm không đúng nội dung đã xác nhận hoặc có lỗi sản xuất.

## Cách gửi yêu cầu

Khách hàng liên hệ InGiDay qua các kênh được công bố trên website và cung cấp mã đơn, mô tả tình trạng cùng hình ảnh hoặc video liên quan. InGiDay sẽ kiểm tra và phản hồi phương án xử lý phù hợp với tình trạng thực tế.

## Chi phí đổi trả

Nếu nguyên nhân được xác định thuộc về InGiDay hoặc phát sinh từ quá trình vận chuyển mà InGiDay chịu trách nhiệm phối hợp xử lý, InGiDay sẽ chịu chi phí xử lý hợp lý. Trường hợp khác, chi phí phát sinh sẽ được trao đổi với khách hàng trước khi thực hiện.
$policy$,
  'Chính sách đổi trả | InGiDay',
  'Điều kiện, quy trình và chi phí hỗ trợ đổi trả sản phẩm tại InGiDay.',
  true,
  20
),
(
  'chinh-sach-bao-hanh',
  'Chính sách bảo hành',
  $policy$
## Phạm vi bảo hành

Sản phẩm được bảo hành theo thông tin công bố tại trang chi tiết sản phẩm hoặc nội dung InGiDay đã xác nhận với khách hàng khi đặt hàng.

## Trường hợp được hỗ trợ

InGiDay tiếp nhận các lỗi phát sinh từ quá trình sản xuất, lắp ráp hoặc vật liệu trong điều kiện sử dụng thông thường và sẽ đánh giá phương án sửa chữa, thay thế hoặc hỗ trợ phù hợp.

## Trường hợp không áp dụng

Bảo hành không áp dụng đối với hư hỏng do va đập mạnh, nhiệt độ cao, hóa chất, ngâm nước, sử dụng sai mục đích, tự ý sửa đổi sản phẩm hoặc các nguyên nhân bên ngoài không thuộc lỗi sản xuất.

## Quy trình yêu cầu bảo hành

Khách hàng liên hệ InGiDay qua các kênh được công bố trên website, cung cấp mã đơn cùng hình ảnh hoặc video mô tả tình trạng. Sau khi kiểm tra, InGiDay sẽ phản hồi phương án xử lý.

## Sản phẩm không công bố thời hạn bảo hành riêng

Với sản phẩm không ghi thời hạn bảo hành cụ thể, InGiDay vẫn tiếp nhận phản hồi và xem xét hỗ trợ tùy theo tình trạng thực tế và nguyên nhân của vấn đề.
$policy$,
  'Chính sách bảo hành | InGiDay',
  'Phạm vi, trường hợp áp dụng và quy trình hỗ trợ bảo hành sản phẩm InGiDay.',
  true,
  30
),
(
  'chinh-sach-bao-mat',
  'Chính sách bảo mật',
  $policy$
## Thông tin được thu thập

InGiDay thu thập những thông tin cần thiết để xử lý đơn hàng và hỗ trợ khách hàng, có thể bao gồm họ tên, số điện thoại, địa chỉ nhận hàng, nội dung ghi chú, thông tin đơn hàng và lịch sử giao dịch trên hệ thống.

## Mục đích sử dụng

Thông tin được sử dụng để tạo và xác nhận đơn hàng, giao hàng, liên hệ hỗ trợ, xử lý đổi trả hoặc bảo hành, phòng chống đơn giả, bảo đảm an toàn hệ thống và thực hiện nghĩa vụ theo quy định pháp luật.

## Phạm vi chia sẻ

InGiDay chỉ chia sẻ dữ liệu trong phạm vi cần thiết với đơn vị vận chuyển, nhà cung cấp hạ tầng hoặc dịch vụ hỗ trợ hoạt động website, và cơ quan nhà nước có thẩm quyền khi pháp luật yêu cầu. InGiDay không bán thông tin cá nhân của khách hàng.

## Thời gian lưu trữ

Thông tin được lưu trong thời gian cần thiết để thực hiện giao dịch, hỗ trợ khách hàng, giải quyết vấn đề liên quan đến đơn hàng và đáp ứng nghĩa vụ lưu trữ theo quy định áp dụng.

## Bảo vệ dữ liệu

Website áp dụng các biện pháp kỹ thuật và quản trị phù hợp để hạn chế truy cập trái phép, mất mát hoặc sử dụng sai mục đích. Khách hàng không nên nhập thông tin nhạy cảm không cần thiết vào phần ghi chú đơn hàng.

## Yêu cầu liên quan đến dữ liệu cá nhân

Khách hàng có thể liên hệ InGiDay qua các kênh được công bố trên website để hỏi về thông tin cá nhân, yêu cầu cập nhật hoặc đề nghị xử lý dữ liệu trong phạm vi quyền và nghĩa vụ do pháp luật quy định.
$policy$,
  'Chính sách bảo mật | InGiDay',
  'Thông tin về việc thu thập, sử dụng, chia sẻ, lưu trữ và bảo vệ dữ liệu khách hàng tại InGiDay.',
  true,
  40
),
(
  'dieu-khoan-su-dung',
  'Điều khoản sử dụng',
  $policy$
## Phạm vi áp dụng

Điều khoản này áp dụng khi khách hàng truy cập, tìm hiểu sản phẩm hoặc đặt hàng trên website InGiDay. Khi đặt hàng, khách hàng xác nhận đã đọc các thông tin sản phẩm, giá và chính sách liên quan đang được công bố.

## Thông tin người bán

Thông tin pháp lý, địa chỉ và các kênh liên hệ của chủ sở hữu website được công bố tại chân trang hoặc khu vực thông tin liên hệ của website. Khách hàng có thể sử dụng các kênh này khi cần hỗ trợ hoặc phản ánh.

## Thông tin sản phẩm và giá

InGiDay cố gắng trình bày chính xác hình ảnh, mô tả, lựa chọn, giá và các thông tin liên quan đến sản phẩm. Sản phẩm in 3D có thể có vân lớp, sai khác nhỏ về màu sắc hoặc bề mặt do đặc trưng của quá trình sản xuất và điều kiện hiển thị.

Giá thanh toán được xác định theo cấu hình sản phẩm, số lượng, ưu đãi và phí vận chuyển được hiển thị trong quá trình đặt hàng trước khi khách hàng xác nhận.

## Xác nhận đơn hàng

Đơn hàng được ghi nhận khi hệ thống tạo mã đơn thành công. InGiDay có thể liên hệ để xác minh thông tin nhận hàng, yêu cầu in riêng, số lượng lớn hoặc các chi tiết cần làm rõ trước khi sản xuất và giao hàng.

## Phương thức thanh toán

Website hiện hỗ trợ thanh toán khi nhận hàng (COD). Khách hàng thanh toán số tiền của đơn hàng theo thông tin được xác nhận và hướng dẫn giao nhận tại thời điểm nhận hàng.

## Giao hàng, đổi trả và bảo hành

Các điều kiện về giao hàng, đổi trả và bảo hành được công bố tại các trang chính sách tương ứng trên website và là một phần của điều kiện giao dịch.

## Tiếp nhận khiếu nại và giải quyết tranh chấp

Khách hàng có thể gửi phản ánh hoặc khiếu nại cho InGiDay qua số điện thoại, email, Messenger hoặc các kênh liên hệ đang được công bố trên website. Khách hàng nên cung cấp mã đơn và tài liệu liên quan để việc xác minh được thuận lợi.

InGiDay sẽ tiếp nhận, kiểm tra thông tin và ưu tiên giải quyết bằng trao đổi, thương lượng trên cơ sở giao dịch thực tế và quy định pháp luật. Nếu các bên không thể thống nhất, mỗi bên có quyền sử dụng cơ chế giải quyết tranh chấp hoặc yêu cầu cơ quan có thẩm quyền xử lý theo quy định pháp luật Việt Nam.

## Hành vi không được chấp nhận

Không được lợi dụng website để tạo đơn giả, can thiệp trái phép vào hệ thống, sử dụng nội dung trái pháp luật hoặc thực hiện hành vi gây ảnh hưởng đến quyền, lợi ích hợp pháp của InGiDay, khách hàng hoặc bên thứ ba.

## Thay đổi điều khoản

InGiDay có thể cập nhật điều khoản để phản ánh hoạt động thực tế hoặc yêu cầu pháp luật. Phiên bản đang được công bố trên website được áp dụng đối với việc sử dụng website và giao dịch phát sinh tại thời điểm tương ứng.
$policy$,
  'Điều khoản sử dụng | InGiDay',
  'Điều khoản đặt hàng, thanh toán COD, chính sách giao dịch và giải quyết khiếu nại tại InGiDay.',
  true,
  50
)
on conflict (slug) do update
set
  title = excluded.title,
  content = excluded.content,
  seo_title = excluded.seo_title,
  seo_description = excluded.seo_description,
  active = excluded.active,
  sort_order = excluded.sort_order;