import './globals.css';
import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "PackUp – AI Travel Planner",
  description: "AI-powered itineraries for flights, hotels, and activities",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {

return (
  <html lang="en">
    <head>
      {/* Travelpayouts verification */}
      <script
        data-noptimize="1"
        data-cfasync="false"
        data-wpfc-render="false"
        dangerouslySetInnerHTML={{
          __html: `
            (function () {
              var script = document.createElement("script");
              script.async = 1;
              script.src = 'https://tp-em.com/NDUyNzg2.js?t=452786';
              document.head.appendChild(script);
            })();
          `,
        }}
      />
    </head>
    <body>
      {/* Expose supabase client in browser console */}
      <ClientSupabaseBootstrap />
      {children}
    </body>
  </html>
);
}

