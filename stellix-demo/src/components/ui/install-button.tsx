import { CHROME_STORE_URL } from "@/content/site";
import { LinkButton } from "./link-button";

interface InstallButtonProps {
  size?: "sm" | "md";
  className?: string;
}

// The only install path: the official Chrome Web Store listing. Before the listing is live
// (CHROME_STORE_URL is null) it says so in plain text and links nowhere.
export function InstallButton({ size = "md", className = "" }: InstallButtonProps) {
  if (CHROME_STORE_URL === null) {
    return (
      <p className={`text-sm text-muted ${className}`}>Chrome Web Store listing coming soon</p>
    );
  }
  return (
    <LinkButton href={CHROME_STORE_URL} size={size} className={className}>
      Add to Chrome
    </LinkButton>
  );
}

export const INSTALL_AVAILABLE: boolean = CHROME_STORE_URL !== null;
