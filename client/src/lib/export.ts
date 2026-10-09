// Export service: a redacted PDF report per call.
// Card numbers, emails and PH mobiles are always redacted — never export raw PII.
import { jsPDF } from "jspdf";
import { callTitle, type DemoCall } from "../mock";
import { STATUS_LABEL, scoreCall, type Check } from "./scorecard";
import { redactPII } from "./pii";

export function exportPDF(call: DemoCall, checks: Check[]): void {
  const { score, status } = scoreCall(checks, call.results);
  const doc = new jsPDF();
  let y = 18;
  doc.setFontSize(16);
  doc.text(`Linewise — ${callTitle(call)} (REDACTED)`, 14, y);
  y += 8;
  doc.setFontSize(11);
  doc.text(`Agent: ${call.agent}  Duration: ${call.duration}  Scorecard: ${call.scorecard}`, 14, y);
  y += 7;
  doc.text(`Score: ${score} / 100  Status: ${STATUS_LABEL[status]}`, 14, y);
  y += 10;
  doc.setFontSize(12);
  doc.text("Scorecard", 14, y);
  y += 7;
  doc.setFontSize(10);
  for (const c of checks) {
    const r = call.results.find((x) => x.check_id === c.id);
    const badge = !r || r.verdict === "not_applicable" ? "N/A" : r.verdict.toUpperCase();
    doc.text(`[${badge}] ${c.label} (${c.weight})`, 14, y);
    y += 6;
    if (r?.evidence) {
      for (const line of doc.splitTextToSize(`   "${redactPII(r.evidence, call.redactions)}"`, 175) as string[]) {
        doc.text(line, 14, y);
        y += 5;
      }
    }
    if (y > 270) {
      doc.addPage();
      y = 18;
    }
  }
  y += 4;
  doc.setFontSize(12);
  doc.text("Transcript (redacted)", 14, y);
  y += 7;
  doc.setFontSize(10);
  for (const l of call.lines) {
    for (const line of doc.splitTextToSize(`[${l.time}] ${l.speaker}: ${redactPII(l.text, call.redactions)}`, 175) as string[]) {
      doc.text(line, 14, y);
      y += 5;
      if (y > 280) {
        doc.addPage();
        y = 18;
      }
    }
  }
  doc.save(`qa-call-${call.id}-redacted.pdf`);
}
