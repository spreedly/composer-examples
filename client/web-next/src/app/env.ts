export const envOr = (primary: string, fallback: string): string | undefined => {
  const primaryValue = process.env[primary];
  if (primaryValue) {
    return primaryValue;
  }
  return process.env[fallback];
};
