import { useEffect } from "react";

// Names the browser tab while the page is open, then puts the old title
// back. Nothing happens until `title` is known.
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
