import Workbench from "../workbench";
import { notFound } from "next/navigation";
const views = [
  "overview",
  "evaluation",
  "data",
  "playground",
  "vision",
  "review",
  "monitoring",
  "developers",
  "settings",
  "about",
];
export default async function Page({
  params,
}: {
  params: Promise<{ view: string }>;
}) {
  const { view } = await params;
  if (!views.includes(view)) notFound();
  return <Workbench initialView={view} />;
}
