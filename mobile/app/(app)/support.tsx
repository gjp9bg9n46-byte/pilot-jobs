// Support — mirrors frontend/src/pages/Support.jsx: searchable FAQ (4 categories),
// Contact & Feedback (mailto links), About + What's new. All static/self-contained
// (no backend, no contact-form endpoint on web).
import { useMemo, useState } from 'react';
import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { TextField } from '../../src/components/ui';
import { fontFamilies, fontSizes, pilot, spacing } from '../../src/theme/tokens';
import { ThemePalette, useThemeColors, useThemedStyles } from '../../src/theme/ThemeContext';

type Faq = { cat: string; q: string; a: string };

const FAQS: Faq[] = [
  { cat: 'Jobs & Matching', q: 'How does job matching work?', a: "CockpitHire compares your pilot profile — licences, type ratings, medical, flight hours, and issuing authority — against each job's published requirements. Each job receives a match score from 0–100%. The breakdown shows what matched, what's marginal, and what's missing. Use the \"Qualified only\" toggle on the Jobs tab to filter out jobs you don't meet the hard requirements for." },
  { cat: 'Jobs & Matching', q: 'What does my match score mean?', a: "The match score (0–100%) reflects how well your qualifications align with a job's requirements. Certificates and issuing authority are hard requirements (failing either disqualifies the match). Hours, type ratings, and medical class contribute soft points. The breakdown — visible in the job detail — lists each criterion as matched, marginal, or missing." },
  { cat: 'Jobs & Matching', q: 'What are job alerts and how do I manage them?', a: "When a new job is posted that matches your profile, CockpitHire creates a job alert and (if enabled) sends a push notification. View all alerts on the Alerts tab. You can mark alerts as read, dismiss ones you're not interested in, or save jobs you want to revisit. Alert matching is intentionally lenient — it casts a wide net. Use the Qualified only filter on the Jobs tab for a stricter view." },
  { cat: 'Jobs & Matching', q: 'How often are jobs updated?', a: 'Our scraper runs across monitored airline career boards, ATC boards, and aviation platforms. New postings typically appear on your Jobs tab within a day of going live.' },
  { cat: 'Jobs & Matching', q: 'Why am I not seeing any matches?', a: "Matches are calculated from your profile. Make sure you've added your licences, type ratings, medical certificate, and flight hours in the Profile tab. The more complete your profile, the more accurate your matches. Also check that your licence issuing authority is correct (e.g. EASA or FAA, not ICAO) — the authority field is used to filter jobs by regulatory region." },
  { cat: 'Your Profile', q: 'What is Right to Work tracking?', a: "The Right to Work section on your Profile lets you record the countries you're authorised to work in and the supporting documents (passport, visa, residency permit, etc.). This data feeds into job matching — some postings require work authorisation for a specific country or region." },
  { cat: 'Your Profile', q: 'What is ICAO ELP and why does it matter?', a: 'ICAO English Language Proficiency (ELP) is a mandatory certification for pilots operating internationally. Level 4 is the minimum for most international ops; Level 6 has no expiry. Add your ELP level under Profile → Licences (ELP tab). Most airlines require you to declare your ELP level.' },
  { cat: 'CV & Logbook', q: 'What is the CV Builder?', a: 'The CV Builder (CV tab) generates a professional aviation CV as a downloadable PDF. Your profile data — name, licences, type ratings, medical, logbook hours, and right-to-work — flows in automatically. You can add a summary, skills, and languages, choose a colour theme, and select from two CV template styles. Your CV always reflects your current profile; no manual syncing needed.' },
  { cat: 'CV & Logbook', q: 'How do I import my existing logbook?', a: 'Go to the Logbook tab and click "Import". Export your flights as a CSV from your existing logbook app and upload it. Your flights and totals will be merged automatically.' },
  { cat: 'CV & Logbook', q: 'What does "carry-forward hours" mean?', a: "If you flew before using CockpitHire, those hours won't appear in our logbook. Use \"Previous / carry-forward hours\" in the Logbook tab to enter your prior totals — they're added to your live totals and used for job matching." },
  { cat: 'Account & Privacy', q: 'Is my profile visible to airlines?', a: 'By default your profile is visible to airlines and recruiters, who can see your qualifications — but never your personal contact details unless you apply. You can change this any time in Settings → Privacy.' },
  { cat: 'Account & Privacy', q: 'How do I delete my account?', a: 'Go to Settings → Danger Zone → Delete Account. This permanently removes all your data. This action cannot be undone.' },
];
const CAT_ORDER = ['Jobs & Matching', 'Your Profile', 'CV & Logbook', 'Account & Privacy'];

const CONTACTS = [
  { label: 'General Support', sub: 'Questions, bugs, account issues', href: 'mailto:support@cockpithire.com', btn: 'Email us' },
  { label: 'Report a Job Listing', sub: 'Outdated, inaccurate, or suspicious posting', href: 'mailto:listings@cockpithire.com', btn: 'Report' },
  { label: 'Partnership Enquiries', sub: 'Airlines, flight schools, and aviation businesses', href: 'mailto:partnerships@cockpithire.com', btn: 'Get in touch' },
];
const WHATS_NEW = [
  '468 airline factfiles with fleet, hubs, and contributor-edited data',
  'Pilot-editable fleet contributions',
  'Dedicated job detail pages with personalised match scoring',
  'CV Builder with two template styles',
];

function FaqItem({ item }: { item: Faq }) {
  const styles = useThemedStyles(createStyles);
  const [open, setOpen] = useState(false);
  return (
    <View style={styles.faq}>
      <Pressable style={styles.faqHead} onPress={() => setOpen((v) => !v)}>
        <Text style={styles.faqQ}>{item.q}</Text>
        <Text style={styles.faqSign}>{open ? '−' : '+'}</Text>
      </Pressable>
      {open ? <Text style={styles.faqA}>{item.a}</Text> : null}
    </View>
  );
}

export default function SupportScreen() {
  const styles = useThemedStyles(createStyles);
  const [query, setQuery] = useState('');
  const q = query.trim().toLowerCase();
  const filtered = useMemo(() => (q ? FAQS.filter((f) => (f.q + ' ' + f.a).toLowerCase().includes(q)) : FAQS), [q]);

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        <Text style={styles.h1}>Support</Text>
        <Text style={styles.subtitle}>Help, contact, and what we're building.</Text>

        {/* FAQ */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Frequently Asked Questions</Text>
          <Text style={styles.cardSub}>Answers to the most common questions about CockpitHire.</Text>
          <TextField label="" value={query} onChangeText={setQuery} placeholder="Search FAQs…" autoCapitalize="none" containerStyle={{ marginBottom: 4 }} />
          {filtered.length === 0 ? (
            <Text style={styles.noResults}>No FAQs match your search.</Text>
          ) : (
            CAT_ORDER.map((cat) => {
              const items = filtered.filter((f) => f.cat === cat);
              if (items.length === 0) return null;
              return (
                <View key={cat}>
                  <Text style={styles.catLabel}>{cat}</Text>
                  {items.map((item) => <FaqItem key={item.q} item={item} />)}
                </View>
              );
            })
          )}
        </View>

        {/* Contact & Feedback */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Contact &amp; Feedback</Text>
          <Text style={styles.cardSub}>We read every message — usually reply within 24 hours.</Text>
          {CONTACTS.map((item, i, arr) => (
            <View key={item.label} style={[styles.contactRow, i < arr.length - 1 && styles.contactBorder]}>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={styles.contactLabel}>{item.label}</Text>
                <Text style={styles.contactSub}>{item.sub}</Text>
              </View>
              <Pressable style={styles.contactBtn} onPress={() => Linking.openURL(item.href)}><Text style={styles.contactBtnText}>{item.btn}</Text></Pressable>
            </View>
          ))}
        </View>

        {/* About */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>About CockpitHire</Text>
          <Text style={styles.cardSub}>What CockpitHire is, and what's new.</Text>
          <Text style={styles.aboutBody}>A job-matching platform for professional pilots — aggregating cockpit vacancies worldwide and scoring them against your licences, ratings, medical, and hours.</Text>
          <Text style={styles.catLabel}>What's new</Text>
          {WHATS_NEW.map((w) => (
            <View key={w} style={styles.bullet}><Text style={styles.bulletDot}>•</Text><Text style={styles.bulletText}>{w}</Text></View>
          ))}
          <View style={styles.versionRow}>
            <Text style={styles.contactLabel}>CockpitHire Mobile <Text style={styles.betaBadge}> Beta </Text></Text>
            <Text style={styles.contactSub}>Version 1.0.0</Text>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const createStyles = (pilot: ThemePalette) => StyleSheet.create({
  safe: { flex: 1, backgroundColor: pilot.cream },
  content: { padding: spacing.xl, paddingBottom: 48 },
  h1: { fontFamily: fontFamilies.display, fontSize: fontSizes['3xl'], color: pilot.ink, marginBottom: 4 },
  subtitle: { fontFamily: fontFamilies.body, fontSize: fontSizes.base, color: pilot.muted, marginBottom: 20 },

  card: { backgroundColor: pilot.surface, borderWidth: 1, borderColor: pilot.line, borderRadius: 12, padding: 20, marginBottom: 16 },
  cardTitle: { fontFamily: fontFamilies.display, fontSize: fontSizes.lg, color: pilot.ink },
  cardSub: { fontSize: fontSizes.xs, color: pilot.muted, fontFamily: fontFamilies.body, marginTop: 3, marginBottom: 14, lineHeight: 18 },
  noResults: { fontSize: fontSizes.sm, color: pilot.muted, fontFamily: fontFamilies.body, paddingVertical: 16 },

  catLabel: { fontSize: 11, fontFamily: fontFamilies.bodyBold, color: pilot.muted, textTransform: 'uppercase', letterSpacing: 1, marginTop: 16, marginBottom: 2 },
  faq: { borderBottomWidth: 1, borderBottomColor: pilot.line },
  faqHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, paddingVertical: 14 },
  faqQ: { flex: 1, fontSize: fontSizes.sm, fontFamily: fontFamilies.bodySemiBold, color: pilot.ink, lineHeight: 20 },
  faqSign: { fontSize: 20, color: pilot.navy, fontFamily: fontFamilies.body, lineHeight: 20 },
  faqA: { fontSize: fontSizes.sm, color: pilot.muted, fontFamily: fontFamilies.body, lineHeight: 21, paddingBottom: 14 },

  contactRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14 },
  contactBorder: { borderBottomWidth: 1, borderBottomColor: pilot.line },
  contactLabel: { fontSize: fontSizes.base, fontFamily: fontFamilies.bodySemiBold, color: pilot.ink },
  contactSub: { fontSize: fontSizes.xs, color: pilot.muted, fontFamily: fontFamilies.body, marginTop: 2 },
  contactBtn: { borderWidth: 1, borderColor: pilot.line, borderRadius: 8, paddingVertical: 10, paddingHorizontal: 16, backgroundColor: pilot.surface },
  contactBtnText: { fontSize: fontSizes.sm, color: pilot.ink, fontFamily: fontFamilies.bodyMedium },

  aboutBody: { fontSize: fontSizes.sm, color: pilot.ink, fontFamily: fontFamilies.body, lineHeight: 22, marginBottom: 8 },
  bullet: { flexDirection: 'row', gap: 8, marginTop: 5 },
  bulletDot: { fontSize: fontSizes.sm, color: pilot.navy },
  bulletText: { flex: 1, fontSize: fontSizes.sm, color: pilot.ink, fontFamily: fontFamilies.body, lineHeight: 21 },
  versionRow: { marginTop: 16, paddingTop: 16, borderTopWidth: 1, borderTopColor: pilot.line },
  betaBadge: { fontSize: 11, color: '#1E40AF', backgroundColor: '#EFF6FF', fontFamily: fontFamilies.bodyBold, overflow: 'hidden' },
});
