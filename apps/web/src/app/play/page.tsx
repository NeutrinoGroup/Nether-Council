import { VoiceTrial } from "@/features/voice/VoiceTrial";
export default async function PlayPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const invite = typeof params.invite === "string" && params.invite.length <= 4096 ? params.invite : "";
  const referral = typeof params.ref === "string" && params.ref.length <= 4096 ? params.ref : undefined;
  const locale = params.lang === "en" ? "en" : "zh";
  return <VoiceTrial key={`${locale}-${invite}`} initialLocale={locale} invite={invite} referral={referral} />;
}
