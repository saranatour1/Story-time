import { ConvexError } from "convex/values";

// Server validation errors carry { code, field?, message }.
export function errorMessage(error: unknown): string {
  if (error instanceof ConvexError) {
    const data: unknown = error.data;
    if (typeof data === "string") return data;
    if (typeof data === "object" && data !== null && "message" in data) {
      return String((data as { message: unknown }).message);
    }
  }
  return "Something went wrong. Please try again.";
}
