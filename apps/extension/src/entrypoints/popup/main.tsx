import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { PopupApp } from "../../ui/screens/popup-app.js";
import "../../ui/theme.css";

const root = document.getElementById("root");
if (root === null) throw new Error("Missing #root");

createRoot(root).render(
  <StrictMode>
    <PopupApp />
  </StrictMode>,
);
