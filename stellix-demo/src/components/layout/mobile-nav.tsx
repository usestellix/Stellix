import { CloseIcon, MenuIcon } from "@/components/ui/icons";
import { InstallButton } from "@/components/ui/install-button";
import type { NavItem } from "@/content/site";

const MENU_ID = "site-menu";

// Native popover: Escape, light dismiss and focus return come from the browser, with no
// JavaScript. Links are plain anchors so a tap loads the page and the menu closes with it.
export function MobileNav({ items }: { items: readonly NavItem[] }) {
  return (
    <>
      <button
        type="button"
        popoverTarget={MENU_ID}
        aria-label="Menu"
        className="press inline-flex size-10 items-center justify-center rounded-control text-ink hover:bg-fill-strong md:hidden"
      >
        <MenuIcon size={20} />
      </button>
      <div id={MENU_ID} popover="auto" className="nav-sheet md:hidden">
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium text-muted">Menu</p>
          <button
            type="button"
            popoverTarget={MENU_ID}
            popoverTargetAction="hide"
            aria-label="Close menu"
            className="press inline-flex size-10 items-center justify-center rounded-control text-ink hover:bg-fill-strong"
          >
            <CloseIcon size={20} />
          </button>
        </div>
        <nav aria-label="Main" className="mt-2">
          <ul className="flex flex-col">
            {items.map((item) => (
              <li key={item.href}>
                <a
                  href={item.href}
                  className="block rounded-control px-3 py-3 text-lead font-medium text-ink hover:bg-fill"
                >
                  {item.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>
        <div className="mt-4 border-t border-line pt-4">
          <InstallButton className="w-full" />
        </div>
      </div>
    </>
  );
}
