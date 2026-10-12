'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';

interface NavbarProps {
  searchQuery?: string;
  onSearchChange?: (query: string) => void;
}

const TRENDING_TOPICS = [
  'Artificial Intelligence',
  'Supreme Court',
  'Election Commission',
  'RBI GDP Growth',
  'India-US Relations',
  'IPL 2026',
  'Climate & Monsoons',
  'Modi Government',
  'Kashmir',
  'Farmer Protests',
  'Startup India',
  'Judiciary',
];

export default function Navbar({
  searchQuery,
  onSearchChange,
}: NavbarProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const qFromUrl = searchParams.get('q') || '';
  const [internalQuery, setInternalQuery] = useState(
    searchQuery !== undefined ? searchQuery : qFromUrl
  );
  const activeTopic = searchParams.get('topic') || '';

  useEffect(() => {
    if (searchQuery !== undefined) {
      setInternalQuery(searchQuery);
    } else {
      setInternalQuery(qFromUrl);
    }
  }, [searchQuery, qFromUrl]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (internalQuery.trim()) {
      router.push(`/?q=${encodeURIComponent(internalQuery.trim())}`);
    } else {
      router.push('/');
    }
  };

  const handleSearchInputChange = (q: string) => {
    setInternalQuery(q);
    if (onSearchChange) {
      onSearchChange(q);
    }
  };

  const handleTrendingClick = (topic: string) => {
    setInternalQuery(topic);
    router.push(`/?q=${encodeURIComponent(topic)}`);
  };

  const handleSubscribeClick = () => {
    const el = document.getElementById('newsletter-footer');
    if (el) {
      el.scrollIntoView({ behavior: 'smooth' });
      const emailInput = el.querySelector('input[type="email"]');
      if (emailInput instanceof HTMLElement) {
        emailInput.focus();
      }
    } else {
      router.push('/#newsletter-footer');
    }
  };

  return (
    <header className="w-full bg-white z-50">
      {/* SECTION 1 — Top Announcement Banner */}
      <div className="w-full bg-[#8B7355] h-[44px] px-4 sm:px-8 flex items-center justify-between text-white font-sans text-sm">
        <div className="flex-1 text-center font-medium text-[14px]">
          See every color of every Indian news story — Panchranga
        </div>
        <button
          onClick={() => router.push('/about')}
          className="hidden sm:inline-flex items-center justify-center bg-white text-[#1A1A1A] px-4 py-1.5 rounded text-[13px] font-semibold hover:bg-gray-100 transition-colors shrink-0"
        >
          Get Started →
        </button>
      </div>

      {/* SECTION 2 — Navbar */}
      <div className="w-full bg-white border-b border-[#E5E5E0] h-[60px] px-4 sm:px-8 flex items-center justify-between">
        {/* LEFT: Panchranga wordmark & tagline */}
        <Link href="/" className="flex flex-col shrink-0 group">
          <span className="font-sans text-[22px] font-extrabold text-[#1A1A1A] tracking-[-0.5px] leading-none group-hover:text-[#C0392B] transition-colors">
            Panchranga
          </span>
          <div className="flex items-center gap-1.5 mt-1">
            <span className="font-['Noto_Serif_Devanagari',serif] text-[11px] text-[#9CA3AF] leading-none">
              पंचरंग
            </span>
            <span className="text-[#D1D5DB] text-[10px] leading-none">·</span>
            <span className="font-sans text-[9px] text-[#9CA3AF] tracking-[0.15em] uppercase leading-none">
              EVERY COLOR OF THE STORY
            </span>
          </div>
        </Link>

        {/* CENTER (desktop only, hidden on mobile): Nav links */}
        <nav className="hidden md:flex items-center gap-[32px] font-sans text-[14px] text-[#1A1A1A]">
          <Link
            href="/"
            className={`py-1 transition-colors ${
              pathname === '/' && !activeTopic
                ? 'border-b-2 border-[#C0392B] font-semibold'
                : 'hover:text-[#C0392B]'
            }`}
          >
            Home
          </Link>
          <Link
            href="/sources"
            className={`py-1 transition-colors ${
              pathname === '/sources'
                ? 'border-b-2 border-[#C0392B] font-semibold'
                : 'hover:text-[#C0392B]'
            }`}
          >
            Sources
          </Link>
          <Link
            href="/about"
            className={`py-1 transition-colors ${
              pathname === '/about'
                ? 'border-b-2 border-[#C0392B] font-semibold'
                : 'hover:text-[#C0392B]'
            }`}
          >
            About
          </Link>
          <button
            onClick={() => handleTrendingClick('Protests')}
            className={`py-1 transition-colors ${
              qFromUrl.toLowerCase() === 'protests' || activeTopic.toLowerCase() === 'protests'
                ? 'border-b-2 border-[#C0392B] font-semibold'
                : 'hover:text-[#C0392B]'
            }`}
          >
            Protests
          </button>
          <button
            onClick={() => handleTrendingClick('Fact Check')}
            className="py-1 hover:text-[#C0392B] transition-colors"
          >
            Fact Check
          </button>
        </nav>

        {/* RIGHT: Search input & Subscribe button */}
        <div className="flex items-center">
          <form onSubmit={handleSearchSubmit} className="relative">
            <svg
              width="16"
              height="16"
              className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[#9CA3AF] pointer-events-none"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
              />
            </svg>
            <input
              type="text"
              placeholder="Search stories..."
              value={internalQuery}
              onChange={(e) => handleSearchInputChange(e.target.value)}
              className="w-[150px] sm:w-[220px] h-[34px] border border-[#E5E5E0] rounded-full pl-[36px] pr-[16px] py-[7px] text-[13px] font-sans text-[#1A1A1A] placeholder-[#9CA3AF] focus:outline-none focus:border-[#C0392B] bg-transparent"
            />
          </form>

          <button
            onClick={handleSubscribeClick}
            className="bg-[#1A1A1A] text-white px-[18px] py-[8px] rounded text-[13px] font-semibold font-sans ml-[12px] hover:bg-black transition-colors shrink-0"
          >
            Subscribe
          </button>
        </div>
      </div>

      {/* SECTION 3 — Dark Trending Topics Bar */}
      <div className="w-full bg-[#111111] h-[40px] px-4 sm:px-8 flex items-center overflow-x-auto no-scrollbar">
        <div className="text-[#9CA3AF] font-sans text-[12px] mr-[16px] shrink-0 font-medium flex items-center gap-1">
          <span>↗ Trending:</span>
        </div>

        <div className="flex items-center shrink-0">
          {TRENDING_TOPICS.map((topic) => (
            <button
              key={topic}
              onClick={() => handleTrendingClick(topic)}
              className="text-white font-sans text-[13px] font-medium px-[16px] border-r border-[#333333] leading-[40px] cursor-pointer whitespace-nowrap hover:text-[#C0392B] transition-colors"
            >
              {topic}
            </button>
          ))}
        </div>
      </div>
    </header>
  );
}

