'use client';

import { useState } from 'react';
import Link from 'next/link';
import PanchrangaLoader from './PanchrangaLoader';

export default function Footer() {
  const [email, setEmail] = useState('');
  const [subscribed, setSubscribed] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubscribe = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !email.includes('@')) return;
    setLoading(true);
    try {
      const res = await fetch('/api/newsletter/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      if (res.ok) {
        setSubscribed(true);
      }
    } catch (err) {
      console.error('Subscription error:', err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <footer className="w-full bg-[#1A1A1A] text-white px-8 pt-[40px] pb-[24px] font-sans mt-12">
      <div className="max-w-[1320px] mx-auto">
        {/* Top Section — 5 Columns */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-8 pb-8 text-sm">
          {/* Column 1: News */}
          <div>
            <h4 className="text-white font-bold text-base mb-4">News</h4>
            <ul className="space-y-2 text-[#9CA3AF] text-[13px]">
              <li><Link href="/" className="hover:text-white transition-colors">Home</Link></li>
              <li><Link href="/sources" className="hover:text-white transition-colors">Sources</Link></li>
              <li><Link href="/about" className="hover:text-white transition-colors">About</Link></li>
              <li><Link href="/?q=Fact%20Check" className="hover:text-white transition-colors">Fact Check</Link></li>
            </ul>
          </div>

          {/* Column 2: By Region */}
          <div>
            <h4 className="text-white font-bold text-base mb-4">By Region</h4>
            <ul className="space-y-2 text-[#9CA3AF] text-[13px]">
              <li><Link href="/?q=National" className="hover:text-white transition-colors">National</Link></li>
              <li><Link href="/?q=North%20India" className="hover:text-white transition-colors">North India</Link></li>
              <li><Link href="/?q=South%20India" className="hover:text-white transition-colors">South India</Link></li>
              <li><Link href="/?q=East%20India" className="hover:text-white transition-colors">East India</Link></li>
              <li><Link href="/?q=West%20India" className="hover:text-white transition-colors">West India</Link></li>
              <li><Link href="/?q=Northeast%20India" className="hover:text-white transition-colors">Northeast India</Link></li>
            </ul>
          </div>

          {/* Column 3: Trending in India */}
          <div>
            <h4 className="text-white font-bold text-base mb-4">Trending in India</h4>
            <ul className="space-y-2 text-[#9CA3AF] text-[13px]">
              <li><Link href="/?q=Artificial%20Intelligence" className="hover:text-white transition-colors">Artificial Intelligence</Link></li>
              <li><Link href="/?q=Supreme%20Court" className="hover:text-white transition-colors">Supreme Court</Link></li>
              <li><Link href="/?q=Election%20Commission" className="hover:text-white transition-colors">Election Commission</Link></li>
              <li><Link href="/?q=Modi%20Government" className="hover:text-white transition-colors">Modi Government</Link></li>
              <li><Link href="/?q=Kashmir" className="hover:text-white transition-colors">Kashmir</Link></li>
            </ul>
          </div>

          {/* Column 4: Help */}
          <div>
            <h4 className="text-white font-bold text-base mb-4">Help</h4>
            <ul className="space-y-2 text-[#9CA3AF] text-[13px]">
              <li><Link href="/about" className="hover:text-white transition-colors">About Panchranga</Link></li>
              <li><Link href="/about#how-it-works" className="hover:text-white transition-colors">How it works</Link></li>
              <li><Link href="/about#contact" className="hover:text-white transition-colors">Contact</Link></li>
              <li><a href="https://github.com/panchranga-app/Panchranga" target="_blank" rel="noopener noreferrer" className="hover:text-white transition-colors">Open Source</a></li>
            </ul>
          </div>

          {/* Column 5: Newsletter & Tools */}
          <div id="newsletter-footer" className="space-y-4 scroll-mt-20">
            <div>
              <h4 className="text-white font-bold text-base mb-2">Daily Newsletter</h4>
              {subscribed ? (
                <div className="text-[#10B981] font-semibold text-sm py-2">
                  Subscribed! ✓
                </div>
              ) : (
                <form onSubmit={handleSubscribe} className="space-y-1.5">
                  <div className="flex flex-col sm:flex-row gap-1.5">
                    <input
                      type="email"
                      required
                      placeholder="Enter your email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="px-2.5 py-1.5 bg-[#2A2A2A] border border-[#444] rounded text-white text-xs placeholder:text-gray-400 focus:outline-none focus:border-[#C0392B] flex-1 min-w-0"
                    />
                    <button
                      type="submit"
                      disabled={loading}
                      className="px-3 py-1.5 bg-[#C0392B] text-white rounded text-xs font-semibold hover:bg-[#a93226] transition-colors disabled:opacity-50 shrink-0 flex items-center justify-center min-w-[80px]"
                    >
                      {loading ? (
                        <PanchrangaLoader loading={true} size="sm" showWordmark={false} />
                      ) : (
                        'Subscribe'
                      )}
                    </button>
                  </div>
                  <p className="text-[11px] text-[#9CA3AF]">
                    Daily top 3 stories · 7 AM IST · Free
                  </p>
                </form>
              )}
            </div>

            <div className="pt-2 border-t border-[#333333]">
              <h5 className="text-[#9CA3AF] text-xs font-medium mb-1.5 uppercase font-mono tracking-wider">Tools</h5>
              <ul className="space-y-1 text-[#6B7280] text-xs">
                <li>Browser Extension (coming soon)</li>
                <li>Public API (coming soon)</li>
              </ul>
            </div>
          </div>
        </div>

        {/* Bottom Bar */}
        <div className="border-t border-[#333333] pt-[20px] flex flex-col sm:flex-row items-center justify-between text-[#9CA3AF] text-xs gap-4">
          <div>
            © 2026 Panchranga — Open Source, No Editors, No Paywall
          </div>
          <div className="flex gap-6">
            <Link href="/about" className="hover:text-white transition-colors">Privacy Policy</Link>
            <Link href="/about" className="hover:text-white transition-colors">About</Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
