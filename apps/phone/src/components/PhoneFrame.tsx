import { BatteryFull, Signal, Wifi } from "lucide-react";
import type { ReactNode } from "react";

export const SCREEN_W = 390;
export const SCREEN_H = 844;
const BEZEL = 12;

/**
 * Desktop: a device frame, scaled to fit the viewport height so the whole
 * screen is visible on a projector. Compact (a real phone): no frame at all.
 */
export function PhoneFrame({ compact, maxHeight, children }: { compact: boolean; maxHeight: number; children: ReactNode }) {
  if (compact) {
    return (
      <div className="relative h-dvh w-full overflow-hidden bg-harbor-900" style={{ paddingTop: "env(safe-area-inset-top)" }}>
        {children}
      </div>
    );
  }

  const outerW = SCREEN_W + BEZEL * 2;
  const outerH = SCREEN_H + BEZEL * 2;
  const scale = Math.min(1, maxHeight / outerH);

  return (
    <div style={{ width: outerW * scale, height: outerH * scale }} className="shrink-0">
      <div
        className="relative origin-top-left rounded-[64px] bg-[#39353e] p-3 shadow-[0_40px_120px_-20px_rgba(0,0,0,0.8),0_0_0_1.5px_#817684,inset_0_0_0_1.5px_#121014]"
        style={{ width: outerW, height: outerH, transform: `scale(${scale})` }}
        data-testid="phone-frame"
      >
        <div className="relative h-full w-full overflow-hidden rounded-[52px] bg-harbor-900">
          <StatusBar />
          {/* dynamic island */}
          <div className="pointer-events-none absolute left-1/2 top-[11px] z-50 h-[34px] w-[122px] -translate-x-1/2 rounded-full bg-black" />
          <div className="absolute inset-0 pt-[52px]">{children}</div>
        </div>
      </div>
    </div>
  );
}

function StatusBar() {
  return (
    <div className="absolute inset-x-0 top-0 z-40 flex h-[52px] items-center justify-between px-8 pt-1 text-[15px] font-semibold text-ink">
      <span className="tabular w-14">9:41</span>
      <span className="flex items-center gap-1.5">
        <Signal size={16} strokeWidth={2.6} aria-hidden />
        <Wifi size={16} strokeWidth={2.6} aria-hidden />
        <BatteryFull size={22} strokeWidth={2} aria-hidden />
      </span>
    </div>
  );
}

