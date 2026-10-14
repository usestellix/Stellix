import type { SVGProps } from "react";

// One small icon set: 20px grid, 1.5px stroke, round caps, currentColor. Drawn for Stellix; no
// emoji (they render differently on every OS) and no icon font.

type IconProps = Omit<SVGProps<SVGSVGElement>, "children"> & { size?: number };

function Icon({ size = 16, children, ...props }: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...props}
    >
      {children}
    </svg>
  );
}

export function LockIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <rect x="4.25" y="8.75" width="11.5" height="8" rx="2" />
      <path d="M6.75 8.75V6.5a3.25 3.25 0 0 1 6.5 0v2.25" />
    </Icon>
  );
}

export function AlertIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="10" cy="10" r="7.25" />
      <path d="M10 6.5v4" />
      <path d="M10 13.5h.01" strokeWidth={2} />
    </Icon>
  );
}

export function EyeIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M2.5 10s2.75-5 7.5-5 7.5 5 7.5 5-2.75 5-7.5 5-7.5-5-7.5-5Z" />
      <circle cx="10" cy="10" r="2.25" />
    </Icon>
  );
}

export function EyeOffIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M8.2 5.2A7.6 7.6 0 0 1 10 5c4.75 0 7.5 5 7.5 5a13 13 0 0 1-1.9 2.5" />
      <path d="M5.1 6.6C3.4 7.9 2.5 10 2.5 10s2.75 5 7.5 5c1.2 0 2.3-.3 3.2-.8" />
      <path d="M8.4 8.4a2.25 2.25 0 0 0 3.2 3.2" />
      <path d="M3 3l14 14" />
    </Icon>
  );
}

export function ArrowLeftIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M15.5 10h-11" />
      <path d="M9 5.5 4.5 10 9 14.5" />
    </Icon>
  );
}

export function CheckIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="m4.5 10.5 3.5 3.5 7.5-8" />
    </Icon>
  );
}

export function ShieldIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M10 2.75 4.25 5v4.6c0 3.6 2.4 6.3 5.75 7.65 3.35-1.35 5.75-4.05 5.75-7.65V5L10 2.75Z" />
    </Icon>
  );
}

/** Settings: sliders (a sun-like cog read as "brightness" in review). */
export function GearIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M3.5 6h6.25M13.75 6h2.75M3.5 14h2.75M10.25 14h6.25" />
      <circle cx="11.75" cy="6" r="2" />
      <circle cx="8.25" cy="14" r="2" />
    </Icon>
  );
}

export function ChevronRightIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="m8 5 5 5-5 5" />
    </Icon>
  );
}

export function ChevronDownIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="m5 8 5 5 5-5" />
    </Icon>
  );
}

export function InfoIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="10" cy="10" r="7.25" />
      <path d="M10 9v4.5" />
      <path d="M10 6.5h.01" strokeWidth={2} />
    </Icon>
  );
}

export function PlusIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M10 4.5v11M4.5 10h11" />
    </Icon>
  );
}

export function PencilIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="m12.5 4.5 3 3L7.25 15.75H4.25v-3L12.5 4.5Z" />
    </Icon>
  );
}

export function ExternalIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M11.5 4.25h4.25V8.5M15.5 4.5 9 11" />
      <path d="M13.75 11.5v3.25a1 1 0 0 1-1 1h-7.5a1 1 0 0 1-1-1v-7.5a1 1 0 0 1 1-1H8.5" />
    </Icon>
  );
}

export function RefreshIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M15.75 10a5.75 5.75 0 1 1-1.7-4.08" />
      <path d="M15.75 3.75v3.5h-3.5" />
    </Icon>
  );
}
