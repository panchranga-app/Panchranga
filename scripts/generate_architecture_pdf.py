import os
import sys

# Ensure UTF-8 stdout on Windows
if sys.stdout.encoding.lower() != "utf-8":
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass

from reportlab.lib.pagesizes import A4
from reportlab.lib import colors
from reportlab.pdfgen import canvas
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import (
    SimpleDocTemplate,
    Paragraph,
    Spacer,
    Table,
    TableStyle,
    PageBreak,
    KeepTogether,
    HRFlowable,
)
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle

# ---------------------------------------------------------
# FONT REGISTRATION
# ---------------------------------------------------------
FONT_NORMAL = "Helvetica"
FONT_BOLD = "Helvetica-Bold"
FONT_OBLIQUE = "Helvetica-Oblique"

try:
    if os.path.exists("C:/Windows/Fonts/Nirmala.ttf"):
        pdfmetrics.registerFont(TTFont("Nirmala", "C:/Windows/Fonts/Nirmala.ttf"))
        pdfmetrics.registerFont(TTFont("Nirmala-Bold", "C:/Windows/Fonts/NirmalaB.ttf"))
        FONT_NORMAL = "Nirmala"
        FONT_BOLD = "Nirmala-Bold"
        print("[SUCCESS] Registered Nirmala fonts successfully.")
except Exception as e:
    print("[NOTICE] Fallback to Helvetica fonts:", e)

# ---------------------------------------------------------
# COLOR PALETTE
# ---------------------------------------------------------
COLOR_PRIMARY_NAVY = colors.HexColor("#1A1A2E")      # Deep Dark Navy
COLOR_BRAND_RED = colors.HexColor("#C0392B")         # Panchranga Vermilion
COLOR_MAINSTREAM_BLUE = colors.HexColor("#2563EB")   # Lane 1: Mainstream
COLOR_GRASSROOTS_GREEN = colors.HexColor("#16A34A")  # Lane 2: Grassroots
COLOR_DISCOURSE_AMBER = colors.HexColor("#D97706")   # Lane 3: Public Discourse
COLOR_AGGREGATOR_GRAY = colors.HexColor("#64748B")   # Lane 4: Aggregator
COLOR_TEXT_MAIN = colors.HexColor("#1A202C")         # Main Body Text
COLOR_TEXT_MUTED = colors.HexColor("#4A5568")        # Muted Secondary Text
COLOR_BG_LIGHT = colors.HexColor("#F8FAFC")          # Clean Card Background
COLOR_BG_ACCENT = colors.HexColor("#F1F5F9")         # Table Header Background
COLOR_BORDER = colors.HexColor("#E2E8F0")            # Clean Border Gray

# Panchranga Brand 5-Dot Colors
DOT_INDIGO = colors.HexColor("#4A56E2")
DOT_TEAL = colors.HexColor("#00B8A9")
DOT_AMBER = colors.HexColor("#F5A623")
DOT_MAGENTA = colors.HexColor("#E84393")
DOT_CORAL = colors.HexColor("#FF6B6B")


# ---------------------------------------------------------
# NUMBERED CANVAS FOR HEADER & FOOTER
# ---------------------------------------------------------
class NumberedCanvas(canvas.Canvas):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self._saved_page_states = []

    def showPage(self):
        self._saved_page_states.append(dict(self.__dict__))
        self._startPage()

    def save(self):
        num_pages = len(self._saved_page_states)
        for state in self._saved_page_states:
            self.__dict__.update(state)
            self.draw_page_decorations(num_pages)
            super().showPage()
        super().save()

    def draw_page_decorations(self, page_count):
        self.saveState()

        # Page 1 Cover Footer
        if self._pageNumber == 1:
            self.setFont(FONT_NORMAL, 8)
            self.setFillColor(COLOR_TEXT_MUTED)
            self.drawString(40, 26, "Panchranga (पंचरंग) Open Source Intelligence Platform · panchranga.vercel.app")
            self.drawRightString(555, 26, "Technical Architecture & Operational Guide · 2026")
            self.restoreState()
            return

        # Running Header (Pages 2+)
        self.setFont(FONT_NORMAL, 8)
        self.setFillColor(COLOR_TEXT_MUTED)
        self.drawString(40, 812, "Panchranga (पंचरंग) — System Architecture & Operational Guide")
        self.drawRightString(555, 812, "Production State · September 2026")

        self.setStrokeColor(COLOR_BORDER)
        self.setLineWidth(0.75)
        self.line(40, 806, 555, 806)

        # Running Footer (Pages 2+)
        self.line(40, 36, 555, 36)
        self.setFont(FONT_NORMAL, 8)
        self.setFillColor(COLOR_TEXT_MUTED)
        self.drawString(40, 24, "Open Source · No Human Editors · No Paywalls · No Bias Labels · panchranga.in")
        page_str = f"Page {self._pageNumber} of {page_count}"
        self.drawRightString(555, 24, page_str)

        self.restoreState()


# ---------------------------------------------------------
# BUILD SCRIPT
# ---------------------------------------------------------
def generate_pdf(output_filename="Panchranga-System-Architecture-and-How-It-Works.pdf"):
    print(f"[BUILD] Generating comprehensive PDF: {output_filename}...")
    doc = SimpleDocTemplate(
        output_filename,
        pagesize=A4,
        leftMargin=40,
        rightMargin=40,
        topMargin=46,
        bottomMargin=46,
    )

    styles = getSampleStyleSheet()

    title_style = ParagraphStyle(
        "CoverTitle",
        parent=styles["Normal"],
        fontName=FONT_BOLD,
        fontSize=23,
        leading=28,
        textColor=COLOR_PRIMARY_NAVY,
        spaceAfter=5,
    )
    subtitle_style = ParagraphStyle(
        "CoverSubtitle",
        parent=styles["Normal"],
        fontName=FONT_NORMAL,
        fontSize=11.5,
        leading=15,
        textColor=COLOR_BRAND_RED,
        spaceAfter=12,
    )
    h1_style = ParagraphStyle(
        "SectionH1",
        parent=styles["Normal"],
        fontName=FONT_BOLD,
        fontSize=15,
        leading=19,
        textColor=COLOR_PRIMARY_NAVY,
        spaceBefore=0,
        spaceAfter=6,
        keepWithNext=True,
    )
    h2_style = ParagraphStyle(
        "SectionH2",
        parent=styles["Normal"],
        fontName=FONT_BOLD,
        fontSize=11,
        leading=15,
        textColor=COLOR_PRIMARY_NAVY,
        spaceBefore=8,
        spaceAfter=4,
        keepWithNext=True,
    )
    body_style = ParagraphStyle(
        "BodyDark",
        parent=styles["Normal"],
        fontName=FONT_NORMAL,
        fontSize=9,
        leading=13,
        textColor=COLOR_TEXT_MAIN,
        spaceAfter=5,
    )
    bullet_style = ParagraphStyle(
        "BulletDark",
        parent=styles["Normal"],
        fontName=FONT_NORMAL,
        fontSize=8.5,
        leading=12,
        textColor=COLOR_TEXT_MAIN,
        leftIndent=12,
        spaceAfter=3,
    )
    table_cell = ParagraphStyle(
        "TableCell",
        parent=styles["Normal"],
        fontName=FONT_NORMAL,
        fontSize=8,
        leading=11,
        textColor=COLOR_TEXT_MAIN,
    )
    table_cell_bold = ParagraphStyle(
        "TableCellBold",
        parent=styles["Normal"],
        fontName=FONT_BOLD,
        fontSize=8,
        leading=11,
        textColor=COLOR_PRIMARY_NAVY,
    )
    table_header = ParagraphStyle(
        "TableHeader",
        parent=styles["Normal"],
        fontName=FONT_BOLD,
        fontSize=8,
        leading=11,
        textColor=COLOR_PRIMARY_NAVY,
    )
    callout_text = ParagraphStyle(
        "CalloutText",
        parent=styles["Normal"],
        fontName=FONT_NORMAL,
        fontSize=8.5,
        leading=12,
        textColor=COLOR_TEXT_MAIN,
    )
    callout_title = ParagraphStyle(
        "CalloutTitle",
        parent=styles["Normal"],
        fontName=FONT_BOLD,
        fontSize=9,
        leading=12,
        textColor=COLOR_PRIMARY_NAVY,
    )

    # Helper: Callout Box
    def make_callout(title_text, body_text, border_color=COLOR_BRAND_RED, bg_color=COLOR_BG_LIGHT):
        content = [
            Paragraph(f"<b>{title_text}</b>", callout_title),
            Spacer(1, 2),
            Paragraph(body_text, callout_text),
        ]
        t = Table([[content]], colWidths=[515])
        t.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, -1), bg_color),
            ('BOX', (0, 0), (-1, -1), 0.75, COLOR_BORDER),
            ('LINELEFT', (0, 0), (0, -1), 3.5, border_color),
            ('TOPPADDING', (0, 0), (-1, -1), 6),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 6),
            ('LEFTPADDING', (0, 0), (-1, -1), 10),
            ('RIGHTPADDING', (0, 0), (-1, -1), 10),
        ]))
        return t

    # Helper: Section Header with Accent Bar
    def make_section_header(title):
        p = Paragraph(f"<b>{title}</b>", h1_style)
        rule = HRFlowable(width="100%", thickness=1.5, color=COLOR_BRAND_RED, spaceBefore=2, spaceAfter=6)
        return KeepTogether([p, rule])

    story = []

    # =========================================================
    # PAGE 1: COVER & EXECUTIVE SUMMARY
    # =========================================================
    dot_spectrum = Table(
        [[
            Paragraph("●", ParagraphStyle("D1", fontName=FONT_BOLD, fontSize=13, leading=13, textColor=DOT_INDIGO)),
            Paragraph("●", ParagraphStyle("D2", fontName=FONT_BOLD, fontSize=13, leading=13, textColor=DOT_TEAL)),
            Paragraph("●", ParagraphStyle("D3", fontName=FONT_BOLD, fontSize=13, leading=13, textColor=DOT_AMBER)),
            Paragraph("●", ParagraphStyle("D4", fontName=FONT_BOLD, fontSize=13, leading=13, textColor=DOT_MAGENTA)),
            Paragraph("●", ParagraphStyle("D5", fontName=FONT_BOLD, fontSize=13, leading=13, textColor=DOT_CORAL)),
            Paragraph("<b>PANCHRANGA (पंचरंग)</b> · Every Color of the Story", ParagraphStyle("Wordmark", fontName=FONT_BOLD, fontSize=9.5, leading=13, textColor=COLOR_PRIMARY_NAVY)),
        ]],
        colWidths=[15, 15, 15, 15, 15, 440]
    )
    dot_spectrum.setStyle(TableStyle([
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('LEFTPADDING', (0, 0), (-1, -1), 0),
        ('RIGHTPADDING', (0, 0), (-1, -1), 0),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
        ('TOPPADDING', (0, 0), (-1, -1), 0),
    ]))
    story.append(dot_spectrum)
    story.append(Spacer(1, 6))

    story.append(Paragraph("System Architecture & Operational Guide", title_style))
    story.append(Paragraph("How Panchranga Works at this Point of Time: End-to-End Technical Deep Dive", subtitle_style))

    # Meta Overview Box
    meta_data = [
        [
            Paragraph("<b>Status:</b> Production Active", table_cell),
            Paragraph("<b>Active Sources:</b> 96 Verified Feeds", table_cell),
            Paragraph("<b>Languages:</b> 13 Indian Languages", table_cell),
        ],
        [
            Paragraph("<b>Editorial Framework:</b> 3 Perspective Lanes", table_cell),
            Paragraph("<b>Ingestion Cadence:</b> Every 20 Mins (Cron)", table_cell),
            Paragraph("<b>Embeddings:</b> 384-Dim MiniLM-L6 Vector", table_cell),
        ],
        [
            Paragraph("<b>Database:</b> Supabase Postgres (pgvector)", table_cell),
            Paragraph("<b>AI Models:</b> Groq Qwen / Gemini Flash", table_cell),
            Paragraph("<b>Web Stack:</b> Next.js 14 App Router", table_cell),
        ]
    ]
    meta_table = Table(meta_data, colWidths=[171, 171, 171])
    meta_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, -1), COLOR_BG_LIGHT),
        ('BOX', (0, 0), (-1, -1), 1, COLOR_BORDER),
        ('INNERGRID', (0, 0), (-1, -1), 0.5, COLOR_BORDER),
        ('TOPPADDING', (0, 0), (-1, -1), 4),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
        ('LEFTPADDING', (0, 0), (-1, -1), 7),
        ('RIGHTPADDING', (0, 0), (-1, -1), 7),
    ]))
    story.append(meta_table)
    story.append(Spacer(1, 10))

    # SECTION 1: EXECUTIVE SUMMARY & CORE MISSION
    story.append(make_section_header("1. Executive Summary & Core Mission"))
    story.append(Paragraph(
        "<b>Panchranga (पंचरंग)</b> is an open-source, automated news intelligence platform designed specifically for the Indian media ecosystem. The platform addresses severe media polarization, echo chambers, and commercial bias by aggregating coverage across the entire spectrum and presenting multiple perspectives side by side on a unified canvas.",
        body_style
    ))
    story.append(Paragraph(
        "The Hindi word <i>Panchranga</i> signifies <i>&ldquo;many colors&rdquo;</i> (literally five colors). The platform operates on the core axiom that in a complex pluralistic democracy, no single media outlet captures the entire truth of an event. Panchranga enforces a strict editorial charter: <b>No human editors, no paywalls, no partisan bias labels, and complete transparency.</b>",
        body_style
    ))

    # Core Pillars Table
    pillars_data = [
        [Paragraph("<b>Pillar</b>", table_header), Paragraph("<b>Implementation Mechanism</b>", table_header), Paragraph("<b>Democratic Value</b>", table_header)],
        [
            Paragraph("<b>Automated Aggregation</b>", table_cell_bold),
            Paragraph("96 RSS, Reddit, and API feeds polled every 20 minutes via bounded asynchronous workers.", table_cell),
            Paragraph("Removes selective curation and algorithmic echo chambers.", table_cell)
        ],
        [
            Paragraph("<b>Three-Lane Separation</b>", table_cell_bold),
            Paragraph("Strict partitioning into Mainstream, Grassroots, and Public Discourse lanes.", table_cell),
            Paragraph("Exposes narrative divergence and institutional vs ground reality.", table_cell)
        ],
        [
            Paragraph("<b>Semantic Clustering</b>", table_cell_bold),
            Paragraph("384-dimensional vector embeddings with cosine similarity grouping (threshold 0.45).", table_cell),
            Paragraph("Connects identical events regardless of language or vocabulary.", table_cell)
        ],
        [
            Paragraph("<b>Guardrailed AI Briefs</b>", table_cell_bold),
            Paragraph("Cascading LLMs generate 35-word neutral summaries; sensitive topics auto-bypass.", table_cell),
            Paragraph("Delivers instant, objective context without sensationalist framing.", table_cell)
        ],
    ]
    pillars_table = Table(pillars_data, colWidths=[120, 225, 170])
    pillars_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), COLOR_BG_ACCENT),
        ('BOX', (0, 0), (-1, -1), 1, COLOR_BORDER),
        ('INNERGRID', (0, 0), (-1, -1), 0.5, COLOR_BORDER),
        ('TOPPADDING', (0, 0), (-1, -1), 4),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
        ('LEFTPADDING', (0, 0), (-1, -1), 6),
        ('RIGHTPADDING', (0, 0), (-1, -1), 6),
    ]))
    story.append(pillars_table)
    story.append(Spacer(1, 10))

    story.append(make_callout(
        "The Panchranga Philosophy: Why Single-Perspective Feeds Fail in India",
        "India's linguistic and regional diversity means stories unfold differently across national broadsheets, regional language outlets, and civic discussion spaces. A national daily may emphasize government economic data, an independent rural reporter highlights local land acquisition issues, while citizen forums debate immediate real-world fallout. Panchranga brings all three dimensions onto a single screen so readers see the complete truth.",
        border_color=COLOR_BRAND_RED
    ))

    # END OF PAGE 1
    story.append(PageBreak())

    # =========================================================
    # PAGE 2: END-TO-END PIPELINE & THE THREE-LANE ARCHITECTURE
    # =========================================================
    story.append(make_section_header("2. End-to-End System Architecture & Data Flow"))
    story.append(Paragraph(
        "Panchranga is constructed as an asynchronous, event-driven pipeline running on scheduled cron jobs, paired with a modern Next.js 14 serverless web application. The lifecycle of a news item from external ingestion to browser presentation follows six deterministic stages:",
        body_style
    ))

    # Architecture Flow Diagram as a styled Table
    flow_steps = [
        [
            Paragraph("<b>Stage 1: Multi-Source Ingestion</b><br/><font color='#4A5568'>scripts/fetch-rss.ts</font>", table_cell_bold),
            Paragraph("Pulls from 96 feeds across 4 lanes (58 Mainstream, 22 Grassroots, 9 Discourse, 7 Aggregators) across 13 languages. Concurrency bounded by <code>p-limit(7)</code>. Cloudflare-protected feeds routed via Google News syndication fallbacks.", table_cell)
        ],
        [
            Paragraph("<b>Stage 2: Aggregator Deduplication</b><br/><font color='#4A5568'>lib/dedup.ts</font>", table_cell_bold),
            Paragraph("Pooled aggregator feeds (Currents API + Google News RSS) are checked against direct feeds within a ±2h publication window using exact URL, normalized title, and token Jaccard similarity (>= 85%) to prevent redundant story counts.", table_cell)
        ],
        [
            Paragraph("<b>Stage 3: Vector Embedding</b><br/><font color='#4A5568'>lib/embeddings.ts</font>", table_cell_bold),
            Paragraph("Raw headlines and summaries are stripped of stopwords and projected into a 384-dimensional vector space using multilingual token hashing and sub-word 3-grams, normalized via L2 unit length for cosine dot-product calculations.", table_cell)
        ],
        [
            Paragraph("<b>Stage 4: Topic Hub Clustering</b><br/><font color='#4A5568'>lib/clustering.ts</font>", table_cell_bold),
            Paragraph("Single-pass clustering compares new items against active hubs in a rolling 48-hour window. Articles with Cosine Similarity >= 0.45 join the highest-matching cluster; novel events spawn new Topic Hubs. Lane counts are recalculated dynamically.", table_cell)
        ],
        [
            Paragraph("<b>Stage 5: Guardrailed AI Synthesis</b><br/><font color='#4A5568'>lib/summarizer.ts</font>", table_cell_bold),
            Paragraph("Multi-model cascade (Groq Qwen 2.5 32B -> Gemini Flash -> OpenRouter -> Article Snippet Rule). Generates strict 1-2 sentence neutral facts (max 35 words). High-stakes communal/sub-judice keywords trigger automated bypass (Sources-Only Mode).", table_cell)
        ],
        [
            Paragraph("<b>Stage 6: Dual Persistence & UI</b><br/><font color='#4A5568'>Next.js 14 App Router</font>", table_cell_bold),
            Paragraph("Dual storage layer: Supabase PostgreSQL (pgvector) + local JSON files (<code>data/topic-hubs.json</code>). Rendered via Next.js SSR/ISR with 3-column layout, Coverage Bars, mobile tabs, live fact-checking ticker, and daily morning newsletter.", table_cell)
        ],
    ]
    flow_table = Table(flow_steps, colWidths=[150, 365])
    flow_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (0, -1), COLOR_BG_LIGHT),
        ('BOX', (0, 0), (-1, -1), 1, COLOR_BORDER),
        ('INNERGRID', (0, 0), (-1, -1), 0.5, COLOR_BORDER),
        ('TOPPADDING', (0, 0), (-1, -1), 3.5),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 3.5),
        ('LEFTPADDING', (0, 0), (-1, -1), 6),
        ('RIGHTPADDING', (0, 0), (-1, -1), 6),
    ]))
    story.append(flow_table)
    story.append(Spacer(1, 10))

    # SECTION 3: THE THREE-LANE ARCHITECTURE & SOURCE REGISTRY
    story.append(make_section_header("3. The Three-Lane Architecture & Source Registry"))
    story.append(Paragraph(
        "Panchranga isolates coverage into distinct editorial lanes to reveal media framing and narrative divergence:",
        body_style
    ))

    # Lane Deep Dive Table
    lanes_data = [
        [Paragraph("<b>Media Lane</b>", table_header), Paragraph("<b>Color & UI Code</b>", table_header), Paragraph("<b>Source Count</b>", table_header), Paragraph("<b>Characteristics & Editorial Mandate</b>", table_header)],
        [
            Paragraph("<b>Mainstream</b><br/>Lane 1", table_cell_bold),
            Paragraph("<font color='#2563EB'><b>Blue (#2563EB)</b></font>", table_cell),
            Paragraph("58 Sources (60.4%)", table_cell),
            Paragraph("National English & Hindi daily broadsheets, television networks, wire agencies, official government press releases (Indian Express, Times of India, NDTV, BBC India, Reuters, PIB, Dainik Bhaskar). Focus: Institutional record, press statements, national distribution.", table_cell)
        ],
        [
            Paragraph("<b>Grassroots</b><br/>Lane 2", table_cell_bold),
            Paragraph("<font color='#16A34A'><b>Green (#16A34A)</b></font>", table_cell),
            Paragraph("22 Sources (22.9%)", table_cell),
            Paragraph("Independent newsrooms, investigative collectives, and regional language ground reporters (The Wire, Scroll.in, Newslaundry, The News Minute, Article 14, The Mooknayak, PARI, Khabar Lahariya, Down To Earth). Focus: Ground impact, rural distress, human rights, marginalized communities.", table_cell)
        ],
        [
            Paragraph("<b>Public Discourse</b><br/>Lane 3", table_cell_bold),
            Paragraph("<font color='#D97706'><b>Amber (#D97706)</b></font>", table_cell),
            Paragraph("9 Sources (9.4%)", table_cell),
            Paragraph("Citizen journalism networks, online civic discussion threads, active Indian subreddits (r/india, r/IndiaSpeaks, r/delhi, r/bangalore, r/mumbai, Youth Ki Awaaz, Sabrang India). Focus: Unfiltered citizen sentiment, public debate, ground-level feedback.", table_cell)
        ],
        [
            Paragraph("<b>Aggregator</b><br/>Auxiliary", table_cell_bold),
            Paragraph("<font color='#64748B'><b>Gray (#64748B)</b></font>", table_cell),
            Paragraph("7 Sources (7.3%)", table_cell),
            Paragraph("Multi-publisher pooled syndication streams: Currents API (with 250 req/day quota guard) and Google News RSS editions (English, Hindi, Punjabi, Urdu, Odia, Assamese). Undergoes deduplication before assignment.", table_cell)
        ],
    ]
    lanes_table = Table(lanes_data, colWidths=[75, 80, 75, 285])
    lanes_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), COLOR_BG_ACCENT),
        ('BOX', (0, 0), (-1, -1), 1, COLOR_BORDER),
        ('INNERGRID', (0, 0), (-1, -1), 0.5, COLOR_BORDER),
        ('TOPPADDING', (0, 0), (-1, -1), 3.5),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 3.5),
        ('LEFTPADDING', (0, 0), (-1, -1), 5),
        ('RIGHTPADDING', (0, 0), (-1, -1), 5),
    ]))
    story.append(lanes_table)
    story.append(Spacer(1, 8))

    story.append(Paragraph(
        "<b>Language Breakdown across 13 Indian Languages:</b> English (55), Hindi (12), Punjabi (4), Odia (4), Tamil (3), Urdu (3), Assamese (3), Telugu (2), Kannada (2), Malayalam (2), Marathi (2), Gujarati (2), Bengali (2).",
        body_style
    ))

    # END OF PAGE 2
    story.append(PageBreak())

    # =========================================================
    # PAGE 3: DATA INGESTION & DEDUPLICATION ENGINE
    # =========================================================
    story.append(make_section_header("4. Data Ingestion Pipeline & Anti-WAF Defense"))
    story.append(Paragraph(
        "The data ingestion pipeline (<code>scripts/fetch-rss.ts</code>) is orchestrated every 20 minutes via GitHub Actions. It is engineered with robust defensive mechanisms against bot blocks, network failures, and publisher variance:",
        body_style
    ))
    story.append(Paragraph("• <b>Bounded Concurrency:</b> Feeds are ingested with <code>p-limit(7)</code> concurrency. This avoids socket starvation while fetching up to 30 items per feed across 96 sources within ~45 seconds.", bullet_style))
    story.append(Paragraph("• <b>Anti-WAF Syndication Fallbacks (<code>FEED_FALLBACKS</code>):</b> Major publishers (BBC, Livemint, Hindustan Times, Scroll.in) employ Cloudflare bot-protection that blocks automated crawlers with HTTP 403. Panchranga automatically reroutes failing feeds through Google News RSS syndication queries (e.g. <code>site:bbc.com/news/world/asia/india</code>), maintaining 100% feed availability without headless browsers.", bullet_style))
    story.append(Paragraph("• <b>Reddit Pacing & Multi-Subreddit Ingestion:</b> Subreddits are fetched with polite 2,000ms–5,000ms pacing delays, with fallback to unified multi-subreddit RSS (<code>r/india+IndiaSpeaks+delhi+bangalore+mumbai/.rss</code>). This guarantees complete civic discourse coverage without hitting Reddit 429 rate limits.", bullet_style))
    story.append(Paragraph("• <b>Strict 2.5s OpenGraph Extraction:</b> The engine runs live HTML scraping only for the top 2 articles per source missing RSS enclosure thumbnails, enforcing a strict 2.5-second abort signal to maintain high pipeline throughput.", bullet_style))
    story.append(Paragraph("• <b>Source Health Telemetry:</b> Every cycle updates Supabase <code>sources</code> with <code>last_status</code> ('healthy' / 'error'), <code>last_attempted_at</code>, and <code>last_error</code> for real-time monitoring.", bullet_style))
    story.append(Spacer(1, 8))

    # SECTION 5: DEDUPLICATION ENGINE
    story.append(make_section_header("5. Aggregator Deduplication Engine (lib/dedup.ts)"))
    story.append(Paragraph(
        "Pooled aggregator feeds (Currents API and Google News RSS) frequently syndicate news stories already ingested from direct publisher RSS feeds. Panchranga uses a multi-tier deduplication algorithm to eliminate duplicate stories before clustering:",
        body_style
    ))

    # Dedup Logic Table
    dedup_steps = [
        [Paragraph("<b>Step</b>", table_header), Paragraph("<b>Logic & Algorithm</b>", table_header), Paragraph("<b>Threshold / Criteria</b>", table_header)],
        [
            Paragraph("<b>1. Title Normalization</b>", table_cell_bold),
            Paragraph("Strips publisher branding suffixes (<code>- The Hindu</code>, <code>| NDTV</code>, <code>— BBC</code>). Cleans punctuation via Unicode-aware regex (<code>[^\\p{L}\\p{N}\\s]</code>) while preserving Hindi/Indic scripts.", table_cell),
            Paragraph("Clean lowercased canonical token string.", table_cell)
        ],
        [
            Paragraph("<b>2. Time-Window Check</b>", table_cell_bold),
            Paragraph("Compares candidate article timestamp against existing direct items. Only stories published within the same temporal window are evaluated.", table_cell),
            Paragraph("±2 hours (7,200,000 ms)", table_cell)
        ],
        [
            Paragraph("<b>3. Exact URL Match</b>", table_cell_bold),
            Paragraph("Direct canonical URL equality.", table_cell),
            Paragraph("Exact string match (100% duplicate)", table_cell)
        ],
        [
            Paragraph("<b>4. Normalized Title Match</b>", table_cell_bold),
            Paragraph("Exact match of sanitized canonical titles.", table_cell),
            Paragraph("Exact string match (100% duplicate)", table_cell)
        ],
        [
            Paragraph("<b>5. Token Jaccard Overlap</b>", table_cell_bold),
            Paragraph("Word-level Jaccard similarity: <code>|Set(A) ∩ Set(B)| / |Set(A) ∪ Set(B)|</code> on words with length > 2.", table_cell),
            Paragraph("Similarity >= 0.85 (85% token overlap)", table_cell)
        ],
    ]
    dedup_table = Table(dedup_steps, colWidths=[110, 265, 140])
    dedup_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), COLOR_BG_ACCENT),
        ('BOX', (0, 0), (-1, -1), 1, COLOR_BORDER),
        ('INNERGRID', (0, 0), (-1, -1), 0.5, COLOR_BORDER),
        ('TOPPADDING', (0, 0), (-1, -1), 4),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
        ('LEFTPADDING', (0, 0), (-1, -1), 6),
        ('RIGHTPADDING', (0, 0), (-1, -1), 6),
    ]))
    story.append(dedup_table)
    story.append(Spacer(1, 8))

    story.append(make_callout(
        "Production Deduplication Metrics",
        "During standard ingestion cycles, the deduplication engine evaluates ~100 aggregator articles against ~900 direct feed items. An average of 15%–25% of aggregator articles are identified as duplicates and filtered out, preventing artificial inflation of mainstream lane counts and keeping topic hub metrics pristine.",
        border_color=COLOR_GRASSROOTS_GREEN
    ))

    # END OF PAGE 3
    story.append(PageBreak())

    # =========================================================
    # PAGE 4: VECTOR EMBEDDINGS & EVENT CLUSTERING ENGINE
    # =========================================================
    story.append(make_section_header("6. Vector Embeddings & Event Clustering Engine"))
    story.append(Paragraph(
        "Panchranga groups disparate news reports into unified <b>Topic Hubs</b> using vector semantic similarity. Rather than relying on human categorization or fragile keyword matching, the system calculates the geometric proximity of articles in a 384-dimensional space.",
        body_style
    ))

    story.append(Paragraph("<b>Multilingual Embedding Mechanics (<code>lib/embeddings.ts</code>):</b>", h2_style))
    story.append(Paragraph(
        "Each raw item title and snippet is passed through an Indic-aware embedding tokenizer. Stopwords across English and Indian languages (<i>news, latest, india, updates, pm, says, etc.</i>) are purged. The engine computes both full word token hashes and sub-word 3-grams, mapping them into a 384-element float array. The vector is normalized to unit length (L2 norm = 1.0) so that Cosine Similarity is equivalent to the dot product: <code>dot(A, B) = Σ(A[i] * B[i])</code>.",
        body_style
    ))

    story.append(Paragraph("<b>Single-Pass Clustering Algorithm (<code>lib/clustering.ts</code>):</b>", h2_style))
    story.append(Paragraph("1. <b>Rolling 48-Hour Window:</b> During each clustering cycle (<code>scripts/cluster-items.ts</code>), the system evaluates raw items from the past 48 hours to maintain fresh, active topic hubs.", bullet_style))
    story.append(Paragraph("2. <b>Hub Comparison:</b> For each incoming raw item, the engine calculates the maximum cosine similarity against all articles inside each existing topic hub.", bullet_style))
    story.append(Paragraph("3. <b>Threshold Association:</b> If <code>max_similarity >= 0.45</code>, the item is attached to that Topic Hub. Duplicate URLs within the same hub are automatically rejected.", bullet_style))
    story.append(Paragraph("4. <b>Hub Spawning:</b> If no existing hub satisfies the 0.45 threshold, a new Topic Hub is spawned with a unique UUID, adopting the article's title as the hub headline.", bullet_style))
    story.append(Paragraph("5. <b>Lane Re-indexing:</b> Once clustering completes, each hub's <code>mainstream_count</code>, <code>grassroots_count</code>, and <code>discourse_count</code> are recomputed dynamically.", bullet_style))
    story.append(Spacer(1, 6))

    story.append(make_callout(
        "Clustering Throughput & Performance in Production",
        "In production, clustering 1,000 raw items into ~700 topic hubs (including 100+ multi-source breaking hubs) executes in under 4 seconds. The system syncs cluster IDs to Supabase Postgres in concurrent batches of 50 and persists an instant local cache in <code>data/topic-hubs.json</code>.",
        border_color=COLOR_MAINSTREAM_BLUE
    ))
    story.append(Spacer(1, 8))

    story.append(Paragraph("<b>pgvector Stored Procedure (<code>match_topic_hubs</code>):</b>", h2_style))
    story.append(Paragraph(
        "Supabase performs cosine distance vector matching directly in PostgreSQL via the PL/pgSQL function:<br/>"
        "<code>1 - (raw_items.embedding &lt;=&gt; query_embedding) AS similarity</code><br/>"
        "This allows real-time vector queries across thousands of items in under 15ms using PostgreSQL IVFFlat / HNSW vector indexing.",
        body_style
    ))

    # END OF PAGE 4
    story.append(PageBreak())

    # =========================================================
    # PAGE 5: AI NEUTRAL SUMMARIZER & SAFETY GUARDRAILS
    # =========================================================
    story.append(make_section_header("7. AI Neutral Summarizer & Safety Guardrails"))
    story.append(Paragraph(
        "Panchranga features an automated editorial synthesizer (<code>lib/summarizer.ts</code>) that generates objective, 1-2 sentence neutral briefings for multi-source topic hubs. It is engineered with two critical design requirements: <b>failover resilience</b> and <b>strict ethical guardrails</b>.",
        body_style
    ))

    # Multi-Model Cascade Table
    cascade_data = [
        [Paragraph("<b>Priority Tier</b>", table_header), Paragraph("<b>Provider & Model</b>", table_header), Paragraph("<b>Role & Quota Profile</b>", table_header), Paragraph("<b>Failure / Cooldown Behavior</b>", table_header)],
        [
            Paragraph("<b>Tier 1 (Primary)</b>", table_cell_bold),
            Paragraph("<b>Groq Cloud</b><br/><code>qwen/qwen3.8-27b</code>", table_cell),
            Paragraph("Sub-second inference (400ms). Used for ultra-fast batch and on-demand generation.", table_cell),
            Paragraph("On HTTP 429: sets 60s cooldown (1h if daily TPD limit hit) and cascades to Tier 2.", table_cell)
        ],
        [
            Paragraph("<b>Tier 2 (Failover)</b>", table_cell_bold),
            Paragraph("<b>Google Gemini</b><br/><code>gemini-3.8-flash</code>", table_cell),
            Paragraph("High daily token quota (1,500 requests/day, 1M TPM). Deep multilingual reasoning.", table_cell),
            Paragraph("On HTTP 429: sets 60s cooldown and cascades to Tier 3.", table_cell)
        ],
        [
            Paragraph("<b>Tier 3 (Fallback)</b>", table_cell_bold),
            Paragraph("<b>OpenRouter Free</b><br/><code>nemotron-3.5 / ling-3.0</code>", table_cell),
            Paragraph("Multi-model open pool. Ensures free tier resilience when primary keys are exhausted.", table_cell),
            Paragraph("Cascades to Tier 4 if all free models return errors.", table_cell)
        ],
        [
            Paragraph("<b>Tier 4 (Rule Engine)</b>", table_cell_bold),
            Paragraph("<b>Deterministic Snippet</b><br/>Regex Sentence Extractor", table_cell),
            Paragraph("Zero API calls. Extracts the cleanest factual sentence from the lead publisher.", table_cell),
            Paragraph("Guarantees 100% uptime with zero empty summary cards.", table_cell)
        ],
    ]
    cascade_table = Table(cascade_data, colWidths=[90, 110, 165, 150])
    cascade_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), COLOR_BG_ACCENT),
        ('BOX', (0, 0), (-1, -1), 1, COLOR_BORDER),
        ('INNERGRID', (0, 0), (-1, -1), 0.5, COLOR_BORDER),
        ('TOPPADDING', (0, 0), (-1, -1), 4),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
        ('LEFTPADDING', (0, 0), (-1, -1), 6),
        ('RIGHTPADDING', (0, 0), (-1, -1), 6),
    ]))
    story.append(cascade_table)
    story.append(Spacer(1, 8))

    # Guardrails Callout
    story.append(make_callout(
        "Safety Bypass Guardrails: Sources-Only Mode",
        "<b>Zero AI Hallucination Policy:</b> When a news hub contains sensitive or legally high-stakes keywords (<code>communal violence</code>, <code>communal riot</code>, <code>mob lynching</code>, <code>hate speech</code>, <code>sub-judice</code>, <code>ongoing trial</code>, <code>curfew imposed</code>), the system immediately <b>bypasses AI generation</b>. The UI renders the verified publisher headline accompanied by an alert: <i>'AI Summary bypassed for high-stakes sensitive topic. Displaying verified reporting only.'</i>",
        border_color=COLOR_BRAND_RED
    ))
    story.append(Spacer(1, 8))

    story.append(Paragraph("<b>Deep Article Scraping (<code>lib/article-extractor.ts</code>):</b>", h2_style))
    story.append(Paragraph(
        "Unlike aggregators that summarize only brief RSS snippets, Panchranga uses an asynchronous HTTP client to scrape the primary news article webpage directly. It filters boilerplate (cookie warnings, subscribe banners, copyright notices) and extracts up to 1,500 characters of substantive paragraph text within a 3.5s timeout window. This provides the LLM with concrete facts, casualty figures, and official quotes.",
        body_style
    ))
    story.append(Paragraph("<b>Strict Editorial Prompt Constraints:</b>", h2_style))
    story.append(Paragraph(
        "The system prompt instructs the model: <i>'Write a concise, fact-rich 1-2 sentence neutral briefing (max 35 words) capturing key event, concrete facts, numbers, and locations. Plain English only. No source names, no media labels, no quotation marks.'</i> Post-processing filters strip any accidental thought tags (<code>&lt;think&gt;</code>) or boilerplate prefixes.",
        body_style
    ))

    # END OF PAGE 5
    story.append(PageBreak())

    # =========================================================
    # PAGE 6: DATABASE SCHEMA & FRONTEND APPLICATION
    # =========================================================
    story.append(make_section_header("8. Database Schema & Data Models"))
    story.append(Paragraph(
        "Panchranga uses <b>Supabase PostgreSQL</b> with the <code>pgvector</code> extension for high-speed vector similarity lookups. The database schema (<code>scripts/schema.sql</code> and <code>scripts/newsletter_schema.sql</code>) consists of five core tables:",
        body_style
    ))

    # Schema Tables Summary
    schema_data = [
        [Paragraph("<b>Table Name</b>", table_header), Paragraph("<b>Keys & Constraints</b>", table_header), Paragraph("<b>Key Columns & Types</b>", table_header), Paragraph("<b>Operational Purpose</b>", table_header)],
        [
            Paragraph("<b>sources</b>", table_cell_bold),
            Paragraph("<code>id uuid PK</code>", table_cell),
            Paragraph("<code>name, lane, type, feed_url UNIQUE, language, region, is_active, last_status</code>", table_cell),
            Paragraph("Registry of all 96 news feeds with health telemetry and lane tags.", table_cell)
        ],
        [
            Paragraph("<b>raw_items</b>", table_cell_bold),
            Paragraph("<code>id uuid PK</code><br/><code>source_id FK</code><br/><code>cluster_id FK</code>", table_cell),
            Paragraph("<code>title, url UNIQUE, published_at, raw_summary, og_image, category, embedding vector(384)</code>", table_cell),
            Paragraph("Every individual news report ingested, indexed by URL and 384-dim vector embedding.", table_cell)
        ],
        [
            Paragraph("<b>topic_hubs</b>", table_cell_bold),
            Paragraph("<code>id uuid PK</code>", table_cell),
            Paragraph("<code>title, ai_summary, first_seen_at, last_updated_at, item_count</code>", table_cell),
            Paragraph("Clustered story hubs representing single events with synthesized briefings.", table_cell)
        ],
        [
            Paragraph("<b>newsletter_subscribers</b>", table_cell_bold),
            Paragraph("<code>id uuid PK</code>", table_cell),
            Paragraph("<code>email UNIQUE, subscribed_at, is_active, unsubscribe_token uuid</code>", table_cell),
            Paragraph("Active subscribers for daily morning email delivery.", table_cell)
        ],
        [
            Paragraph("<b>newsletter_sends</b>", table_cell_bold),
            Paragraph("<code>id uuid PK</code>", table_cell),
            Paragraph("<code>sent_at, subscriber_count, hub_ids text[], status</code>", table_cell),
            Paragraph("Audit log of dispatched newsletter editions and featured hubs.", table_cell)
        ],
    ]
    schema_table = Table(schema_data, colWidths=[85, 95, 185, 150])
    schema_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), COLOR_BG_ACCENT),
        ('BOX', (0, 0), (-1, -1), 1, COLOR_BORDER),
        ('INNERGRID', (0, 0), (-1, -1), 0.5, COLOR_BORDER),
        ('TOPPADDING', (0, 0), (-1, -1), 3.5),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 3.5),
        ('LEFTPADDING', (0, 0), (-1, -1), 5),
        ('RIGHTPADDING', (0, 0), (-1, -1), 5),
    ]))
    story.append(schema_table)
    story.append(Spacer(1, 8))

    # SECTION 9: FRONTEND WEB APPLICATION & USER EXPERIENCE
    story.append(make_section_header("9. Frontend Web Application & User Experience"))
    story.append(Paragraph(
        "Panchranga's user interface is built with <b>Next.js 14 App Router</b>, React 18, and Tailwind CSS. The design embraces a high-density, authoritative editorial broadsheet aesthetic inspired by traditional Indian newspaper typography (Georgia serif headlines, clean Inter body text, and uppercase monospace metadata tags).",
        body_style
    ))

    # Frontend Feature Layout Table
    ui_data = [
        [Paragraph("<b>Component / Page</b>", table_header), Paragraph("<b>Route / Path</b>", table_header), Paragraph("<b>Key Features & Interactive Capabilities</b>", table_header)],
        [
            Paragraph("<b>Three-Column Homepage</b>", table_cell_bold),
            Paragraph("<code>/ (app/page.tsx)</code>", table_cell),
            Paragraph("• <b>Left (280px):</b> 'Today's Briefing' with micro-thumbnails & coverage bars.<br/>• <b>Center:</b> 380px featured Hero Story banner + paginated list layout.<br/>• <b>Right (300px):</b> 'Most Covered' stories + Live Fact-Check Ticker (Alt News, BOOM, Newschecker, Factly).", table_cell)
        ],
        [
            Paragraph("<b>Topic Hub Detail Page</b>", table_cell_bold),
            Paragraph("<code>/hub/[id]</code>", table_cell),
            Paragraph("• <b>Coverage Bar:</b> Full-width cross-media proportional split visualization.<br/>• <b>HubAiOverview:</b> Neutral briefing with typing animation and disclaimer.<br/>• <b>3-Lane Side-by-Side:</b> Parallel columns for Mainstream, Grassroots, Discourse.<br/>• <b>Embedded Media:</b> Native YouTube broadcast players & Reddit thread embeds.", table_cell)
        ],
        [
            Paragraph("<b>Sources Registry</b>", table_cell_bold),
            Paragraph("<code>/sources</code>", table_cell),
            Paragraph("Live public directory of all 96 verified sources with active status indicators, media lane badges, language tags, regions, and live article counts.", table_cell)
        ],
        [
            Paragraph("<b>Editorial About Page</b>", table_cell_bold),
            Paragraph("<code>/about</code>", table_cell),
            Paragraph("Full disclosure of editorial charter, algorithm mechanics, fact-checking organization links, GitHub repository, and feedback channels.", table_cell)
        ],
        [
            Paragraph("<b>Panchranga Custom Loader</b>", table_cell_bold),
            Paragraph("<code>PanchrangaLoader.tsx</code>", table_cell),
            Paragraph("5-dot horizontal wave animation in brand colors (#4A56E2, #00B8A9, #F5A623, #E84393, #FF6B6B), with smooth wordmark resolution and <code>prefers-reduced-motion</code> accessibility support.", table_cell)
        ],
        [
            Paragraph("<b>Safe Image Handling</b>", table_cell_bold),
            Paragraph("<code>/api/og-image</code> & <code>SafeImage.tsx</code>", table_cell),
            Paragraph("Proxies external images to bypass CORS/hotlink blocking; automatically falls back to clean monogram tiles if publisher CDNs return HTTP 403/404.", table_cell)
        ],
    ]
    ui_table = Table(ui_data, colWidths=[115, 110, 290])
    ui_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), COLOR_BG_ACCENT),
        ('BOX', (0, 0), (-1, -1), 1, COLOR_BORDER),
        ('INNERGRID', (0, 0), (-1, -1), 0.5, COLOR_BORDER),
        ('TOPPADDING', (0, 0), (-1, -1), 3.5),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 3.5),
        ('LEFTPADDING', (0, 0), (-1, -1), 5),
        ('RIGHTPADDING', (0, 0), (-1, -1), 5),
    ]))
    story.append(ui_table)

    # END OF PAGE 6
    story.append(PageBreak())

    # =========================================================
    # PAGE 7: AUTOMATION, PRODUCTION METRICS & SUMMARY
    # =========================================================
    story.append(make_section_header("10. Automation, CI/CD & Daily Newsletter System"))
    story.append(Paragraph(
        "Panchranga is architectured for autonomous, zero-maintenance operations. No daily human intervention is required to ingest news, cluster hubs, synthesize summaries, or deliver morning newsletters.",
        body_style
    ))

    story.append(Paragraph("<b>GitHub Actions Scheduled Workflows:</b>", h2_style))
    story.append(Paragraph("1. <b>Pipeline Ingestion Cron (<code>.github/workflows/ingest-cron.yml</code>):</b> Runs every 20 minutes (<code>cron: '*/20 * * * *'</code>). Checks out code on Node 22, injects Supabase and LLM API secrets, and executes <code>npm run pipeline</code> (fetch RSS + cluster items).", bullet_style))
    story.append(Paragraph("2. <b>Daily Newsletter Cron (<code>.github/workflows/newsletter.yml</code>):</b> Triggers every morning at <b>7:00 AM IST</b> (1:30 AM UTC). Dispatches an authenticated HTTP POST request to <code>https://panchranga.vercel.app/api/newsletter/send</code>.", bullet_style))

    story.append(Paragraph("<b>Daily Morning Newsletter Engine (<code>app/api/newsletter/send/route.ts</code>):</b>", h2_style))
    story.append(Paragraph(
        "• <b>Story Selection:</b> Automatically selects the top 3 most significant topic hubs from the past 24 hours based on source count and cross-media diversity.<br/>"
        "• <b>Email Construction:</b> Assembles a responsive, broadsheet-styled HTML email featuring lead imagery, AI-synthesized briefings, participating publisher badges, and direct links to full 3-lane coverage.<br/>"
        "• <b>Batch Delivery via Resend API:</b> Reads active subscribers from Supabase and delivers emails in concurrent batches of 50 to respect Resend gateway rate limits.<br/>"
        "• <b>1-Click Unsubscribe:</b> Every email includes a secure cryptographic UUID token allowing instant 1-click unsubscription without requiring a login.",
        body_style
    ))
    story.append(Spacer(1, 8))

    # SECTION 11: METRICS, PRODUCTION RESILIENCE & SUMMARY
    story.append(make_section_header("11. Production Metrics & Operational Resilience"))

    # Live Production Snapshot Table
    metrics_data = [
        [Paragraph("<b>Metric Dimension</b>", table_header), Paragraph("<b>Production Value</b>", table_header), Paragraph("<b>Architectural Safeguard</b>", table_header)],
        [
            Paragraph("<b>Total Configured Feeds</b>", table_cell_bold),
            Paragraph("<b>96 Sources</b> across 13 languages", table_cell),
            Paragraph("Automated fallback to Google News syndication on WAF block.", table_cell)
        ],
        [
            Paragraph("<b>Ingestion Frequency</b>", table_cell_bold),
            Paragraph("<b>Every 20 Minutes</b> (72 cycles / day)", table_cell),
            Paragraph("Bounded concurrency <code>p-limit(7)</code> prevents serverless timeouts.", table_cell)
        ],
        [
            Paragraph("<b>Active Articles Cached</b>", table_cell_bold),
            Paragraph("<b>1,000 Articles</b> in rolling window", table_cell),
            Paragraph("URL unique constraint prevents duplicate PostgreSQL upserts.", table_cell)
        ],
        [
            Paragraph("<b>Active Topic Hubs</b>", table_cell_bold),
            Paragraph("<b>707 Hubs</b> (107 Multi-Source Hubs)", table_cell),
            Paragraph("Orphaned hubs automatically cleaned up during clustering.", table_cell)
        ],
        [
            Paragraph("<b>AI Summarization</b>", table_cell_bold),
            Paragraph("<b>4-Tier Resilient Cascade</b>", table_cell),
            Paragraph("Groq -> Gemini -> OpenRouter -> Lead Snippet Rule fallback.", table_cell)
        ],
        [
            Paragraph("<b>Offline Reliability</b>", table_cell_bold),
            Paragraph("<b>100% Zero-Downtime Cache</b>", table_cell),
            Paragraph("Local JSON files mirror Supabase for instant fallback.", table_cell)
        ],
    ]
    metrics_table = Table(metrics_data, colWidths=[130, 165, 220])
    metrics_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), COLOR_BG_ACCENT),
        ('BOX', (0, 0), (-1, -1), 1, COLOR_BORDER),
        ('INNERGRID', (0, 0), (-1, -1), 0.5, COLOR_BORDER),
        ('TOPPADDING', (0, 0), (-1, -1), 3.5),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 3.5),
        ('LEFTPADDING', (0, 0), (-1, -1), 6),
        ('RIGHTPADDING', (0, 0), (-1, -1), 6),
    ]))
    story.append(metrics_table)
    story.append(Spacer(1, 8))

    # Concluding Summary Callout
    story.append(make_callout(
        "Conclusion: The Future of Indian News Aggregation",
        "Panchranga demonstrates that algorithmic automation, semantic vector search, and strict ethical guardrails can replace subjective human gatekeepers in modern media. By presenting <b>Mainstream</b>, <b>Grassroots</b>, and <b>Public Discourse</b> side by side, Panchranga equips Indian citizens with the complete spectrum of facts — allowing readers to draw their own informed conclusions. <i>Every Color of the Story.</i>",
        border_color=COLOR_BRAND_RED,
        bg_color=COLOR_BG_LIGHT
    ))
    story.append(Spacer(1, 10))

    # Signature Block
    sig_data = [
        [
            Paragraph("<b>Document Author:</b> Antigravity Engineering", table_cell),
            Paragraph("<b>Repository:</b> github.com/Ravivishwakarma1/Panchranga", table_cell),
            Paragraph("<b>Deployment:</b> panchranga.vercel.app", table_cell),
        ]
    ]
    sig_table = Table(sig_data, colWidths=[171, 171, 171])
    sig_table.setStyle(TableStyle([
        ('LINEABOVE', (0, 0), (-1, -1), 1, COLOR_BORDER),
        ('TOPPADDING', (0, 0), (-1, -1), 6),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 2),
        ('LEFTPADDING', (0, 0), (-1, -1), 0),
        ('RIGHTPADDING', (0, 0), (-1, -1), 0),
    ]))
    story.append(sig_table)

    # Build Document with NumberedCanvas
    doc.build(story, canvasmaker=NumberedCanvas)
    print(f"[DONE] PDF generation complete: {output_filename}")


if __name__ == "__main__":
    output_pdf = sys.argv[1] if len(sys.argv) > 1 else "Panchranga-System-Architecture-and-How-It-Works.pdf"
    generate_pdf(output_pdf)
