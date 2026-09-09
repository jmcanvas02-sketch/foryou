import type { StoreOrder } from "../../../types/store";

type OrderPreparationSlipProps = {
  order: StoreOrder;
};

export default function OrderPreparationSlip({
  order,
}: OrderPreparationSlipProps) {
  return (
    <article className="order-preparation-page box-border bg-white px-[2mm] py-[2mm] text-[#111]">
      <header className="border-b-2 border-black pb-3 text-center">
        <h2 className="text-[18px] font-black uppercase leading-[1.05]">
          Phiếu chuẩn bị đơn
        </h2>
      </header>

      <section className="mt-4 border-b-2 border-black pb-4">
        <p className="text-[11px] font-bold uppercase">Khách hàng</p>
        <p className="mt-1 text-[18px] font-black leading-[1.1]">
          {order.customer.fullName}
        </p>
      </section>

      <section className="mt-4">
        <p className="mb-2 text-[11px] font-bold uppercase">Sản phẩm</p>

        <div className="divide-y-2 divide-black">
          {order.items.map((item, itemIndex) => (
            <div
              key={item.key}
              className="py-3 first:pt-0 last:pb-0"
            >
              <p className="text-[18px] font-black leading-[1.1]">
                {itemIndex + 1}. {item.name}
              </p>

              {item.selectedVariants?.map((variant, variantIndex) => (
                <p
                  key={`${variant.groupName}-${variant.optionLabel}-${variantIndex}`}
                  className="mt-1.5 text-[18px] font-black leading-[1.1]"
                >
                  {variant.groupName}: {variant.optionLabel}
                </p>
              ))}
            </div>
          ))}
        </div>
      </section>
    </article>
  );
}