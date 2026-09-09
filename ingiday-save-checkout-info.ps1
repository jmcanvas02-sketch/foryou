$ErrorActionPreference = "Stop"

$projectRoot = "D:\IN 3D\WEB\ingiday"
$checkoutPath = Join-Path $projectRoot "src\pages\shop\CheckoutPage.tsx"

if (-not (Test-Path $projectRoot)) {
    throw "Không tìm thấy thư mục dự án: $projectRoot"
}

if (-not (Test-Path $checkoutPath)) {
    throw "Không tìm thấy file: $checkoutPath"
}

Set-Location $projectRoot

$content = Get-Content $checkoutPath -Raw -Encoding UTF8

$oldInitialBlock = @'
const initialCustomer: CheckoutCustomer = {
  fullName: "",
  phone: "",
  province: "",
  district: "",
  ward: "",
  addressDetail: "",
  note: "",
};
'@

$newInitialBlock = @'
const CHECKOUT_CUSTOMER_STORAGE_KEY = "ingiday-checkout-customer";

const initialCustomer: CheckoutCustomer = {
  fullName: "",
  phone: "",
  province: "",
  district: "",
  ward: "",
  addressDetail: "",
  note: "",
};

function readSavedCustomer(): CheckoutCustomer {
  try {
    const raw = localStorage.getItem(CHECKOUT_CUSTOMER_STORAGE_KEY);

    if (!raw) {
      return initialCustomer;
    }

    const saved = JSON.parse(raw) as Partial<CheckoutCustomer>;

    return {
      fullName: typeof saved.fullName === "string" ? saved.fullName : "",
      phone: typeof saved.phone === "string" ? saved.phone : "",
      province: typeof saved.province === "string" ? saved.province : "",
      district: typeof saved.district === "string" ? saved.district : "",
      ward: typeof saved.ward === "string" ? saved.ward : "",
      addressDetail:
        typeof saved.addressDetail === "string" ? saved.addressDetail : "",
      note: typeof saved.note === "string" ? saved.note : "",
    };
  } catch {
    return initialCustomer;
  }
}
'@

if (-not $content.Contains($oldInitialBlock)) {
    throw "Không tìm thấy khối initialCustomer để cập nhật."
}

$content = $content.Replace($oldInitialBlock, $newInitialBlock)

$oldStateLine = '  const [customer, setCustomer] = useState<CheckoutCustomer>(initialCustomer);'
$newStateLine = '  const [customer, setCustomer] = useState<CheckoutCustomer>(readSavedCustomer);'

if (-not $content.Contains($oldStateLine)) {
    throw "Không tìm thấy dòng khởi tạo customer."
}

$content = $content.Replace($oldStateLine, $newStateLine)

$addressEffectMarker = @'
  useEffect(() => {
    const controller = new AbortController();
'@

$saveEffectBlock = @'
  useEffect(() => {
    try {
      localStorage.setItem(
        CHECKOUT_CUSTOMER_STORAGE_KEY,
        JSON.stringify(customer),
      );
    } catch (storageError) {
      console.warn("Không thể lưu thông tin nhận hàng:", storageError);
    }
  }, [customer]);

  useEffect(() => {
    const controller = new AbortController();
'@

if (-not $content.Contains($addressEffectMarker)) {
    throw "Không tìm thấy vị trí để thêm chức năng tự lưu."
}

$content = $content.Replace($addressEffectMarker, $saveEffectBlock)

[System.IO.File]::WriteAllText(
    $checkoutPath,
    $content,
    [System.Text.UTF8Encoding]::new($false)
)

Write-Host "Đã thêm tự lưu thông tin nhận hàng." -ForegroundColor Green
Write-Host "Giỏ hàng tiếp tục dùng localStorage hiện có: ingiday-cart" -ForegroundColor Green
Write-Host "Đang kiểm tra build..." -ForegroundColor Cyan

npm run build

if ($LASTEXITCODE -ne 0) {
    throw "Build thất bại. Chưa hoàn tất bản sửa."
}

Write-Host ""
Write-Host "HOÀN TẤT LƯU THÔNG TIN KHÁCH VÀ GIỎ HÀNG" -ForegroundColor Green
