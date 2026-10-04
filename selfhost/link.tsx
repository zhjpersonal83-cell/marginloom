import type { ComponentProps } from "react";

// The workbench only uses Link for the homepage. Navigation inside it is stateful.
export default function Link(props: ComponentProps<"a">) {
  return <a {...props} />;
}
