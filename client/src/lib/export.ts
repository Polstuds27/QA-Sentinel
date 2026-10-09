// Export service: a redacted PDF report per call, on Linewise's own letterhead.
// Card numbers, emails and PH mobiles are always redacted — never export raw PII.
import { jsPDF } from "jspdf";
import { callTitle, type DemoCall } from "../mock";
import { BY_HAND_NOTE, NOT_ENGLISH_NOTE, STATUS_LABEL, gradeCall, type Check, type Decisions } from "./scorecard";
import { redactPII } from "./pii";

type RGB = [number, number, number];

// The fixed inks from index.css (--ink, --cobalt and the light-theme neutrals). Reports
// keep these colours whatever theme the app is in.
const INK: RGB = [17, 17, 17];
const COBALT: RGB = [29, 63, 209];
const MUTED: RGB = [93, 93, 88];
const RULE: RGB = [220, 220, 216];
const DESTRUCTIVE: RGB = [179, 38, 30];

// A4 in millimetres.
const PAGE_W = 210;
const PAGE_H = 297;
const MARGIN = 16;
const RIGHT = PAGE_W - MARGIN;
const HEADER_RULE = 23;
const FOOTER_RULE = PAGE_H - 19;
const BODY_TOP = HEADER_RULE + 12;
const BODY_BOTTOM = FOOTER_RULE - 6;

// The logo mark from components/logo.tsx, drawn as vectors: an L on a 24-unit square
// with the cobalt dot in its open corner.
function drawMark(doc: jsPDF, x: number, y: number, size: number) {
  const u = size / 24;
  doc.setFillColor(...INK);
  doc.rect(x + 3 * u, y + 3 * u, 4 * u, 18 * u, "F");
  doc.rect(x + 3 * u, y + 17 * u, 18 * u, 4 * u, "F");
  doc.setFillColor(...COBALT);
  doc.circle(x + 15.5 * u, y + 8.5 * u, 4 * u, "F");
}

function hairline(doc: jsPDF, y: number, color: RGB = RULE) {
  doc.setDrawColor(...color);
  doc.setLineWidth(0.2);
  doc.line(MARGIN, y, RIGHT, y);
}

// The letterhead and the footer, stamped on every page once the body is laid out.
function stampPages(doc: jsPDF, title: string, generated: string) {
  const pages = doc.getNumberOfPages();
  for (let page = 1; page <= pages; page++) {
    doc.setPage(page);

    drawMark(doc, MARGIN, 10, 9);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(15);
    doc.setTextColor(...INK);
    doc.text("Linewise", MARGIN + 12, 17);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(...MUTED);
    doc.text("Call QA report", RIGHT, 14, { align: "right" });
    doc.text(title, RIGHT, 18.5, { align: "right" });
    hairline(doc, HEADER_RULE, INK);

    hairline(doc, FOOTER_RULE);
    doc.setFontSize(8);
    doc.setTextColor(...INK);
    doc.text("Redacted copy. Scored on this device by Linewise; the recording never left it.", MARGIN, FOOTER_RULE + 6);
    doc.setTextColor(...MUTED);
    doc.text(`Generated ${generated}`, MARGIN, FOOTER_RULE + 10.5);
    doc.text(`Page ${page} of ${pages}`, RIGHT, FOOTER_RULE + 6, { align: "right" });
  }
}

export function exportPDF(call: DemoCall, checks: Check[], decisions: Decisions = {}): void {
  const grade = gradeCall(call, checks, decisions);
  const { score, status } = grade;
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const title = callTitle(call);
  let y = BODY_TOP;

  // Start a new page when the next block would run into the footer.
  const room = (height: number) => {
    if (y + height > BODY_BOTTOM) {
      doc.addPage();
      y = BODY_TOP;
    }
  };
  const heading = (text: string) => {
    room(16);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.setTextColor(...INK);
    doc.text(text, MARGIN, y);
    y += 3;
    hairline(doc, y);
    y += 6;
  };

  // Call and score.
  const failed = status === "red";
  doc.setFont("helvetica", "bold");
  doc.setFontSize(22);
  doc.setTextColor(...INK);
  doc.text(title, MARGIN, y);
  doc.setTextColor(...MUTED);
  if (score === null) {
    doc.text(`${checks.length - grade.pending} of ${checks.length} reviewed`, RIGHT, y, { align: "right" });
  } else {
    doc.text(" / 100", RIGHT, y, { align: "right" });
    doc.setTextColor(...(failed ? DESTRUCTIVE : INK));
    doc.text(String(score), RIGHT - doc.getTextWidth(" / 100"), y, { align: "right" });
  }
  y += 7;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9.5);
  doc.setTextColor(...MUTED);
  doc.text(`Agent: ${call.agent}  ·  ${call.duration}  ·  ${call.scorecard}`, MARGIN, y);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...(failed ? DESTRUCTIVE : INK));
  doc.text(STATUS_LABEL[status], RIGHT, y, { align: "right" });
  if (grade.byHand) {
    y += 6;
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...INK);
    const note = doc.splitTextToSize(score === null ? NOT_ENGLISH_NOTE : BY_HAND_NOTE, RIGHT - MARGIN) as string[];
    doc.text(note, MARGIN, y);
    y += (note.length - 1) * 4.5;
  }
  y += 14;

  // Scorecard: verdict, check and weight, with the quoted evidence under it.
  heading("Scorecard");
  const labelX = MARGIN + 24;
  const labelW = RIGHT - 14 - labelX;
  for (const c of checks) {
    // On a call scored by hand, a check the analyst has not marked yet reads "Review".
    const r = grade.results.find((x) => x.check_id === c.id);
    const verdict = grade.byHand && !r ? "Review" : !r || r.verdict === "not_applicable" ? "N/A" : r.verdict === "pass" ? "Pass" : c.critical ? "Critical" : "Fail";
    doc.setFontSize(10);
    const label = doc.splitTextToSize(c.label, labelW) as string[];
    doc.setFontSize(9);
    const evidence = r?.evidence ? (doc.splitTextToSize(`"${redactPII(r.evidence, call.redactions)}"`, labelW) as string[]) : [];
    room(label.length * 5 + evidence.length * 4.5 + 3);

    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(...(verdict === "Pass" ? INK : verdict === "N/A" || verdict === "Review" ? MUTED : DESTRUCTIVE));
    doc.text(verdict, MARGIN, y);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...INK);
    doc.text(label, labelX, y, { lineHeightFactor: 1.4 });
    doc.setTextColor(...MUTED);
    doc.text(String(c.weight), RIGHT, y, { align: "right" });
    y += label.length * 5;
    if (evidence.length > 0) {
      doc.setFont("helvetica", "italic");
      doc.setFontSize(9);
      doc.text(evidence, labelX, y, { lineHeightFactor: 1.4 });
      y += evidence.length * 4.5;
    }
    y += 3;
  }
  y += 6;

  // Transcript: time, speaker, then what was said.
  heading("Transcript (redacted)");
  const textX = MARGIN + 38;
  const textW = RIGHT - textX;
  doc.setFontSize(9.5);
  for (const l of call.lines) {
    doc.setFont("helvetica", "normal");
    const lines = doc.splitTextToSize(redactPII(l.text, call.redactions), textW) as string[];
    lines.forEach((line, i) => {
      room(5);
      if (i === 0) {
        doc.setTextColor(...MUTED);
        doc.text(l.time, MARGIN, y);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(...INK);
        doc.text(l.speaker, MARGIN + 14, y);
        doc.setFont("helvetica", "normal");
      }
      doc.setTextColor(...INK);
      doc.text(line, textX, y);
      y += 5;
    });
    y += 1.5;
  }

  stampPages(doc, title, new Date().toLocaleString("en-PH", { dateStyle: "medium", timeStyle: "short" }));
  doc.save(`linewise-call-${call.id}-redacted.pdf`);
}
