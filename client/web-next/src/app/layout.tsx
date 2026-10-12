import type { Metadata } from "next";
import { CheckpointStateProvider } from "./contexts/CheckpointStateProvider";
import { ComposerProvider } from "./contexts/ComposerProvider";
import { envOr } from "./env";
import "./globals.css";
export const metadata: Metadata = {
  title: "Client/Next.js | Composer Examples",
  description: "This example demonstrates how to use the Trust Client SDK with Next.js.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const publicApiKey =
    envOr("NEXT_PUBLIC_DODGEBALL_PUBLIC_API_KEY", "NEXT_PUBLIC_SPREEDLY_PUBLIC_API_KEY") ??
    "UNSET_PUBLIC_API_KEY";
  const apiUrl = envOr("NEXT_PUBLIC_DODGEBALL_API_URL", "NEXT_PUBLIC_SPREEDLY_API_URL");
  return (
    <html lang="en">
      <body suppressHydrationWarning={true}>
        <CheckpointStateProvider>
          <ComposerProvider publicApiKey={publicApiKey} apiUrl={apiUrl}>
            {children}
          </ComposerProvider>
        </CheckpointStateProvider>
      </body>
    </html>
  );
}
