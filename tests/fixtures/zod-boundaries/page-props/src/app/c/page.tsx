// RED: `searchParams` destructured from the awaited props binding, then read raw.
interface PageProps {
  readonly searchParams: Promise<Record<string, string | undefined>>;
}

export default async function Page(props: PageProps) {
  const { searchParams } = await props;
  const sp = await searchParams;
  return <p>{sp.page}</p>;
}
