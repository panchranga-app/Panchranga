import Link from 'next/link';

export const metadata = {
  title: 'Page Not Found — 404',
  robots: {
    index: false,
    follow: false,
  },
};

export default function NotFound() {
  return (
    <div className="min-h-[65vh] flex items-center justify-center px-4 py-16 bg-[#FAFAF8] text-[#1A1A1A] font-sans">
      <div className="max-w-md w-full bg-white border border-[#E5E5E0] rounded-xl p-8 sm:p-10 shadow-xs text-center space-y-6">
        {/* Panchranga Brand Wave Dots */}
        <div className="flex items-center justify-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-[#4A56E2]" />
          <span className="w-2.5 h-2.5 rounded-full bg-[#00B8A9]" />
          <span className="w-2.5 h-2.5 rounded-full bg-[#F5A623]" />
          <span className="w-2.5 h-2.5 rounded-full bg-[#E84393]" />
          <span className="w-2.5 h-2.5 rounded-full bg-[#FF6B6B]" />
        </div>

        <div className="space-y-2">
          <p className="text-xs font-mono font-bold tracking-widest text-[#C0392B] uppercase">
            Error 404
          </p>
          <h1 className="font-serif-title text-3xl sm:text-4xl font-bold text-[#1A1A1A]">
            Page Not Found
          </h1>
          <p className="text-sm text-[#6B6B6B] leading-relaxed pt-1">
            The story cluster or page you are looking for has moved, expired, or does not exist.
          </p>
        </div>

        <div className="pt-2 flex flex-col sm:flex-row gap-3 justify-center">
          <Link
            href="/"
            className="inline-flex items-center justify-center px-5 py-2.5 rounded-md bg-[#1A1A1A] text-white text-xs font-semibold hover:bg-black transition-colors"
          >
            ← Return to Broadsheet
          </Link>
          <Link
            href="/sources"
            className="inline-flex items-center justify-center px-5 py-2.5 rounded-md bg-[#F5F5F3] border border-[#E5E5E0] text-[#1A1A1A] text-xs font-semibold hover:bg-[#EBEBE9] transition-colors"
          >
            View Sources Directory
          </Link>
        </div>
      </div>
    </div>
  );
}
