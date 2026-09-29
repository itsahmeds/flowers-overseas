// RED: a function whose body starts with "use server", in a file that does not, reads its form raw.
export function makeSave(): (
  fd: FormData,
) => Promise<FormDataEntryValue | null> {
  async function save(fd: FormData): Promise<FormDataEntryValue | null> {
    "use server";
    await Promise.resolve();
    return fd.get("x");
  }
  return save;
}
