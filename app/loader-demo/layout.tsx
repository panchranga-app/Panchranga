import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Brand Component Spec (Internal)',
  robots: {
    index: false,
    follow: false,
  },
};

export default function LoaderDemoLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
