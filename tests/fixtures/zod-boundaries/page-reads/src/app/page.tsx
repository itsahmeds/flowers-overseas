// RED: a page reads `searchParams.page` with no schema between.
interface PageProps {
  readonly searchParams: Promise<Record<string, string | undefined>>;
}

export default async function Page({ searchParams }: PageProps) {
  const page = (await searchParams).page;
  return <p>{page}</p>;
}
