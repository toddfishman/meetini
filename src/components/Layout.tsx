import { ReactNode } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import Image from 'next/image';
import HamburgerMenu from './HamburgerMenu';

interface LayoutProps {
  children: ReactNode;
  title?: string;
}

export default function Layout({ children, title = 'Meetini' }: LayoutProps) {
  return (
    <div className="min-h-screen bg-black text-white">
      <Head>
        <title>{title}</title>
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1" />
      </Head>

      <nav className="pt-0 pb-0 px-2">
        <div className="max-w-7xl mx-auto flex justify-between items-center">
          <Link href="/" className="flex-shrink-0">
            <Image
              src="/logos/beta-logo.png"
              alt="Meetini"
              width={250}
              height={250}
              className="h-[250px] w-auto"
            />
          </Link>
          
          <div className="flex items-center">
            <HamburgerMenu />
          </div>
        </div>
      </nav>

      <main className="flex flex-col items-center p-0">
        {children}
      </main>
    </div>
  );
} 