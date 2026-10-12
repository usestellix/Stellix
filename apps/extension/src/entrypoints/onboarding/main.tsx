import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { OnboardingPlaceholderScreen } from "../../ui/screens/onboarding-placeholder-screen.js";
import "../../ui/theme.css";

const root = document.getElementById("root");
if (root === null) throw new Error("Missing #root");

createRoot(root).render(
  <StrictMode>
    <OnboardingPlaceholderScreen />
  </StrictMode>,
);
