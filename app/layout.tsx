import type { Metadata } from "next";
import { Hanken_Grotesk, Space_Grotesk, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { NavBar } from "./components/NavBar";

const hanken = Hanken_Grotesk({
  subsets: ["latin"],
  weight: ["600", "700", "800", "900"],
  variable: "--font-hanken",
});

const space = Space_Grotesk({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
  variable: "--font-space",
});

const mono = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["300", "400", "500", "700"],
  variable: "--font-mono",
});

export const metadata: Metadata = {
  title: "BetBot Simulator",
  description: "AI-powered sports betting simulator",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr" suppressHydrationWarning>
      <head>
        {/* Set theme before first paint to prevent flash */}
        <script
          dangerouslySetInnerHTML={{
            __html: `try{var t=localStorage.getItem('bb-theme')||'dark';document.documentElement.setAttribute('data-theme',t);}catch(e){}`,
          }}
        />
      </head>
      <body className={`${hanken.variable} ${space.variable} ${mono.variable}`} suppressHydrationWarning>
        <NavBar />
        {children}
      </body>
    </html>
  );
}
