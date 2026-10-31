import type { CharacterId } from "@nether/contracts";
import { CharacterId as CharacterIdSchema } from "@nether/contracts";
import { HostStage } from "@/features/party/HostStage";

export default async function HostPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const invite = typeof params.invite === "string" && params.invite.length <= 4096 ? params.invite : "";
  const hostKey = typeof params.key === "string" && params.key.length <= 256 ? params.key : "";
  const locale = params.lang === "en" ? "en" : "zh";
  const parsedChar = typeof params.character === "string" ? CharacterIdSchema.safeParse(params.character) : null;
  const character: CharacterId = parsedChar && parsedChar.success ? parsedChar.data : "meng-po";

  return (
    <HostStage
      key={`${locale}-${character}-${invite}`}
      initialLocale={locale}
      initialCharacter={character}
      invite={invite}
      hostKey={hostKey}
    />
  );
}
