import type { CharacterId } from "@nether/contracts";
import { CharacterId as CharacterIdSchema } from "@nether/contracts";
import { VoiceTrial } from "@/features/voice/VoiceTrial";

export default async function PlayPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const invite = typeof params.invite === "string" && params.invite.length <= 4096 ? params.invite : "";
  const referral = typeof params.ref === "string" && params.ref.length <= 4096 ? params.ref : undefined;
  const locale = params.lang === "en" ? "en" : "zh";
  const parsedChar = typeof params.character === "string" ? CharacterIdSchema.safeParse(params.character) : null;
  const character: CharacterId = parsedChar && parsedChar.success ? parsedChar.data : "meng-po";
  return (
    <VoiceTrial
      key={`${locale}-${character}-${invite}`}
      initialLocale={locale}
      initialCharacter={character}
      invite={invite}
      referral={referral}
    />
  );
}
