import type { ComponentProps } from "react";

// Vision examples are precomputed local PNGs with explicit width and height.
export default function Image({
  unoptimized: _unoptimized,
  ...props
}: ComponentProps<"img"> & { unoptimized?: boolean }) {
  void _unoptimized;
  // eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text
  return <img {...props} />;
}
