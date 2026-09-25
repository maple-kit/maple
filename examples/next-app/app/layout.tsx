import "./page.css";

import { MockBox } from "./mock-box";

export const metadata = { title: "Maple example: Next" };

export default function RootLayout({ children }: { readonly children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        {children}
        <MockBox />
      </body>
    </html>
  );
}
