import { useEffect, useState } from "react";

/** Below this width the app runs full-screen (a real phone), no device frame. */
export const COMPACT_MAX_WIDTH = 500;

export function useViewport() {
  const read = () => ({
    width: typeof window === "undefined" ? 1440 : window.innerWidth,
    height: typeof window === "undefined" ? 900 : window.innerHeight,
  });
  const [size, setSize] = useState(read);
  useEffect(() => {
    const onResize = () => setSize(read());
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);
  return { ...size, compact: size.width < COMPACT_MAX_WIDTH };
}
