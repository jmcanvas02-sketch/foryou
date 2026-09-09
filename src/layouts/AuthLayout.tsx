import { Outlet } from "react-router-dom";

export default function AuthLayout() {
  return (
    <div className="grid min-h-screen place-items-center bg-[#f7f9ff] p-5">
      <Outlet />
    </div>
  );
}
