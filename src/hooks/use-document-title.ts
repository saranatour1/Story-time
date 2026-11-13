import { useEffect } from "react";

export const useDocumentTitle = (title: string | undefined) => {
  useEffect(() => {
    if (title === undefined) return;
    const previous = document.title;
    document.title = title;
    return () => {
      document.title = previous;
    };
  }, [title]);
};
