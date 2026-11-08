import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "OpenRoster Kiosk",
  manifest: "/manifest-kiosk.webmanifest",
  appleWebApp: { capable: true, statusBarStyle: "black-translucent", title: "OpenRoster Kiosk" },
};

export const viewport: Viewport = {
  themeColor: "#1d211c",
};

export default function KioskLayout({ children }: { children: ReactNode }) {
  return children;
}
