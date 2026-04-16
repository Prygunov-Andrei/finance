import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "ISMeta — dev environment",
  description: "ISMeta сметный сервис, dev-окружение.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ru">
      <body
        style={{
          fontFamily:
            "system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif",
          margin: 0,
          padding: 0,
          background: "#0b0b0f",
          color: "#e6e6ea",
        }}
      >
        {children}
      </body>
    </html>
  );
}
