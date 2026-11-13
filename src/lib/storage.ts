type Area = "local" | "session";

const area = (name: Area): Storage => (name === "local" ? localStorage : sessionStorage);

export const readStored = (name: Area, key: string): string | null => {
  try {
    return area(name).getItem(key);
  } catch {
    return null;
  }
};

export const writeStored = (name: Area, key: string, value: string): boolean => {
  try {
    area(name).setItem(key, value);
    return true;
  } catch {
    return false;
  }
};

export const forgetStored = (name: Area, key: string): boolean => {
  try {
    area(name).removeItem(key);
    return true;
  } catch {
    return false;
  }
};
