import { useEffect, useState } from "react";

/**
 * Renders a QR code for a URL as a PNG data URL.
 *
 * The generator is loaded in the browser only (it touches canvas-style APIs),
 * so the component renders a placeholder during SSR and swaps in the image
 * after hydration.
 */
export function QrCode({
  value,
  size = 160,
  className,
  alt,
}: {
  value: string;
  size?: number;
  className?: string;
  alt: string;
}) {
  const [src, setSrc] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    if (!value) {
      setSrc(null);
      return;
    }
    void import("qrcode")
      .then((mod) =>
        mod.default.toDataURL(value, {
          width: size * 2,
          margin: 1,
          errorCorrectionLevel: "M",
          color: { dark: "#0f172a", light: "#ffffff" },
        }),
      )
      .then((url) => {
        if (alive) setSrc(url);
      })
      .catch(() => {
        if (alive) setSrc(null);
      });
    return () => {
      alive = false;
    };
  }, [value, size]);

  if (!src) {
    return (
      <div
        className={`animate-pulse rounded-lg bg-muted ${className ?? ""}`}
        style={{ width: size, height: size }}
        aria-hidden
      />
    );
  }

  return (
    <img
      src={src}
      alt={alt}
      width={size}
      height={size}
      className={`rounded-lg bg-white p-2 ${className ?? ""}`}
      loading="lazy"
    />
  );
}
