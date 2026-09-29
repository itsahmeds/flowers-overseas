// RED: `props.searchParams` read in a page, and a destructured parameter in generateViewport.
interface PageProps {
  readonly searchParams: Promise<Record<string, string | undefined>>;
}

export default async function Page(props: PageProps) {
  const sp = await props.searchParams;
  return <p>{sp.page}</p>;
}

export const generateViewport = async ({ searchParams }: PageProps) => ({
  themeColor: String(await searchParams),
});
