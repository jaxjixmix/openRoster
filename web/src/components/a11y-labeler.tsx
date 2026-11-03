"use client";

import { useEffect } from "react";

/**
 * Many forms are built as <div><Label/><Input/></div> without explicit ids.
 * This progressive enhancement associates each label with its first control
 * after hydration (and when modals open), so screen readers get a name for
 * every field without touching 100+ call sites.
 */
export function A11yLabeler() {
  useEffect(() => {
    let counter = 0;

    const apply = () => {
      const labels = document.querySelectorAll<HTMLLabelElement>("label:not([for])");
      labels.forEach((label) => {
        if (label.querySelector("input, select, textarea")) return;
        const parent = label.parentElement;
        if (!parent) return;
        const control = parent.querySelector<HTMLElement>("input:not([type=hidden]), select, textarea");
        if (!control) return;
        if (!control.id) control.id = `or-field-${++counter}`;
        label.htmlFor = control.id;
      });
    };

    apply();
    const observer = new MutationObserver(() => apply());
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);

  return null;
}
