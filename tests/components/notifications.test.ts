/**
 * ============================================================================
 * AtlasOps Incident Management Console - Notification Components Test Suite
 * ============================================================================
 * File: frontend/tests/components/notifications.test.ts
 * Specification: specs/tasks/TASK-FE-008.md
 *
 * Acceptance Criteria Covered:
 * - TEST-OPT-010: Toast Auto-Dismiss Timer (auto-dismisses after 5000ms, paused on hover)
 * - TEST-OPT-011: Toast Retry Action Trigger (renders Retry button, clicking triggers onRetry)
 * - TEST-OPT-012: Toast Accessibility Attributes (role="alert" for error/warning, role="status" for success/info, aria-label dismiss)
 */

import React, { act } from "react";
import ReactDOM from "react-dom/client";
import { renderToString } from "react-dom/server";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ---------------------------------------------------------------------------
// Dynamic Import Loader with Graceful TDD Red Phase Fallback
// ---------------------------------------------------------------------------

let notificationsModule: any = null;
try {
  // @ts-ignore - Module implemented in Stage 3 (TASK-FE-008)
  notificationsModule = await import("@/components/notifications");
} catch {
  notificationsModule = null;
}

const Toast = notificationsModule?.Toast;
const ToastContainer = notificationsModule?.ToastContainer;
const ToastProvider = notificationsModule?.ToastProvider;
const useToast = notificationsModule?.useToast;

/**
 * Asserts component existence for clean TDD Red Phase reporting.
 */
function assertComponent(name: string, comp: any): comp is React.ComponentType<any> {
  expect(
    comp,
    `Component "${name}" is pending implementation in "@/components/notifications" (TDD Red Phase)`
  ).toBeDefined();
  return comp != null;
}

/**
 * Asserts hook existence for clean TDD Red Phase reporting.
 */
function assertHook(name: string, hook: any): hook is Function {
  expect(
    hook,
    `Hook "${name}" is pending implementation in "@/components/notifications" (TDD Red Phase)`
  ).toBeDefined();
  return typeof hook === "function";
}

// ---------------------------------------------------------------------------
// Lightweight DOM / Event Harness for Component Interactions
// ---------------------------------------------------------------------------

class MockNode {
  nodeType: number;
  tagName: string;
  nodeName: string;
  childNodes: MockNode[];
  parentNode: MockNode | null = null;
  style: Record<string, string> = {};
  attributes: Map<string, string> = new Map();
  listeners: Map<string, Set<(e: any) => void>> = new Map();
  _value: string = "";
  disabled: boolean = false;
  type: string = "button";

  get ownerDocument(): any {
    return doc;
  }

  get value(): string {
    return this._value;
  }

  set value(val: string) {
    this._value = String(val);
  }

  get textContent(): string {
    if (this.nodeType === 3) return this._value;
    return this.childNodes.map((c) => c.textContent).join("");
  }

  set textContent(val: string) {
    this._value = String(val);
    this.childNodes = [];
    if (this.nodeType !== 3 && val) {
      const textNode = new MockNode(3, "#text");
      textNode._value = String(val);
      textNode.parentNode = this;
      this.childNodes.push(textNode);
    }
  }

  constructor(nodeType: number, tagName: string) {
    this.nodeType = nodeType;
    this.tagName = tagName;
    this.nodeName = tagName;
    this.childNodes = [];
  }

  setAttribute(name: string, value: string) {
    this.attributes.set(name, String(value));
    if (name === "value") this._value = String(value);
    if (name === "disabled") {
      this.disabled = value === "true" || value === "" || value === "disabled";
    }
    if (name === "type") this.type = String(value);
  }

  getAttribute(name: string): string | null {
    return this.attributes.get(name) ?? null;
  }

  hasAttribute(name: string): boolean {
    return this.attributes.has(name);
  }

  removeAttribute(name: string) {
    this.attributes.delete(name);
    if (name === "disabled") this.disabled = false;
  }

  appendChild(child: MockNode) {
    child.parentNode = this;
    this.childNodes.push(child);
  }

  removeChild(child: MockNode) {
    const idx = this.childNodes.indexOf(child);
    if (idx !== -1) {
      child.parentNode = null;
      this.childNodes.splice(idx, 1);
    }
  }

  addEventListener(type: string, fn: (e: any) => void) {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type)!.add(fn);
  }

  removeEventListener(type: string, fn: (e: any) => void) {
    this.listeners.get(type)?.delete(fn);
  }

  dispatchEvent(event: any) {
    event.target = this;
    if (!event.preventDefault) event.preventDefault = () => {};
    if (!event.stopPropagation) event.stopPropagation = () => {};

    // Direct React props handler invocation for mouseenter/mouseleave/keydown
    const reactPropsKey = Object.keys(this).find((k) => k.startsWith("__reactProps$"));
    if (reactPropsKey) {
      const reactProps = (this as any)[reactPropsKey];
      if (reactProps) {
        if (event.type === "mouseenter") {
          reactProps.onMouseEnter?.(event);
        } else if (event.type === "mouseleave") {
          reactProps.onMouseLeave?.(event);
        } else if (event.type === "keydown") {
          reactProps.onKeyDown?.(event);
        }
      }
    }

    let curr: MockNode | null = this;
    while (curr) {
      curr.listeners.get(event.type)?.forEach((fn) => fn(event));
      if (event.cancelBubble) break;
      curr = event.bubbles ? curr.parentNode : null;
    }
    return true;
  }

  querySelector(selector: string): MockNode | null {
    for (const child of this.childNodes) {
      if (nodeMatches(child, selector)) return child;
      const found = child.querySelector(selector);
      if (found) return found;
    }
    return null;
  }

  querySelectorAll(selector: string): MockNode[] {
    const results: MockNode[] = [];
    const walk = (node: MockNode) => {
      for (const child of node.childNodes) {
        if (nodeMatches(child, selector)) {
          results.push(child);
        }
        walk(child);
      }
    };
    walk(this);
    return results;
  }
}

function singleSelectorMatches(node: MockNode, selector: string): boolean {
  selector = selector.trim();
  if (!selector) return false;

  if (selector.includes("[") && selector.endsWith("]")) {
    const tagPart = selector.slice(0, selector.indexOf("[")).trim();
    const attrPart = selector.slice(selector.indexOf("[") + 1, -1).trim();
    if (tagPart && node.tagName.toLowerCase() !== tagPart.toLowerCase()) {
      return false;
    }
    if (attrPart.includes("=")) {
      const [k, rawV] = attrPart.split("=");
      const cleanV = rawV.replace(/['"]/g, "").trim();
      const attrKey = k.trim();
      const actualVal =
        node.getAttribute(attrKey) ??
        (attrKey in node ? String((node as any)[attrKey]) : null);
      return actualVal === cleanV;
    }
    return node.attributes.has(attrPart);
  }

  if (selector.startsWith("#")) {
    return node.getAttribute("id") === selector.slice(1);
  }

  if (selector.startsWith(".")) {
    return (
      node
        .getAttribute("class")
        ?.split(/\s+/)
        .includes(selector.slice(1)) ?? false
    );
  }

  return node.tagName.toLowerCase() === selector.toLowerCase();
}

function nodeMatches(node: MockNode, selector: string): boolean {
  if (selector.includes(",")) {
    return selector
      .split(",")
      .some((part) => singleSelectorMatches(node, part.trim()));
  }
  return singleSelectorMatches(node, selector);
}

const doc: any = {
  nodeType: 9,
  body: new MockNode(1, "BODY"),
  createElement: (tag: string) => new MockNode(1, tag.toUpperCase()),
  createElementNS: (_ns: string, tag: string) => new MockNode(1, tag.toUpperCase()),
  createTextNode: () => new MockNode(3, "#text"),
  addEventListener: () => {},
  removeEventListener: () => {},
  activeElement: null,
};

const win: any = {
  document: doc,
  addEventListener: () => {},
  removeEventListener: () => {},
  navigator: { onLine: true },
  HTMLIFrameElement: class {},
};

doc.defaultView = win;

function renderInteractive(element: React.ReactElement) {
  const container = new MockNode(1, "DIV");
  doc.body.appendChild(container);
  const root = ReactDOM.createRoot(container as any);
  act(() => {
    root.render(element);
  });
  return {
    container,
    unmount: () =>
      act(() => {
        root.unmount();
        doc.body.removeChild(container);
      }),
    rerender: (el: React.ReactElement) => act(() => root.render(el)),
  };
}

// ---------------------------------------------------------------------------
// Test Suites: Toast Notification System (TASK-FE-008)
// ---------------------------------------------------------------------------

describe("Toast Notification System (TASK-FE-008)", () => {
  beforeEach(() => {
    vi.stubGlobal("window", win);
    vi.stubGlobal("document", doc);
    vi.stubGlobal("navigator", { onLine: true });
    (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
    doc.activeElement = doc.body;
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.clearAllMocks();
  });

  // -------------------------------------------------------------------------
  // TEST-OPT-010: Toast Auto-Dismiss Timer
  // -------------------------------------------------------------------------
  describe("TEST-OPT-010: Toast Auto-Dismiss Timer", () => {
    it("TEST-OPT-010: automatically dismisses after duration (default 5000ms) and pauses timer on hover", () => {
      if (!assertComponent("Toast", Toast)) return;

      vi.useFakeTimers();
      const handleDismiss = vi.fn();

      const toastMessage = {
        id: "toast-1",
        type: "success" as const,
        message: "Status update completed successfully",
        duration: 5000,
      };

      const { container } = renderInteractive(
        React.createElement(Toast, { toast: toastMessage, onDismiss: handleDismiss })
      );

      // 1. At 4,900ms, timer has NOT fired yet
      act(() => {
        vi.advanceTimersByTime(4900);
      });
      expect(handleDismiss).not.toHaveBeenCalled();

      // 2. Advancing past 5,000ms triggers dismiss
      act(() => {
        vi.advanceTimersByTime(200);
      });
      expect(handleDismiss).toHaveBeenCalledTimes(1);

      vi.useRealTimers();
    });

    it("TEST-OPT-010: pausing auto-dismiss on mouseenter and resuming on mouseleave", () => {
      if (!assertComponent("Toast", Toast)) return;

      vi.useFakeTimers();
      const handleDismiss = vi.fn();

      const toastMessage = {
        id: "toast-hover-test",
        type: "info" as const,
        message: "Investigating network issue",
        duration: 5000,
      };

      const { container } = renderInteractive(
        React.createElement(Toast, { toast: toastMessage, onDismiss: handleDismiss })
      );

      // Advance 2,000ms
      act(() => {
        vi.advanceTimersByTime(2000);
      });
      expect(handleDismiss).not.toHaveBeenCalled();

      // Mouse enters toast card (pause)
      const toastEl = container.childNodes[0] || container;
      act(() => {
        toastEl.dispatchEvent({ type: "mouseenter", bubbles: true });
      });

      // Advance another 6,000ms while hovered (total 8,000ms elapsed)
      act(() => {
        vi.advanceTimersByTime(6000);
      });
      // Should NOT dismiss while hovered!
      expect(handleDismiss).not.toHaveBeenCalled();

      // Mouse leaves toast card (resume timer)
      act(() => {
        toastEl.dispatchEvent({ type: "mouseleave", bubbles: true });
      });

      // Advance duration to let resumed timer fire
      act(() => {
        vi.advanceTimersByTime(5100);
      });
      expect(handleDismiss).toHaveBeenCalledTimes(1);

      vi.useRealTimers();
    });
  });

  // -------------------------------------------------------------------------
  // TEST-OPT-011: Toast Retry Action Trigger
  // -------------------------------------------------------------------------
  describe("TEST-OPT-011: Toast Retry Action Trigger", () => {
    it("TEST-OPT-011: renders Retry button on error toast and clicking it executes the onRetry callback", () => {
      if (!assertComponent("Toast", Toast)) return;

      const handleRetry = vi.fn();

      const toastMessage = {
        id: "toast-retry-1",
        type: "error" as const,
        message: "Failed to update incident status. Click to retry.",
        onRetry: handleRetry,
      };

      const { container } = renderInteractive(
        React.createElement(Toast, { toast: toastMessage, onDismiss: vi.fn() })
      );

      // Locate Retry button
      const buttons = container.querySelectorAll("button");
      const retryBtn = buttons.find(
        (b) =>
          b.textContent.toLowerCase().includes("retry") ||
          b.getAttribute("aria-label")?.toLowerCase().includes("retry")
      );

      expect(retryBtn).not.toBeNull();
      expect(retryBtn?.textContent).toMatch(/retry/i);

      // Clicking Retry executes onRetry callback
      act(() => {
        retryBtn?.dispatchEvent({ type: "click", bubbles: true });
      });
      expect(handleRetry).toHaveBeenCalledTimes(1);
    });

    it("TEST-OPT-011: omits Retry button when onRetry callback is not provided", () => {
      if (!assertComponent("Toast", Toast)) return;

      const toastProps = {
        id: "toast-no-retry",
        type: "success" as const,
        message: "Incident created successfully.",
        onDismiss: vi.fn(),
        toast: {
          id: "toast-no-retry",
          type: "success" as const,
          message: "Incident created successfully.",
          onDismiss: vi.fn(),
        },
      };

      const { container } = renderInteractive(React.createElement(Toast, toastProps));

      const buttons = container.querySelectorAll("button");
      const retryBtn = buttons.find((b) =>
        b.textContent.toLowerCase().includes("retry")
      );
      expect(retryBtn).toBeUndefined();
    });
  });

  // -------------------------------------------------------------------------
  // TEST-OPT-012: Toast Accessibility Attributes
  // -------------------------------------------------------------------------
  describe("TEST-OPT-012: Toast Accessibility Attributes", () => {
    it("TEST-OPT-012: renders role='alert' and aria-live='assertive' for error and warning toasts", () => {
      if (!assertComponent("Toast", Toast)) return;

      // 1. Error toast
      const errorHtml = renderToString(
        React.createElement(Toast, {
          id: "err-1",
          type: "error",
          message: "Critical error encountered",
          toast: {
            id: "err-1",
            type: "error",
            message: "Critical error encountered",
          },
        })
      );
      expect(errorHtml).toMatch(/role="alert"/i);
      expect(errorHtml).toMatch(/aria-live="assertive"/i);

      // 2. Warning / Concurrency conflict toast
      const warningHtml = renderToString(
        React.createElement(Toast, {
          id: "warn-1",
          type: "warning",
          message: "Update conflict: Incident was modified by another operator (v3).",
          toast: {
            id: "warn-1",
            type: "warning",
            message: "Update conflict: Incident was modified by another operator (v3).",
          },
        })
      );
      expect(warningHtml).toMatch(/role="alert"/i);
      expect(warningHtml).toMatch(/aria-live="assertive"/i);
    });

    it("TEST-OPT-012: renders role='status' and aria-live='polite' for success and info toasts", () => {
      if (!assertComponent("Toast", Toast)) return;

      // 1. Success toast
      const successHtml = renderToString(
        React.createElement(Toast, {
          id: "succ-1",
          type: "success",
          message: "Status updated to resolved.",
          toast: {
            id: "succ-1",
            type: "success",
            message: "Status updated to resolved.",
          },
        })
      );
      expect(successHtml).toMatch(/role="status"/i);
      expect(successHtml).toMatch(/aria-live="polite"/i);

      // 2. Info toast
      const infoHtml = renderToString(
        React.createElement(Toast, {
          id: "info-1",
          type: "info",
          message: "Exporting audit log...",
          toast: {
            id: "info-1",
            type: "info",
            message: "Exporting audit log...",
          },
        })
      );
      expect(infoHtml).toMatch(/role="status"/i);
      expect(infoHtml).toMatch(/aria-live="polite"/i);
    });

    it("TEST-OPT-012: manual dismiss button includes accessible aria-label and triggers dismissal on click", () => {
      if (!assertComponent("Toast", Toast)) return;

      const handleDismiss = vi.fn();

      const { container } = renderInteractive(
        React.createElement(Toast, {
          id: "dismiss-test",
          type: "info",
          message: "Notification with manual dismiss action",
          onDismiss: handleDismiss,
          toast: {
            id: "dismiss-test",
            type: "info",
            message: "Notification with manual dismiss action",
            onDismiss: handleDismiss,
          },
        })
      );

      const buttons = container.querySelectorAll("button");
      const dismissBtn = buttons.find(
        (b) =>
          b.getAttribute("aria-label")?.toLowerCase().includes("dismiss") ||
          b.getAttribute("aria-label")?.toLowerCase().includes("close") ||
          b.textContent.includes("×") ||
          b.getAttribute("title")?.toLowerCase().includes("dismiss") ||
          b.getAttribute("title")?.toLowerCase().includes("close")
      );

      expect(dismissBtn).not.toBeNull();
      expect(dismissBtn?.getAttribute("aria-label") || dismissBtn?.getAttribute("title")).toMatch(
        /dismiss|close/i
      );

      act(() => {
        dismissBtn?.dispatchEvent({ type: "click", bubbles: true });
      });
      expect(handleDismiss).toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // Additional Integration: ToastContainer & ToastProvider
  // -------------------------------------------------------------------------
  describe("ToastContainer & ToastProvider Integration", () => {
    it("renders multiple active toasts inside ToastContainer in stacked order", () => {
      if (!assertComponent("ToastContainer", ToastContainer)) return;

      const toasts = [
        { id: "t-1", type: "success" as const, message: "First notification" },
        { id: "t-2", type: "error" as const, message: "Second notification" },
      ];

      const html = renderToString(
        React.createElement(ToastContainer, {
          toasts,
          onDismiss: vi.fn(),
        })
      );

      expect(html).toContain("First notification");
      expect(html).toContain("Second notification");
    });

    it("ToastProvider exposes showToast and dismissToast via useToast hook", () => {
      if (!assertComponent("ToastProvider", ToastProvider)) return;
      if (!assertHook("useToast", useToast)) return;

      let toastContextValue: any = null;

      function Consumer() {
        toastContextValue = useToast();
        return React.createElement(
          "div",
          null,
          `Active count: ${toastContextValue.toasts.length}`
        );
      }

      const { container } = renderInteractive(
        React.createElement(ToastProvider, null, React.createElement(Consumer))
      );

      expect(toastContextValue).not.toBeNull();
      expect(typeof toastContextValue.showToast).toBe("function");
      expect(typeof toastContextValue.dismissToast).toBe("function");
      expect(Array.isArray(toastContextValue.toasts)).toBe(true);

      // Add a toast
      let toastId: string = "";
      act(() => {
        toastId = toastContextValue.showToast({
          type: "success",
          message: "Context toast added",
        });
      });

      expect(toastId).toBeTruthy();
      expect(container.textContent).toContain("Active count: 1");

      // Dismiss the toast
      act(() => {
        toastContextValue.dismissToast(toastId);
      });
      expect(container.textContent).toContain("Active count: 0");
    });
  });
});
