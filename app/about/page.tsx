import Link from 'next/link';

export const metadata = {
  title: 'About Panchranga — Cross-Media News Intelligence',
  description: 'Learn about Panchranga, our three-lane media architecture, semantic clustering, and open editorial principles.',
};

export default function AboutPage() {
  return (
    <div className="max-w-4xl mx-auto space-y-12 py-6 font-sans text-[#1A1A1A]">
      {/* Hero Header */}
      <div className="space-y-4 border-b border-[#E5E5E0] pb-8">
        <div className="inline-flex items-center space-x-2 px-3 py-1 rounded bg-[#F5F5F3] border border-[#E5E5E0] text-xs font-mono font-semibold uppercase text-[#6B6B6B] tracking-wider">
          <span>Editorial Transparency</span>
        </div>
        <h1 className="font-serif-title text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight text-[#1A1A1A] leading-tight">
          What is Panchranga?
        </h1>
        <p className="text-base sm:text-lg text-[#4A4A4A] leading-relaxed">
          Panchranga is an open-source, independent news intelligence platform for India. We aggregate, analyze, and present reporting from national mainstream media, independent grassroots publications, and public discourse side by side on one screen.
        </p>
        <p className="text-base sm:text-lg text-[#4A4A4A] leading-relaxed">
          The name <strong className="text-[#1A1A1A]">Panchranga</strong> means <em>&ldquo;five colors&rdquo;</em> (many colors) — reflecting our conviction that every story in a democracy has more than one angle. You deserve to see the complete spectrum.
        </p>
        <div className="p-4 bg-[#FBFBF9] border-l-4 border-l-[#C0392B] rounded-r text-sm font-semibold text-[#1A1A1A]">
          No editors. No paywalls. No bias labels. Just every color of the story.
        </div>
      </div>

      {/* The 3 Lanes */}
      <section id="how-it-works" className="space-y-6 scroll-mt-20">
        <div>
          <h2 className="font-serif-title text-2xl font-bold text-[#1A1A1A]">
            The Three-Lane Structure
          </h2>
          <p className="text-sm text-[#6B6B6B] mt-1">
            Every story is segmented into three independent editorial perspectives to highlight cross-media framing.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Mainstream */}
          <div className="bg-white rounded-lg p-6 border border-[#E5E5E0] border-t-4 border-t-[#2563EB] shadow-xs space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-mono font-bold uppercase text-[#2563EB] tracking-wider">Lane 1</span>
              <span className="w-2.5 h-2.5 rounded-full bg-[#2563EB]" />
            </div>
            <h3 className="font-serif-title text-lg font-bold text-[#1A1A1A]">
              Mainstream Media
            </h3>
            <p className="text-xs text-[#555] leading-relaxed">
              Leading national daily newspapers, established broadcasters, and official government press channels (e.g. Indian Express, NDTV, Times of India, PIB).
            </p>
            <p className="text-[11px] text-[#6B6B6B] italic pt-1">
              Focus: Institutional record, press statements, and national headline reach.
            </p>
          </div>

          {/* Grassroots */}
          <div className="bg-white rounded-lg p-6 border border-[#E5E5E0] border-t-4 border-t-[#16A34A] shadow-xs space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-mono font-bold uppercase text-[#16A34A] tracking-wider">Lane 2</span>
              <span className="w-2.5 h-2.5 rounded-full bg-[#16A34A]" />
            </div>
            <h3 className="font-serif-title text-lg font-bold text-[#1A1A1A]">
              Grassroots & Regional
            </h3>
            <p className="text-xs text-[#555] leading-relaxed">
              Independent newsrooms, investigative outlets, and local language regional media (e.g. The Wire, Scroll.in, Maktoob Media, Newsclick, PARI).
            </p>
            <p className="text-[11px] text-[#6B6B6B] italic pt-1">
              Focus: Ground-level impacts, labor, marginalized communities, and regional investigation.
            </p>
          </div>

          {/* Discourse */}
          <div className="bg-white rounded-lg p-6 border border-[#E5E5E0] border-t-4 border-t-[#D97706] shadow-xs space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-mono font-bold uppercase text-[#D97706] tracking-wider">Lane 3</span>
              <span className="w-2.5 h-2.5 rounded-full bg-[#D97706]" />
            </div>
            <h3 className="font-serif-title text-lg font-bold text-[#1A1A1A]">
              Public Discourse
            </h3>
            <p className="text-xs text-[#555] leading-relaxed">
              Real-time civic reactions, online community threads, and public debate from active forums and discussions (e.g. Reddit communities, civic threads).
            </p>
            <p className="text-[11px] text-[#6B6B6B] italic pt-1">
              Focus: Grassroots civic sentiment, citizen reactions, and unfiltered community dialogue.
            </p>
          </div>
        </div>
      </section>

      {/* How Clustering Works */}
      <div className="bg-white rounded-lg p-8 border border-[#E5E5E0] shadow-xs space-y-4">
        <div className="inline-flex items-center space-x-1.5 text-xs font-mono uppercase tracking-wider text-[#C0392B] font-bold">
          <span>Technology & Algorithm</span>
        </div>
        <h2 className="font-serif-title text-2xl font-bold text-[#1A1A1A]">
          How Topic Clustering Works
        </h2>
        <div className="text-sm text-[#4A4A4A] space-y-3 leading-relaxed">
          <p>
            Rather than relying on human editors or rigid keyword tags, Panchranga uses automated semantic machine learning to group related articles into coherent <strong>Topic Hubs</strong>.
          </p>
          <p>
            When articles are fetched from our 65+ active sources, each headline and excerpt is passed through a lightweight text-embedding model (MiniLM-L6). This model converts text into a 384-dimensional mathematical vector representing its underlying conceptual meaning.
          </p>
          <p>
            Our pipeline calculates the <strong>cosine similarity</strong> between new articles and active clusters within a rolling time window. If an article shares strong mathematical similarity with an ongoing event, it is automatically attached to that topic hub — regardless of whether different publications use completely different phrasing or report in English or regional languages.
          </p>
          <p>
            If a cluster contains sufficient reporting across lanes, our pipeline generates an objective neutral overview summarizing key verified statements, with strict guardrails bypassing AI generation on sensitive legal or communal topics.
          </p>
        </div>
      </div>

      {/* Editorial Notice & Verification */}
      <div className="bg-[#F5F5F3] rounded-lg p-6 border-l-4 border-l-[#C0392B] space-y-3">
        <h3 className="font-bold text-[#1A1A1A] text-base flex items-center gap-2">
          <span>⚠️ Editorial Principles & Fact Checking</span>
        </h3>
        <p className="text-xs text-[#555] leading-relaxed">
          Panchranga is an aggregator and intelligence platform — we do not adjudicate truth or invent editorial lines. We display reports directly from original publishers and encourage readers to verify claims against accredited independent fact-checking organizations:
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
          <a
            href="https://www.altnews.in/"
            target="_blank"
            rel="noopener noreferrer"
            className="p-3 bg-white rounded border border-[#E5E5E0] hover:border-[#C0392B] transition-colors text-xs font-semibold text-[#1A1A1A] flex items-center justify-between"
          >
            <span>Alt News</span>
            <span className="text-[#C0392B]">↗</span>
          </a>
          <a
            href="https://www.boomlive.in/"
            target="_blank"
            rel="noopener noreferrer"
            className="p-3 bg-white rounded border border-[#E5E5E0] hover:border-[#C0392B] transition-colors text-xs font-semibold text-[#1A1A1A] flex items-center justify-between"
          >
            <span>BOOM Live</span>
            <span className="text-[#C0392B]">↗</span>
          </a>
          <a
            href="https://newschecker.in/"
            target="_blank"
            rel="noopener noreferrer"
            className="p-3 bg-white rounded border border-[#E5E5E0] hover:border-[#C0392B] transition-colors text-xs font-semibold text-[#1A1A1A] flex items-center justify-between"
          >
            <span>Newschecker</span>
            <span className="text-[#C0392B]">↗</span>
          </a>
        </div>
      </div>

      {/* Open Source Notice */}
      <div className="bg-white rounded-lg p-6 border border-[#E5E5E0] flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="space-y-1">
          <h3 className="font-serif-title text-base font-bold text-[#1A1A1A]">
            100% Free & Open Source
          </h3>
          <p className="text-xs text-[#6B6B6B]">
            Panchranga is developed as an open-source public good for Indian media literacy. The entire codebase is available on GitHub.
          </p>
        </div>
        <a
          href="https://github.com/panchranga-app/Panchranga"
          target="_blank"
          rel="noopener noreferrer"
          className="px-4 py-2 bg-[#1A1A1A] text-white rounded text-xs font-semibold hover:bg-black transition-colors shrink-0 flex items-center gap-1.5"
        >
          <span>View on GitHub</span>
          <span>→</span>
        </a>
      </div>

      {/* Contact & Corrections Section */}
      <section id="contact" className="bg-white rounded-lg p-8 border border-[#E5E5E0] shadow-xs space-y-4 scroll-mt-20">
        <div className="inline-flex items-center space-x-1.5 text-xs font-mono uppercase tracking-wider text-[#C0392B] font-bold">
          <span>Get in Touch</span>
        </div>
        <h2 className="font-serif-title text-2xl font-bold text-[#1A1A1A]">
          Contact & Corrections
        </h2>
        <div className="text-sm text-[#4A4A4A] space-y-3 leading-relaxed">
          <p>
            Panchranga is an independent open-source media intelligence initiative. We welcome corrections, feedback, suggestions for new RSS feeds, and technical contributions.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
            <div className="p-4 rounded-lg bg-[#F9F9F8] border border-[#E5E5E0] space-y-1">
              <h4 className="font-semibold text-sm text-[#1A1A1A]">Editorial & Corrections</h4>
              <p className="text-xs text-[#6B6B6B]">
                Notice an issue with source categorization or lane placement?
              </p>
              <a
                href="mailto:panchranga.news@gmail.com"
                className="text-xs font-medium text-[#C0392B] hover:underline block pt-1"
              >
                panchranga.news@gmail.com →
              </a>
            </div>
            <div className="p-4 rounded-lg bg-[#F9F9F8] border border-[#E5E5E0] space-y-1">
              <h4 className="font-semibold text-sm text-[#1A1A1A]">Code & Contributions</h4>
              <p className="text-xs text-[#6B6B6B]">
                Report bugs, request features, or propose new feeds on GitHub.
              </p>
              <a
                href="https://github.com/panchranga-app/Panchranga/issues"
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs font-medium text-[#C0392B] hover:underline block pt-1"
              >
                Open an Issue on GitHub →
              </a>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
