import Script from 'next/script';
import ClientSupabaseBootstrap from './components/ClientSupabaseBootstrap';
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
      {/* Attach Supabase client to window for console testing (guarded by env flag) */}
      {process.env.NEXT_PUBLIC_EXPOSE_SUPABASE_IN_WINDOW === '1' && (
        <Script id="supabase-bootstrap" strategy="afterInteractive" type="module"
          dangerouslySetInnerHTML={{
            __html: `
              import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
              const url = '${process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''}';
              const anon = '${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? ''}';
              if (url && anon) {
                const supabase = createClient(url, anon);
                window.supabase = supabase;
                // touch once so session warms
                supabase.auth.getSession().catch(()=>{});
                console.log('[PackUp] window.supabase ready');
              } else {
                console.warn('[PackUp] Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY');
              }
            `,
          }}
        />
      )}
      {children}
    </body>
  </html>
);
}

