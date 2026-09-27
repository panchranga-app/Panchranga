'use client';

export interface CoverageBarProps {
  mainstreamCount: number;
  grassrootsCount: number;
  discourseCount: number;
  showLegend?: boolean;
  showZeroLanes?: boolean;
  variant?: 'bar' | 'compact' | 'full';
  className?: string;
}

export default function CoverageBar({
  mainstreamCount = 0,
  grassrootsCount = 0,
  discourseCount = 0,
  showLegend = true,
  showZeroLanes = true,
  variant = 'full',
  className = '',
}: CoverageBarProps) {
  const total = mainstreamCount + grassrootsCount + discourseCount;

  // Proportional percentages (guarding against divide-by-zero)
  const mainstreamPct = total > 0 ? Math.round((mainstreamCount / total) * 100) : 0;
  const grassrootsPct = total > 0 ? Math.round((grassrootsCount / total) * 100) : 0;
  const discoursePct = total > 0 ? Math.round((discourseCount / total) * 100) : 0;

  // Compact textual indicator: ● 4 Mainstream  ● 2 Grassroots  ● 0 Discourse
  const renderPills = () => (
    <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[11px] font-sans">
      {/* Mainstream */}
      {mainstreamCount > 0 ? (
        <span className="flex items-center gap-1 text-[#1A1A1A] font-medium">
          <span className="w-1.5 h-1.5 rounded-full bg-[#2563EB] inline-block shrink-0" />
          <span>{mainstreamCount} Mainstream</span>
        </span>
      ) : showZeroLanes ? (
        <span className="flex items-center gap-1 text-[#9CA3AF]">
          <span className="w-1.5 h-1.5 rounded-full bg-[#E5E7EB] border border-[#CBD5E1] inline-block shrink-0" />
          <span>0 Mainstream</span>
        </span>
      ) : null}

      {/* Grassroots */}
      {grassrootsCount > 0 ? (
        <span className="flex items-center gap-1 text-[#1A1A1A] font-medium">
          <span className="w-1.5 h-1.5 rounded-full bg-[#16A34A] inline-block shrink-0" />
          <span>{grassrootsCount} Grassroots</span>
        </span>
      ) : showZeroLanes ? (
        <span className="flex items-center gap-1 text-[#9CA3AF]">
          <span className="w-1.5 h-1.5 rounded-full bg-[#E5E7EB] border border-[#CBD5E1] inline-block shrink-0" />
          <span>0 Grassroots</span>
        </span>
      ) : null}

      {/* Discourse */}
      {discourseCount > 0 ? (
        <span className="flex items-center gap-1 text-[#1A1A1A] font-medium">
          <span className="w-1.5 h-1.5 rounded-full bg-[#D97706] inline-block shrink-0" />
          <span>{discourseCount} Discourse</span>
        </span>
      ) : showZeroLanes ? (
        <span className="flex items-center gap-1 text-[#9CA3AF]">
          <span className="w-1.5 h-1.5 rounded-full bg-[#E5E7EB] border border-[#CBD5E1] inline-block shrink-0" />
          <span>0 Discourse</span>
        </span>
      ) : null}
    </div>
  );

  // If only compact variant is requested
  if (variant === 'compact') {
    return <div className={`w-full ${className}`}>{renderPills()}</div>;
  }

  return (
    <div className={`space-y-1.5 w-full ${className}`}>
      {/* Proportional Split Bar */}
      <div className="w-full h-1 bg-[#E5E5E0] rounded-full overflow-hidden flex">
        {mainstreamCount > 0 && (
          <div
            style={{ width: `${mainstreamPct}%` }}
            className="bg-[#2563EB] h-full transition-all duration-300"
            title={`Mainstream: ${mainstreamCount} (${mainstreamPct}%)`}
          />
        )}
        {grassrootsCount > 0 && (
          <div
            style={{ width: `${grassrootsPct}%` }}
            className="bg-[#16A34A] h-full transition-all duration-300"
            title={`Grassroots: ${grassrootsCount} (${grassrootsPct}%)`}
          />
        )}
        {discourseCount > 0 && (
          <div
            style={{ width: `${discoursePct}%` }}
            className="bg-[#D97706] h-full transition-all duration-300"
            title={`Discourse: ${discourseCount} (${discoursePct}%)`}
          />
        )}
      </div>

      {/* Legend / Compact Row */}
      {showLegend && renderPills()}
    </div>
  );
}
