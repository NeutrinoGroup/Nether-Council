import { redirect } from "next/navigation";
export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const input = await searchParams; const query = new URLSearchParams();
  for (const key of ["invite", "ref", "lang"]) { const value = input[key]; if (typeof value === "string" && value.length <= 4096) query.set(key, value); }
  redirect(`/play${query.size ? `?${query}` : ""}`);
}
