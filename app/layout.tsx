import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "VOLT Culture",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
