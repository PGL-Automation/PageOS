import type { Metadata } from "next";
import { Providers } from "@/lib/api/provider";
import { AuthProvider } from "@/lib/auth";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/toast";
import { ThemeProvider } from "@/components/theme-provider";
import { PositionProvider } from "@/lib/position";
import "./globals.css";
import { Geist } from "next/font/google";
import { cn } from "@/lib/utils";

const geist = Geist({ subsets: ["latin"], variable: "--font-sans" });

export const metadata: Metadata = {
  title: "PageOS",
  description: "Page Group operating system",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={cn("font-sans", geist.variable)}>
      <body>
        <ThemeProvider>
          <Providers>
            <AuthProvider>
              <PositionProvider>
                <TooltipProvider>
                  {children}
                </TooltipProvider>
              </PositionProvider>
            </AuthProvider>
          </Providers>
          {/* Toaster must be outside AuthProvider so it renders even during auth flows */}
          <Toaster />
        </ThemeProvider>
      </body>
    </html>
  );
}
