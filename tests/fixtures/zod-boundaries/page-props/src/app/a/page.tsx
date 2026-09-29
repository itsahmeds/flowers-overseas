// RED: `searchParams` destructured from the props binding, in the page and in generateMetadata.
interface PageProps {
  readonly searchParams: Promise<Record<string, string | undefined>>;
}

export default async function Page(props: PageProps) {
  const { searchParams } = props;
  const sp = await searchParams;
  return <p>{sp.page}</p>;
}

export async function generateMetadata(props: PageProps) {
  const { searchParams: query } = props;
  return { title: (await query).q };
}
