import { useOnlineStatus } from "../../hooks/useOnlineStatus";

export default function NetworkNotice() {
  const online = useOnlineStatus();

  if (online) {
    return null;
  }

  return (
    <div
      role="status"
      className="fixed inset-x-3 bottom-3 z-[100] mx-auto max-w-lg rounded-2xl bg-[#203243] px-5 py-3 text-center text-sm font-bold text-white shadow-2xl"
    >
      Bạn đang mất kết nối mạng. Giỏ hàng vẫn được giữ
      trên thiết bị.
    </div>
  );
}