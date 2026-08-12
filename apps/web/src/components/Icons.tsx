import type { SVGProps } from 'react';

const common = { width: 24, height: 24, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, 'aria-hidden': true };

export function ShieldIcon(props: SVGProps<SVGSVGElement>) {
  return <svg {...common} {...props}><path d="M12 2.8 19 5.7v5.6c0 4.6-2.8 8.1-7 9.9-4.2-1.8-7-5.3-7-9.9V5.7L12 2.8Z" /><path d="m8.8 11.8 2.1 2.1 4.5-4.7" /></svg>;
}

export function CheckIcon(props: SVGProps<SVGSVGElement>) {
  return <svg {...common} {...props}><path d="m5 12 4 4L19 6" /></svg>;
}

export function XIcon(props: SVGProps<SVGSVGElement>) {
  return <svg {...common} {...props}><path d="m6.5 6.5 11 11m0-11-11 11" /></svg>;
}

export function WalletIcon(props: SVGProps<SVGSVGElement>) {
  return <svg {...common} {...props}><path d="M4 7.2h15.5v11H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h12" /><path d="M15 10.2h6v5h-6a2.5 2.5 0 0 1 0-5Z" /></svg>;
}
