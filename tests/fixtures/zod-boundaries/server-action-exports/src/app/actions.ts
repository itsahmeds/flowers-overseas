"use server";

// RED: server actions exported three other ways, each reading a field straight off its form.
function withAuth<T>(action: T): T {
  return action;
}

const act = async (fd: FormData) => {
  await Promise.resolve();
  return fd.get("a");
};
export { act };

export const wrapped = withAuth(async (fd: FormData) => {
  await Promise.resolve();
  return fd.get("b");
});

export default async (fd: FormData) => {
  await Promise.resolve();
  return String(fd.get("c"));
};
