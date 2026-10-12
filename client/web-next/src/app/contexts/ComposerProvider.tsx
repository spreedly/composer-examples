"use client";

import { Dodgeball, DodgeballApiVersion } from "@dodgeball/trust-sdk-client";
import React, { createContext, ReactNode, useContext, useEffect, useState } from "react";

interface ComposerContextState {
  sourceToken: string | null;
  clientSdk: Dodgeball | null;
  isLoading: boolean;
}

const ComposerContext = createContext<ComposerContextState | null>(null);

interface ComposerProviderProps {
  publicApiKey?: string;
  apiUrl?: string;
  children: ReactNode;
}

export const ComposerProvider: React.FC<ComposerProviderProps> = ({ children, publicApiKey, apiUrl }) => {
  const [sourceToken, setSourceToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [clientSdk, setClientSdk] = useState<Dodgeball | null>(null);

  useEffect(() => {
    const initializeClientSdk = async () => {
      if (!publicApiKey) {
        console.info("Skipping Trust Client SDK initialization because public API Key is not set");
        setClientSdk(null);
        setSourceToken(null);
        setIsLoading(false);
        return;
      }

      if (!apiUrl) {
        console.info("Skipping Trust Client SDK initialization because API URL is not set");
        setClientSdk(null);
        setSourceToken(null);
        setIsLoading(false);
        return;
      }

      const clientConfig = {
        apiVersion: DodgeballApiVersion.v1,
        apiUrl,
      };

      try {
        const clientInstance = new Dodgeball(publicApiKey, clientConfig);
        const token = await clientInstance.getSourceToken();
        setClientSdk(clientInstance);
        setSourceToken(token);
      } catch (error) {
        console.error("Error initializing Trust Client SDK", error);
        setClientSdk(null);
        setSourceToken(null);
      } finally {
        setIsLoading(false);
      }
    };

    initializeClientSdk();
  }, [publicApiKey, apiUrl]);

  return (
    <ComposerContext.Provider value={{ sourceToken, clientSdk, isLoading }}>{children}</ComposerContext.Provider>
  );
};

export const useComposerProvider = () => {
  const context = useContext(ComposerContext);
  if (!context) {
    throw new Error("useComposerProvider must be used within a ComposerProvider");
  }
  return context;
};
