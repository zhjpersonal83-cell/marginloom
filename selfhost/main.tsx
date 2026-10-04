import { createRoot } from "react-dom/client";
import Workbench from "../app/workbench";
import "../app/globals.css";

const initialView = location.pathname.replace(/^\/+|\/+$/g, "") || "overview";
createRoot(document.getElementById("root")!).render(
  <Workbench initialView={initialView} />,
);
