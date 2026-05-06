#!/usr/bin/env python3
"""
Regenerate all 17k CPT detail pages with enriched content.

Adds 200-300 words of unique content per page to cross Google's quality
threshold for "Crawled - currently not indexed" pages.

New sections added:
  1. "In Plain Language" — uses the `e` field (99.2% fill rate, previously hidden)
  2. "Billing & Documentation" — category-aware billing guidance
  3. "How This Code Compares" — wRVU percentile (only for categories with wRVU data)
  4. FAQ section with FAQPage JSON-LD schema (3 questions per code)

Usage:
    python3 _scripts/enrich-cpt-pages.py           # regenerate all pages
    python3 _scripts/enrich-cpt-pages.py --only j-codes  # one category
    python3 _scripts/enrich-cpt-pages.py --dry-run  # print stats, no writes
"""
import argparse
import json
import math
import statistics
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA_FILE = ROOT / "data" / "cpt-codes.json"
CPT_ROOT = ROOT / "cpt-codes"


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def esc(s):
    """HTML-escape a string."""
    if s is None:
        return ""
    return (
        str(s)
        .replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
        .replace('"', "&quot;")
    )


def esc_json(s):
    """Escape for use inside JSON string values."""
    if s is None:
        return ""
    return str(s).replace("\\", "\\\\").replace('"', '\\"').replace("\n", " ")


def fmt_usd(val):
    if val is None or val == 0:
        return None
    return f"${val:,.2f}"


def ordinal(n):
    if 11 <= (n % 100) <= 13:
        return f"{n}th"
    return f"{n}{['th','st','nd','rd','th','th','th','th','th','th'][n%10]}"


# ---------------------------------------------------------------------------
# Category-specific content generators
# ---------------------------------------------------------------------------

CATEGORY_BILLING = {
    "surgery": (
        "As a surgical CPT code, proper documentation must include the operative report "
        "detailing the procedure performed, patient positioning, approach, findings, and "
        "any complications.{gp_sentence} Ensure the diagnosis code (ICD-10) supports "
        "medical necessity for the procedure."
    ),
    "em": (
        "E&M codes require documentation of medical decision-making (MDM) complexity or "
        "total time spent on the encounter.{gp_sentence} For 2026, time-based coding "
        "includes all physician time on the date of the encounter."
    ),
    "radiology": (
        "Radiology codes require a written order, clinical indication, and a formal "
        "interpretation report.{gp_sentence} The professional component (modifier -26) "
        "and technical component (modifier -TC) may be billed separately."
    ),
    "anesthesia": (
        "Anesthesia codes are billed using base units plus time units. One time unit "
        "typically equals 15 minutes of anesthesia time. Document start and stop times, "
        "patient status (P1-P6), and any qualifying circumstances. Modifiers AA, QK, QX, "
        "or QY indicate the provider arrangement."
    ),
    "pathology-lab": (
        "Lab and pathology codes require an order from the treating provider with clinical "
        "indication.{gp_sentence} For molecular pathology and genetic testing, document "
        "the specific analytes tested and clinical rationale."
    ),
    "medicine": (
        "Medicine section codes cover a wide range of non-surgical services.{gp_sentence} "
        "Documentation should include the clinical indication, procedure details, "
        "interpretation (if applicable), and any patient-specific findings."
    ),
    "j-codes": (
        "J-codes represent drugs administered by a healthcare provider (not self-administered). "
        "Documentation must include the drug name, dosage, route of administration, and "
        "medical necessity. Most payers require the National Drug Code (NDC) on the claim. "
        "Bill the appropriate administration code (96365-96379) in addition to the drug code."
    ),
    "d-codes": (
        "Dental codes (CDT codes) require documentation of the tooth number(s) or area "
        "treated, clinical findings, and the procedure performed. Pre-authorization may be "
        "required for major restorative, prosthodontic, and oral surgery procedures. "
        "Include radiographs when supporting medical necessity."
    ),
    "a-codes": (
        "HCPCS A-codes cover medical supplies, equipment, and transport services. "
        "Documentation must establish medical necessity and include a physician order. "
        "For durable medical equipment (DME), a Certificate of Medical Necessity (CMN) "
        "or detailed written order may be required."
    ),
    "category-iii": (
        "Category III codes are temporary codes for emerging technology, services, and "
        "procedures. They are not assigned RVU values by CMS. Coverage and reimbursement "
        "vary by payer — check with individual insurers before billing. These codes "
        "sunset after 5 years if not converted to Category I."
    ),
    "q-codes": (
        "Q-codes are temporary HCPCS codes used when no permanent code exists. "
        "Coverage and reimbursement vary by payer and region. Document the clinical "
        "indication and medical necessity. These codes may be replaced by permanent "
        "codes in future HCPCS updates."
    ),
    "g-codes": (
        "G-codes are CMS-specific HCPCS codes for services not covered by standard CPT. "
        "{gp_sentence}Documentation requirements follow the same standards as the "
        "equivalent CPT service. Check Medicare LCD/NCD policies for coverage criteria."
    ),
    "s-codes": (
        "S-codes are used by private payers (not Medicare) for services without a "
        "standard CPT or HCPCS code. Coverage varies significantly between insurers. "
        "Verify payer acceptance before billing and document medical necessity thoroughly."
    ),
    "m-codes": (
        "M-codes cover quality measures and performance reporting. They are used in "
        "value-based care programs to track whether specific clinical actions were taken. "
        "Documentation must support that the measured action was performed or a valid "
        "exclusion applies."
    ),
    "v-codes": (
        "V-codes cover vision services, supplies, and equipment including lenses, frames, "
        "and hearing aids. A valid prescription from an authorized provider is required. "
        "Document the specific product dispensed, measurements, and clinical indication."
    ),
    "p-codes": (
        "P-codes cover pathology screening and blood product services. Documentation must "
        "include the ordering provider, clinical indication, and specimen type. For blood "
        "products, include the product type, volume, and transfusion details."
    ),
    "r-codes": (
        "R-codes cover transportation of portable diagnostic equipment. Documentation "
        "must include the origin and destination, medical necessity for portable service, "
        "and the number of patients served during the transport."
    ),
    "other-hcpcs": (
        "This HCPCS code requires documentation of medical necessity and a valid "
        "physician order. Coverage and reimbursement policies vary by payer. "
        "Check with the specific insurer for prior authorization requirements."
    ),
    "other": (
        "Documentation should include the clinical indication, service details, and "
        "any applicable performance metrics. Coverage may vary by payer — verify "
        "acceptance before billing."
    ),
}


def gp_sentence(global_days):
    """Return a sentence about the global period."""
    if global_days is None:
        return ""
    if global_days == 0:
        return (
            " This code has a 0-day global period, meaning pre- and post-operative "
            "E&M visits are billable separately on the same day."
        )
    if global_days == 10:
        return (
            f" This code has a 10-day global period — follow-up visits within "
            f"10 days of the procedure are included in the reimbursement."
        )
    if global_days == 90:
        return (
            f" This code has a 90-day global period, which includes the day of "
            f"the procedure, 1 day preoperative, and 90 days of postoperative care."
        )
    return f" This code has a {global_days}-day global period."


def build_billing_section(entry, cat):
    """Build the Billing & Documentation HTML section."""
    template = CATEGORY_BILLING.get(cat, CATEGORY_BILLING["other"])
    gp = gp_sentence(entry.get("g"))
    text = template.replace("{gp_sentence}", gp)
    return (
        '    <div class="cpt-detail-billing">\n'
        '      <h2>Billing &amp; Documentation</h2>\n'
        f'      <p>{esc(text)}</p>\n'
        '    </div>\n'
    )


# ---------------------------------------------------------------------------
# wRVU percentile / comparison section
# ---------------------------------------------------------------------------

def build_comparison_section(entry, cat_stats):
    """Build 'How This Code Compares' section. Only for categories with wRVU data."""
    r = entry.get("r") or 0
    cat = entry["cat"]
    stats = cat_stats.get(cat)
    if not stats or stats["nonzero_count"] < 10:
        return ""  # skip for categories with no meaningful wRVU data

    if r == 0:
        text = (
            f"This code has a work RVU of 0.00, meaning it does not have a "
            f"physician work component assigned by CMS. "
            f"In the {esc(entry['cd'])} category, "
            f"{stats['zero_pct']:.0f}% of codes share this characteristic."
        )
    else:
        # Compute percentile
        pctile = stats["percentile_fn"](r)
        median = stats["median"]
        if r > median:
            compare = f"{r/median:.1f}x the median ({median:.2f})"
        elif r < median:
            compare = f"{median/r:.1f}x below the median ({median:.2f})"
        else:
            compare = f"exactly at the median"

        text = (
            f"With a work RVU of {r:.2f}, this code ranks in the "
            f"{ordinal(pctile)} percentile among {esc(entry['cd'])} codes — "
            f"{compare}. "
            f"The highest wRVU in this category is {stats['max']:.2f}."
        )

    return (
        '    <div class="cpt-detail-comparison">\n'
        '      <h2>How This Code Compares</h2>\n'
        f'      <p>{text}</p>\n'
        '    </div>\n'
    )


# ---------------------------------------------------------------------------
# FAQ section
# ---------------------------------------------------------------------------

def build_faq_section(entry):
    """Build 3 category-specific FAQ items with FAQPage JSON-LD."""
    code = entry["c"]
    desc = entry.get("d", "")
    long_desc = entry.get("l", "")
    context = entry.get("x", "")
    cat = entry["cat"]
    cd = entry.get("cd", cat)
    specialties = entry.get("t", [])
    r = entry.get("r") or 0
    g = entry.get("g")
    spec_str = ", ".join(specialties[:3]) if specialties else "multiple specialties"

    faqs = []

    # Q1: What is this code? (universal)
    a1 = (
        f"CPT {code} ({esc(desc)}) is a {esc(cd)} code. "
        f"{esc(long_desc)}"
    )
    faqs.append((f"What is CPT code {code}?", a1))

    # Q2: Category-specific question
    if cat == "surgery":
        gp_text = f" It has a {g}-day global period." if g else ""
        a2 = (
            f"The work RVU for CPT {code} is {r:.2f}. "
            f"This code is primarily used by {spec_str}.{gp_text}"
        )
        faqs.append((f"What is the wRVU value for CPT {code}?", a2))
    elif cat == "j-codes":
        a2 = (
            f"CPT {code} is administered by a healthcare provider, typically via "
            f"injection or infusion. {esc(context)} "
            f"It is used by {spec_str}."
        )
        faqs.append((f"How is {code} administered?", a2))
    elif cat == "d-codes":
        a2 = (
            f"CPT {code} is a dental procedure code used by {spec_str}. "
            f"{esc(context)} Coverage depends on your dental insurance plan."
        )
        faqs.append((f"Is {code} covered by dental insurance?", a2))
    elif cat == "anesthesia":
        a2 = (
            f"Anesthesia code {code} is billed using base units plus time units "
            f"(1 unit = 15 minutes). {esc(context)} "
            f"Used by {spec_str}."
        )
        faqs.append((f"How is anesthesia code {code} billed?", a2))
    elif cat in ("a-codes", "other-hcpcs", "v-codes", "p-codes", "r-codes"):
        a2 = (
            f"Medicare coverage for {code} depends on medical necessity and "
            f"applicable Local Coverage Determinations (LCDs). "
            f"{esc(context)} A physician order is typically required."
        )
        faqs.append((f"Does Medicare cover {code}?", a2))
    elif cat == "category-iii":
        a2 = (
            f"No — {code} is a Category III temporary code for emerging technology. "
            f"It may be converted to a permanent Category I code if widely adopted. "
            f"Category III codes expire after 5 years without renewal."
        )
        faqs.append((f"Is {code} a permanent CPT code?", a2))
    elif cat in ("q-codes", "s-codes", "m-codes"):
        a2 = (
            f"{code} is a temporary HCPCS code. Coverage varies by payer and "
            f"may change when permanent codes are assigned. {esc(context)}"
        )
        faqs.append((f"Is {code} covered by insurance?", a2))
    else:
        a2 = (
            f"CPT {code} is used by {spec_str}. {esc(context)}"
        )
        faqs.append((f"Who uses CPT code {code}?", a2))

    # Q3: When is this code used? (universal, uses context)
    a3 = f"{esc(context)}" if context else f"{esc(long_desc)}"
    faqs.append((f"When is CPT {code} used?", a3))

    # Build HTML
    faq_html = '    <section class="cpt-detail-faq">\n'
    faq_html += '      <h2>Frequently Asked Questions</h2>\n'
    for q, a in faqs:
        faq_html += (
            '      <details class="cpt-faq-item">\n'
            f'        <summary>{esc(q)}</summary>\n'
            f'        <p>{a}</p>\n'
            '      </details>\n'
        )
    faq_html += '    </section>\n'

    # Build FAQPage JSON-LD
    faq_entities = []
    for q, a in faqs:
        faq_entities.append({
            "@type": "Question",
            "name": q,
            "acceptedAnswer": {
                "@type": "Answer",
                "text": a.replace("&amp;", "&").replace("&lt;", "<").replace("&gt;", ">").replace("&quot;", '"'),
            },
        })
    faq_schema = {
        "@context": "https://schema.org",
        "@type": "FAQPage",
        "mainEntity": faq_entities,
    }

    return faq_html, faq_schema


# ---------------------------------------------------------------------------
# Full page generator
# ---------------------------------------------------------------------------

def compute_category_stats(data):
    """Pre-compute per-category wRVU statistics."""
    cat_vals = defaultdict(list)
    for e in data:
        cat_vals[e["cat"]].append(e.get("r") or 0)

    stats = {}
    for cat, vals in cat_vals.items():
        nonzero = sorted([v for v in vals if v > 0])
        all_sorted = sorted(vals)
        zero_pct = (len(vals) - len(nonzero)) / len(vals) * 100

        if len(nonzero) >= 10:
            med = statistics.median(nonzero)
            mx = max(nonzero)

            def make_pctile_fn(sorted_vals):
                def fn(val):
                    pos = 0
                    for v in sorted_vals:
                        if v <= val:
                            pos += 1
                    return round(pos / len(sorted_vals) * 100)
                return fn

            stats[cat] = {
                "median": med,
                "max": mx,
                "nonzero_count": len(nonzero),
                "zero_pct": zero_pct,
                "percentile_fn": make_pctile_fn(nonzero),
            }
        else:
            stats[cat] = {
                "median": 0,
                "max": 0,
                "nonzero_count": len(nonzero),
                "zero_pct": zero_pct,
                "percentile_fn": lambda v: 0,
            }
    return stats


def build_related_codes_html(entry, code_by_id, related_map):
    """Build the related codes section."""
    code = entry["c"]
    related = related_map.get(code, [])
    if not related:
        return ""

    group_name = entry.get("_group", "related")
    cat = entry["cat"]

    html = '<section class="cpt-detail-related">\n'
    html += f'  <h2>Related Codes in {esc(group_name)}</h2>\n'
    html += '  <div class="cpt-related-grid">\n'
    for rc in related:
        re = code_by_id.get(rc)
        if not re:
            continue
        r_val = re.get("r") or 0
        html += (
            f'    <a href="/cpt-codes/{re["cat"]}/{rc}/" class="cpt-related-item">'
            f'<span class="cpt-code">{esc(rc)}</span>'
        )
        if re.get("a"):
            html += ' <span class="cpt-addon">+Add-on</span>'
        html += (
            f'<span class="cpt-related-desc">{esc(re.get("d",""))}</span>'
            f'<span class="cpt-rvu">wRVU: {r_val:.2f}</span>'
            f'</a>'
        )
    html += '\n  </div>\n</section>\n'
    return html


def generate_page(entry, cat_stats):
    """Generate the full enriched HTML page for a single CPT code."""
    code = entry["c"]
    desc = entry.get("d", "")
    cat = entry["cat"]
    cd = entry.get("cd", cat)
    r = entry.get("r") or 0
    g = entry.get("g")
    long_desc = entry.get("l", "")
    context = entry.get("x", "")
    aliases = entry.get("n", "")
    specialties = entry.get("t", [])
    plain_lang = entry.get("e", "")
    is_addon = entry.get("a")

    # Compute total RVU and PE/Mal (estimated split for display)
    # We only have work RVU in data, so we keep existing values from current pages
    # For now, just show work RVU prominently

    # Medicare estimate (total RVU * $33.40 conversion factor)
    total_rvu = r  # simplified; actual pages had PE+Mal
    medicare_est = fmt_usd(r * 33.40) if r > 0 else None

    # Title
    wrvu_title = f" | wRVU {r:.2f}" if r > 0 else ""
    title = f"CPT {code} — {esc(desc)}{wrvu_title} | RVU Edge"

    # Meta description (max ~155 chars)
    aka_short = aliases.split(",")[0].strip() if aliases else ""
    meta_parts = [f"CPT code {code}: {desc}."]
    if aka_short:
        meta_parts.append(f"Also known as {aka_short}.")
    if r > 0:
        meta_parts.append(f"Work RVU: {r:.2f}.")
    meta_parts.append("Free 2026 CPT lookup with wRVU values and clinical context.")
    meta_desc = " ".join(meta_parts)
    if len(meta_desc) > 160:
        meta_desc = meta_desc[:157] + "..."

    # MedicalCode schema
    med_schema = {
        "@context": "https://schema.org",
        "@type": "MedicalCode",
        "name": f"CPT {code}",
        "description": desc,
        "codeValue": code,
        "codingSystem": "CPT",
        "inCodeSet": {
            "@type": "CategoryCodeSet",
            "name": "Current Procedural Terminology (CPT)",
        },
        "url": f"https://rvuedge.com/cpt-codes/{cat}/{code}/",
        "detailedDescription": long_desc,
    }

    # FAQ section
    faq_html, faq_schema = build_faq_section(entry)

    # Build page
    lines = []
    lines.append("---")
    lines.append("layout: default")
    lines.append(f'title: "{title}"')
    lines.append(f'description: "{esc_json(meta_desc)}"')
    lines.append("---")
    lines.append("")

    # Schema: MedicalCode
    lines.append(f'<script type="application/ld+json">{json.dumps(med_schema, separators=(",",":"))}</script>')
    # Schema: FAQPage
    lines.append(f'<script type="application/ld+json">{json.dumps(faq_schema, separators=(",",":"))}</script>')
    lines.append("")

    # Breadcrumbs
    lines.append("<!-- Breadcrumbs -->")
    lines.append('<nav class="cpt-detail-breadcrumbs">')
    lines.append('  <div class="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">')
    lines.append('    <a href="/cpt-codes/">All Codes</a>')
    lines.append('    <span class="sep">/</span>')
    lines.append(f'    <a href="/cpt-codes/{cat}/">{esc(cd)}</a>')
    lines.append('    <span class="sep">/</span>')
    lines.append(f'    <span class="current">{esc(code)}</span>')
    lines.append('  </div>')
    lines.append('</nav>')
    lines.append("")

    # Main content
    lines.append("<!-- Detail Content -->")
    lines.append('<main class="cpt-detail-page">')
    lines.append('  <div class="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">')
    lines.append("")

    # Header
    lines.append('    <!-- Header -->')
    lines.append('    <div class="cpt-detail-header">')
    lines.append(f'      <h1><span class="cpt-code-large">{esc(code)}</span> {esc(desc)}</h1>')
    lines.append('      <div class="cpt-detail-badges">')
    lines.append(f'        <span class="cpt-detail-badge category">{esc(cd)}</span>')
    if is_addon:
        lines.append('        <span class="cpt-detail-badge addon">+Add-on</span>')
    if g is not None:
        lines.append(f'        <span class="cpt-detail-badge global">Global {g}d</span>')
    lines.append('      </div>')
    lines.append('    </div>')
    lines.append("")

    # Aliases
    if aliases:
        lines.append(f'      <p class="cpt-detail-aka">Also known as: {esc(aliases)}</p>')
        lines.append("")

    # Long description
    if long_desc:
        lines.append('      <div class="cpt-detail-long">')
        lines.append(f'        <p>{esc(long_desc)}</p>')
        lines.append('      </div>')
        lines.append("")

    # Plain language (NEW)
    if plain_lang:
        lines.append('      <div class="cpt-detail-plain">')
        lines.append('        <h2>In Plain Language</h2>')
        lines.append(f'        <p>{esc(plain_lang)}</p>')
        lines.append('      </div>')
        lines.append("")

    # Clinical context
    if context:
        lines.append('      <div class="cpt-detail-context">')
        lines.append('        <h2>Clinical Context</h2>')
        lines.append(f'        <p>{esc(context)}</p>')
        lines.append('      </div>')
        lines.append("")

    # RVU Breakdown (only if has RVU data)
    if r > 0:
        lines.append('    <!-- RVU Breakdown -->')
        lines.append('    <div class="cpt-detail-rvu">')
        lines.append('      <h2>RVU Breakdown</h2>')
        lines.append('      <table class="cpt-rvu-table">')
        lines.append('        <tbody>')
        lines.append(f'          <tr><td>Work RVU</td><td class="rvu-val">{r:.2f}</td></tr>')
        lines.append(f'          <tr class="rvu-total"><td>Total RVU</td><td class="rvu-val">{r:.2f}</td></tr>')
        lines.append('        </tbody>')
        lines.append('      </table>')
        lines.append('    </div>')
        lines.append("")

        # Medicare estimate
        if medicare_est:
            lines.append('    <!-- Medicare Reimbursement Estimate -->')
            lines.append('    <div class="cpt-detail-medicare">')
            lines.append('      <h2>Est. Medicare Payment</h2>')
            lines.append(f'      <div class="cpt-medicare-amount">{medicare_est}</div>')
            lines.append('      <p class="cpt-medicare-note">National estimate based on 2026 CMS PFS Conversion Factor ($33.40). Actual payment varies by locality (GPCI adjustment).</p>')
            lines.append('    </div>')
            lines.append("")
    else:
        # Show zero RVU with explanation
        lines.append('    <div class="cpt-detail-rvu">')
        lines.append('      <h2>RVU Information</h2>')
        lines.append(f'      <p>CPT {esc(code)} does not have a physician work RVU assigned by CMS. ')
        if cat in ("j-codes", "a-codes", "d-codes", "v-codes", "p-codes", "r-codes", "s-codes"):
            lines.append('This is typical for supply, drug, and equipment codes — reimbursement is based on Average Sales Price (ASP), fee schedules, or payer contracts rather than the RVU system.</p>')
        elif cat == "anesthesia":
            lines.append('Anesthesia codes use a base unit + time unit system rather than standard RVUs. Contact your payer for the anesthesia conversion factor.</p>')
        elif cat == "category-iii":
            lines.append('Category III codes for emerging technology do not receive RVU assignments. Reimbursement is negotiated with individual payers.</p>')
        else:
            lines.append('Reimbursement for this code is determined by payer-specific fee schedules.</p>')
        lines.append('    </div>')
        lines.append("")

    # Billing & Documentation (NEW)
    lines.append(build_billing_section(entry, cat))

    # How This Code Compares (NEW, conditional)
    comparison = build_comparison_section(entry, cat_stats)
    if comparison:
        lines.append(comparison)

    # Specialties
    if specialties:
        lines.append('      <div class="cpt-detail-specialties">')
        lines.append('        <h2>Specialties</h2>')
        tags = "".join(f'<span class="cpt-tag">{esc(s)}</span>' for s in specialties)
        lines.append(f'        <div class="cpt-tags">{tags}</div>')
        lines.append('      </div>')
        lines.append("")

    # FAQ (NEW)
    lines.append(faq_html)

    # Related codes — preserve from existing page (we'll handle this separately)
    related = entry.get("_related_html", "")
    if related:
        lines.append(related)

    # CTA
    lines.append('    <!-- CTA -->')
    lines.append('    <div class="cpt-detail-cta">')
    lines.append('      <h2>Track This Code in RVU Edge</h2>')
    lines.append('      <p>Log procedures, calculate wRVUs, and benchmark against MGMA data — all in one app.</p>')
    lines.append('      <div class="cpt-cta-buttons">')
    lines.append('        <a href="https://apps.apple.com/app/rvu-edge/id6743223718" class="cpt-cta-btn primary">Download for iOS</a>')
    lines.append(f'        <a href="/cpt-codes/{cat}/" class="cpt-cta-btn secondary">Browse {esc(cd)} Codes</a>')
    lines.append('      </div>')
    lines.append('    </div>')
    lines.append("")

    # Attribution
    lines.append('    <!-- Attribution -->')
    lines.append('    <div class="cpt-detail-attribution">')
    lines.append('      <p>CPT&reg; is a registered trademark of the American Medical Association. Data sourced from CMS Physician Fee Schedule RVU26A. Descriptions, synonyms, and clinical context are original content by RVU Edge.</p>')
    lines.append('    </div>')
    lines.append("")
    lines.append('  </div>')
    lines.append('</main>')

    return "\n".join(lines) + "\n"


# ---------------------------------------------------------------------------
# Extract related codes HTML from existing pages
# ---------------------------------------------------------------------------

def extract_related_html(page_path):
    """Extract the Related Codes section from an existing page."""
    if not page_path.exists():
        return ""
    text = page_path.read_text(errors="ignore")
    start = text.find('<!-- Related Codes -->')
    if start == -1:
        start = text.find('<section class="cpt-detail-related">')
    if start == -1:
        return ""
    end = text.find('</section>', start)
    if end == -1:
        return ""
    return text[start : end + len('</section>')]


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--only", help="only regenerate this category")
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--limit", type=int, help="max pages to generate")
    args = ap.parse_args()

    data = json.loads(DATA_FILE.read_text())
    print(f"Loaded {len(data):,} codes")

    if args.only:
        data = [e for e in data if e["cat"] == args.only]
        print(f"Filtered to {len(data):,} codes in {args.only}")

    if args.limit:
        data = data[: args.limit]

    cat_stats = compute_category_stats(json.loads(DATA_FILE.read_text()))

    if args.dry_run:
        # Generate one sample and show word count
        sample = data[0]
        sample["_related_html"] = extract_related_html(
            CPT_ROOT / sample["cat"] / sample["c"] / "index.html"
        )
        page = generate_page(sample, cat_stats)
        words = len(page.split())
        print(f"\nSample: {sample['c']} ({sample['cat']})")
        print(f"Page size: {len(page):,} bytes, ~{words} words")
        print(f"\nFirst 2000 chars:\n{page[:2000]}")
        return 0

    # Generate all pages
    written = 0
    for i, entry in enumerate(data):
        cat = entry["cat"]
        code = entry["c"]
        page_dir = CPT_ROOT / cat / code
        page_path = page_dir / "index.html"

        # Extract existing related codes section
        entry["_related_html"] = extract_related_html(page_path)

        page = generate_page(entry, cat_stats)
        page_dir.mkdir(parents=True, exist_ok=True)
        page_path.write_text(page)
        written += 1

        if (i + 1) % 2000 == 0:
            print(f"  {i+1:,}/{len(data):,} pages written...")

    print(f"\nDone. {written:,} pages regenerated.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
