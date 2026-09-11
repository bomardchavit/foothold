import React from "react";
import { Document, Page, Text, View, StyleSheet, renderToBuffer } from "@react-pdf/renderer";
import type { ResumeContent } from "@foothold/shared";

// ATS-safe: single column, real text, standard fonts, no icons, no tables.
const s = StyleSheet.create({
  page: { paddingTop: 40, paddingBottom: 40, paddingHorizontal: 48, fontFamily: "Helvetica", fontSize: 10, lineHeight: 1.35, color: "#111" },
  name: { fontSize: 18, fontFamily: "Helvetica-Bold", marginBottom: 2 },
  contact: { fontSize: 9, color: "#333", marginBottom: 8 },
  headline: { fontSize: 11, fontFamily: "Helvetica-Bold", marginBottom: 6 },
  section: { fontSize: 10.5, fontFamily: "Helvetica-Bold", textTransform: "uppercase", letterSpacing: 0.6, marginTop: 10, marginBottom: 4, borderBottomWidth: 0.8, borderBottomColor: "#111", paddingBottom: 2 },
  row: { flexDirection: "row", justifyContent: "space-between", marginTop: 5 },
  title: { fontFamily: "Helvetica-Bold" },
  sub: { color: "#333" },
  bullet: { flexDirection: "row", marginTop: 1.5, paddingLeft: 6 },
  dot: { width: 8 },
  text: { flex: 1 },
});

export function ResumePdf({ c }: { c: ResumeContent }) {
  const contact = [c.header.email, c.header.phone, c.header.location, ...c.header.links].filter(Boolean).join("  |  ");
  return (
    <Document title={`${c.header.fullName} résumé`} author={c.header.fullName}>
      <Page size="LETTER" style={s.page}>
        <Text style={s.name}>{c.header.fullName}</Text>
        {contact ? <Text style={s.contact}>{contact}</Text> : null}
        {c.headline ? <Text style={s.headline}>{c.headline}</Text> : null}
        {c.summary ? (<><Text style={s.section}>Summary</Text><Text>{c.summary}</Text></>) : null}
        {c.experience.length ? <Text style={s.section}>Experience</Text> : null}
        {c.experience.map((e) => (
          <View key={e.experienceId} wrap={false}>
            <View style={s.row}><Text style={s.title}>{e.title}, {e.company}</Text><Text style={s.sub}>{e.dateRange}</Text></View>
            {e.location ? <Text style={s.sub}>{e.location}</Text> : null}
            {e.bullets.map((b) => (<View key={b.bulletId} style={s.bullet}><Text style={s.dot}>•</Text><Text style={s.text}>{b.text}</Text></View>))}
          </View>
        ))}
        {c.projects.length ? <Text style={s.section}>Projects</Text> : null}
        {c.projects.map((p) => (
          <View key={p.projectId} wrap={false}>
            <View style={s.row}><Text style={s.title}>{p.name}</Text>{p.url ? <Text style={s.sub}>{p.url}</Text> : null}</View>
            {p.description ? <Text style={s.sub}>{p.description}</Text> : null}
            {p.bullets.map((b) => (<View key={b.bulletId} style={s.bullet}><Text style={s.dot}>•</Text><Text style={s.text}>{b.text}</Text></View>))}
          </View>
        ))}
        {c.education.length ? <Text style={s.section}>Education</Text> : null}
        {c.education.map((e, i) => (
          <View key={i} style={s.row}><Text><Text style={s.title}>{e.school}</Text>{e.degree || e.field ? ` — ${[e.degree, e.field].filter(Boolean).join(", ")}` : ""}{e.gpa ? ` (GPA ${e.gpa})` : ""}</Text><Text style={s.sub}>{e.dateRange}</Text></View>
        ))}
        {c.skills.length ? (<><Text style={s.section}>Skills</Text><Text>{c.skills.map((k) => k.name).join(", ")}</Text></>) : null}
      </Page>
    </Document>
  );
}

export async function renderResumePdf(c: ResumeContent): Promise<Buffer> {
  return Buffer.from(await renderToBuffer(<ResumePdf c={c} />));
}
