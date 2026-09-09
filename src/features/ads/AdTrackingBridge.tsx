import { useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";

import { useAdTracking } from "./AdTrackingContext";

export default function AdTrackingBridge() {
  const location = useLocation();
  const { trackPageView } = useAdTracking();
  const lastPageKeyRef = useRef("");

  useEffect(() => {
    const path = `${location.pathname}${location.search}`;

    if (/^\/san-pham\/[^/]+\/?$/.test(location.pathname)) {
      return;
    }

    if (lastPageKeyRef.current === path) {
      return;
    }

    lastPageKeyRef.current = path;
    void trackPageView({ path });
  }, [location.pathname, location.search, trackPageView]);

  return null;
}
