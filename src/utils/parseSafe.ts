export function parseSafe(value: string) {
  try {
    return JSON.parse(value);
  } catch (error: unknown) {
    console.error(error);

    return undefined;
  }
}
