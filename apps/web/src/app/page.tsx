import { HalloweenTheatre } from "@/features/landing/HalloweenTheatre";
export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const input = await searchParams; const query = new URLSearchParams();
  for (const key of ["invite", "ref", "lang", "character"]) { const value = input[key]; if (typeof value === "string" && value.length <= 4096) query.set(key, value); }
  return <HalloweenTheatre initialLocale={input.lang === "en" ? "en" : "zh"} query={query.toString()} />;
}
