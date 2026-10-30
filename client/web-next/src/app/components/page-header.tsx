"use client";
import { FC } from "react";

interface PageHeaderProps {
  apiUrl: string;
}

export const PageHeader: FC<PageHeaderProps> = ({ apiUrl }) => {
  return (<div className="header-container">
    <p>Composer API: {apiUrl ?? "Default"}</p>
    <p>This example uses the Composer Client SDK. You can use it to call checkpoints and pass in arbitrary event data. Use it to experiment!</p>
  </div>)
};
