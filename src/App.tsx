import { Suspense } from "react";
import { RouterProvider } from "react-router-dom";

import NetworkNotice from "./components/common/NetworkNotice";
import { AdTrackingProvider } from "./features/ads/AdTrackingContext";
import { AdminAuthProvider } from "./features/admin/AdminAuthContext";
import { BannersProvider } from "./features/banners/BannersContext";
import { CartProvider } from "./features/cart/CartContext";
import { CouponsProvider } from "./features/coupons/CouponsContext";
import { CustomersProvider } from "./features/customers/CustomersContext";
import { OrdersProvider } from "./features/orders/OrdersContext";
import { SettingsProvider } from "./features/settings/SettingsContext";
import { router } from "./router";

function AppLoading() {
  return (
    <main className="grid min-h-[50vh] place-items-center px-5">
      <div className="text-center">
        <div className="mx-auto h-11 w-11 animate-spin rounded-full border-4 border-[#d1e4fb] border-t-[#006397]" />
        <p className="mt-4 font-semibold text-[#3f4850]">
          Đang mở InGiDay...
        </p>
      </div>
    </main>
  );
}

export default function App() {
  return (
    <AdminAuthProvider>
      <SettingsProvider>
        <CouponsProvider>
          <BannersProvider>
            <OrdersProvider>
              <CustomersProvider>
                <AdTrackingProvider>
                  <CartProvider>
                    <NetworkNotice />
                  <Suspense fallback={<AppLoading />}>
                    <RouterProvider router={router} />
                  </Suspense>
                  </CartProvider>
                </AdTrackingProvider>
              </CustomersProvider>
            </OrdersProvider>
          </BannersProvider>
        </CouponsProvider>
      </SettingsProvider>
    </AdminAuthProvider>
  );
}