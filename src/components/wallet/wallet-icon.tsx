"use client";

import { useState } from "react";

type WalletIconProps = {
  icon: string;
  name: string;
  className?: string;
  glyphClassName?: string;
};

/**
 * Renders a wallet adapter icon. Adapters supply data URIs or vendor URLs,
 * so a plain <img> is used — next/image cannot optimise either without
 * remote-configuration that would break as wallets change hosts.
 */
export function WalletIcon({
  icon,
  name,
  className = "size-5",
  glyphClassName,
}: WalletIconProps) {
  const [failed, setFailed] = useState(false);
  const usable = !failed && /^(https?:|data:)/.test(icon);

  if (usable) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={icon}
        alt=""
        width={20}
        height={20}
        onError={() => setFailed(true)}
        className={`${className} object-contain`}
      />
    );
  }

  return (
    <span className={glyphClassName ?? "text-[0.8125rem] font-semibold"}>
      {name.slice(0, 1).toUpperCase()}
    </span>
  );
}
