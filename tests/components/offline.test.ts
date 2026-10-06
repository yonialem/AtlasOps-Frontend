/**
 * ============================================================================
 * AtlasOps Incident Management Console - Offline Components & Connectivity Test Suite
 * ============================================================================
 * File: frontend/tests/components/offline.test.ts
 * Specification: specs/tasks/TASK-FE-009.md
 * Contracts: contracts/api.types.ts, contracts/incident.types.ts
 *
 * Acceptance Criteria Covered:
 * - TEST-OFFLINE-001: Connectivity Hook Online Detection (useConnectivity returns isOnline: true when navigator.onLine === true)
 * - TEST-OFFLINE-002: Connectivity Hook Offline Event (window offline/online event dispatch toggles isOnline)
 * - TEST-OFFLINE-003: Offline Banner Rendered when Offline (OfflineBanner renders with role="alert" and assertive live region)
 * - TEST-OFFLINE-004: Offline Banner Queued Items Badge (displays pending actions count badge when queuedCount > 0)
 * - TEST-OFFLINE-011: Outage Screen Diagnostic Details (renders error message, browser online state, and endpoint URL)
 * - TEST-OFFLINE-012: Outage Screen Retry Action (clicking Retry Connection triggers onRetry callback)
 */

import React, { act } from "react";
import ReactDOM from "react-dom/client";
import { renderToString } from "react-dom/server";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ---------------------------------------------------------------------------
// Dynamic Import Loader with Graceful TDD Red Phase Fallback
// ---------------------------------------------------------------------------

let connectivityModule: any = null;
try {
  // @ts-ignore - Module implemented in Stage 3 (TASK-FE-009)
  connectivityModule = await import("@/hooks/useConnectivity");
} catch {
  try {
    // @ts-ignore - Fallback barrel export check
    connectivityModule = await import("@/hooks");
  } catch {
    connectivityModule = null;
  }
}

let bannerModule: any = null;
try {
  // @ts-ignore - Module implemented in Stage 3 (TASK-FE-009)
  bannerModule = await import("@/components/common/OfflineBanner");
} catch {
  try {
    // @ts-ignore - Fallback barrel export check
    bannerModule = await import("@/components/common");
  } catch {
    bannerModule = null;
  }
}

let outageModule: any = null;
try {
  // @ts-ignore - Module implemented in Stage 3 (TASK-FE-009)
  outageModule = await import("@/components/common/OutageScreen");
} catch {
  try {
    // @ts-ignore - Fallback barrel export check
    outageModule = await import("@/components/common");
  } catch {
    outageModule = null;
  }
}

const useConnectivity = connectivityModule?.useConnectivity;
const OfflineBanner = bannerModule?.OfflineBanner;
const OutageScreen = outageModule?.OutageScreen;

/**
 * Asserts hook existence for clean TDD Red Phase reporting.
 */
function assertHook(name: string, hook: any): hook is Function {
  expect(
    hook,
    `Hook "${name}" is pending implementation in "@/hooks/useConnectivity" (TDD Red Phase)`
  ).toBeDefined();
  return typeof hook === "function";
}

/**
 * Asserts component existence for clean TDD Red Phase reporting.
 */
function assertComponent(name: string, comp: any): comp is React.ComponentType<any> {
  expect(
    comp,
    `Component "${name}" is pending implementation in "@/components/common" (TDD Red Phase)`
  ).toBeDefined();
  return comp != null;
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



    let curr: MockNode | null = this;
    while (curr) {
      curr.listeners.get(event.type)?.forEach((fn) => fn(event));
      if (event.cancelBubble) break;
      curr = event.bubbles ? curr.parentNode : null;
    }
    return true;
  }

  click() {
    this.dispatchEvent({ type: "click", bubbles: true, cancelable: true });
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

const windowListeners = new Map<string, Set<(e: any) => void>>();

const mockNavigator = {
  onLine: true,
};

const win: any = {
  document: doc,
  addEventListener: (event: string, fn: (e: any) => void) => {
    if (!windowListeners.has(event)) windowListeners.set(event, new Set());
    windowListeners.get(event)!.add(fn);
  },
  removeEventListener: (event: string, fn: (e: any) => void) => {
    windowListeners.get(event)?.delete(fn);
  },
  dispatchEvent: (event: any) => {
    const listeners = windowListeners.get(event.type);
    if (listeners) {
      listeners.forEach((fn) => fn(event));
    }
    return true;
  },
  navigator: mockNavigator,
  HTMLIFrameElement: class {},
};

doc.defaultView = win;

// Assign to globalThis
Object.defineProperty(globalThis, "window", {
  value: win,
  writable: true,
  configurable: true,
});
Object.defineProperty(globalThis, "document", {
  value: doc,
  writable: true,
  configurable: true,
});
Object.defineProperty(globalThis, "navigator", {
  value: mockNavigator,
  writable: true,
  configurable: true,
});

function renderInteractive(element: React.ReactElement) {
  const container = new MockNode(1, "DIV");
  doc.body.appendChild(container);
  const root = ReactDOM.createRoot(container as any);
  act(() => {
    root.render(element);
  });
  return {
    container,
    root,
    unmount: () =>
      act(() => {
        root.unmount();
        doc.body.removeChild(container);
      }),
    rerender: (el: React.ReactElement) =>
      act(() => {
        root.render(el);
      }),
  };
}

function renderHook<T>(useHook: () => T) {
  const container = new MockNode(1, "DIV");
  doc.body.appendChild(container);
  const root = ReactDOM.createRoot(container as any);
  const result = { current: undefined as unknown as T };

  function TestComponent() {
    result.current = useHook();
    return null;
  }

  act(() => {
    root.render(React.createElement(TestComponent));
  });

  return {
    result,
    unmount: () =>
      act(() => {
        root.unmount();
        doc.body.removeChild(container);
      }),
    rerender: () =>
      act(() => {
        root.render(React.createElement(TestComponent));
      }),
  };
}

// ---------------------------------------------------------------------------
// Test Suite: Offline Components & Connectivity
// ---------------------------------------------------------------------------

describe("Offline Resilience Components & Connectivity Hook (TASK-FE-009)", () => {
  beforeEach(() => {
    (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
    doc.body = new MockNode(1, "BODY");
    doc.activeElement = doc.body;
    windowListeners.clear();
    mockNavigator.onLine = true;
    vi.clearAllMocks();
  });

  afterEach(() => {
    windowListeners.clear();
  });

  // =========================================================================
  // 1. Network Connectivity Hook (useConnectivity)
  // =========================================================================
  describe("Network Connectivity Hook (useConnectivity)", () => {
    // -----------------------------------------------------------------------
    // TEST-OFFLINE-001: Online Detection
    // -----------------------------------------------------------------------
    it("TEST-OFFLINE-001: returns { isOnline: true } when navigator.onLine is true", () => {
      if (!assertHook("useConnectivity", useConnectivity)) return;

      mockNavigator.onLine = true;
      const { result, unmount } = renderHook(() => useConnectivity());

      expect(result.current).toBeDefined();
      expect(result.current.isOnline).toBe(true);
      unmount();
    });

    it("TEST-OFFLINE-001: returns { isOnline: false } when navigator.onLine is initially false", () => {
      if (!assertHook("useConnectivity", useConnectivity)) return;

      mockNavigator.onLine = false;
      const { result, unmount } = renderHook(() => useConnectivity());

      expect(result.current).toBeDefined();
      expect(result.current.isOnline).toBe(false);
      unmount();
    });

    // -----------------------------------------------------------------------
    // TEST-OFFLINE-002: Offline Event Handling & Restoration
    // -----------------------------------------------------------------------
    it("TEST-OFFLINE-002: transitions isOnline to false on window 'offline' event and restores true on 'online' event", () => {
      if (!assertHook("useConnectivity", useConnectivity)) return;

      mockNavigator.onLine = true;
      const { result, unmount } = renderHook(() => useConnectivity());
      expect(result.current.isOnline).toBe(true);

      // 1. Simulate network disconnect
      act(() => {
        mockNavigator.onLine = false;
        win.dispatchEvent({ type: "offline" });
      });
      expect(result.current.isOnline).toBe(false);

      // 2. Simulate network reconnect
      act(() => {
        mockNavigator.onLine = true;
        win.dispatchEvent({ type: "online" });
      });
      expect(result.current.isOnline).toBe(true);

      unmount();
    });

    it("TEST-OFFLINE-002: cleans up 'online' and 'offline' window listeners on unmount", () => {
      if (!assertHook("useConnectivity", useConnectivity)) return;

      const addSpy = vi.spyOn(win, "addEventListener");
      const removeSpy = vi.spyOn(win, "removeEventListener");

      const { unmount } = renderHook(() => useConnectivity());

      expect(addSpy).toHaveBeenCalledWith("online", expect.any(Function));
      expect(addSpy).toHaveBeenCalledWith("offline", expect.any(Function));

      unmount();

      expect(removeSpy).toHaveBeenCalledWith("online", expect.any(Function));
      expect(removeSpy).toHaveBeenCalledWith("offline", expect.any(Function));
    });
  });

  // =========================================================================
  // 2. Persistent Offline Banner (OfflineBanner)
  // =========================================================================
  describe("Persistent Offline Banner (OfflineBanner)", () => {
    // -----------------------------------------------------------------------
    // TEST-OFFLINE-003: Accessibility & Visual Elements
    // -----------------------------------------------------------------------
    it("TEST-OFFLINE-003: renders with role='alert' and aria-live='assertive' with informative offline copy", () => {
      if (!assertComponent("OfflineBanner", OfflineBanner)) return;

      const html = renderToString(React.createElement(OfflineBanner));

      // Must have accessible role and live region for screen readers
      expect(html).toContain('role="alert"');
      expect(html).toContain('aria-live="assertive"');

      // Informative copy explaining cached mode and mutation queuing
      expect(html).toMatch(/offline/i);
      expect(html).toMatch(/cached/i);
      expect(html).toMatch(/queued|sync/i);
    });

    it("TEST-OFFLINE-003: accepts and applies custom className to root banner container", () => {
      if (!assertComponent("OfflineBanner", OfflineBanner)) return;

      const html = renderToString(
        React.createElement(OfflineBanner, { className: "custom-offline-banner-class" })
      );

      expect(html).toContain("custom-offline-banner-class");
    });

    // -----------------------------------------------------------------------
    // TEST-OFFLINE-004: Queued Items Badge
    // -----------------------------------------------------------------------
    it("TEST-OFFLINE-004: displays pending actions badge when queuedCount is greater than 0", () => {
      if (!assertComponent("OfflineBanner", OfflineBanner)) return;

      const html = renderToString(
        React.createElement(OfflineBanner, { queuedCount: 3 })
      );

      // Displays badge indicating 3 pending actions queued for sync
      expect(html).toMatch(/3\s+(?:pending\s+(?:changes|actions)|queued)/i);
    });

    it("TEST-OFFLINE-004: displays singular pending action badge when queuedCount is 1", () => {
      if (!assertComponent("OfflineBanner", OfflineBanner)) return;

      const html = renderToString(
        React.createElement(OfflineBanner, { queuedCount: 1 })
      );

      expect(html).toMatch(/1\s+(?:pending\s+(?:change|action)|queued)/i);
    });

    it("TEST-OFFLINE-004: omits pending actions badge when queuedCount is 0 or undefined", () => {
      if (!assertComponent("OfflineBanner", OfflineBanner)) return;

      const htmlZero = renderToString(
        React.createElement(OfflineBanner, { queuedCount: 0 })
      );
      expect(htmlZero).not.toMatch(/0\s+pending/i);

      const htmlUndefined = renderToString(
        React.createElement(OfflineBanner)
      );
      expect(htmlUndefined).not.toMatch(/pending\s+changes\s+queued/i);
    });
  });

  // =========================================================================
  // 3. API Outage Fallback Screen (OutageScreen)
  // =========================================================================
  describe("API Outage Diagnostic Fallback Screen (OutageScreen)", () => {
    // -----------------------------------------------------------------------
    // TEST-OFFLINE-011: Outage Screen Diagnostic Details
    // -----------------------------------------------------------------------
    it("TEST-OFFLINE-011: renders title, error message, browser online state, and target API endpoint", () => {
      if (!assertComponent("OutageScreen", OutageScreen)) return;

      const error = new Error("502 Bad Gateway: Upstream incident service unavailable");
      const onRetry = vi.fn();

      mockNavigator.onLine = true;
      const html = renderToString(
        React.createElement(OutageScreen, {
          error,
          onRetry,
        })
      );

      // Header title
      expect(html).toMatch(/Service Connection Unavailable/i);

      // Error message details
      expect(html).toContain("502 Bad Gateway: Upstream incident service unavailable");

      // Browser online status
      expect(html).toMatch(/Online/i);

      // Target API endpoint (/api or base URL)
      expect(html).toMatch(/\/api/i);
    });

    it("TEST-OFFLINE-011: reflects offline network status in diagnostics when navigator.onLine is false", () => {
      if (!assertComponent("OutageScreen", OutageScreen)) return;

      mockNavigator.onLine = false;
      const html = renderToString(
        React.createElement(OutageScreen, {
          error: new Error("Network request failed"),
          onRetry: vi.fn(),
        })
      );

      expect(html).toMatch(/Offline/i);
    });

    it("TEST-OFFLINE-011: displays fallback error description when error object is null or undefined", () => {
      if (!assertComponent("OutageScreen", OutageScreen)) return;

      const html = renderToString(
        React.createElement(OutageScreen, {
          onRetry: vi.fn(),
        })
      );

      expect(html).toMatch(/Service Connection Unavailable/i);
      expect(html).toMatch(/network|connection|error/i);
    });

    // -----------------------------------------------------------------------
    // TEST-OFFLINE-012: Outage Screen Retry Action
    // -----------------------------------------------------------------------
    it("TEST-OFFLINE-012: invokes onRetry callback when operator clicks 'Retry Connection' button", () => {
      if (!assertComponent("OutageScreen", OutageScreen)) return;

      const onRetryMock = vi.fn();
      const { container, unmount } = renderInteractive(
        React.createElement(OutageScreen, {
          error: new Error("Backend connection lost"),
          onRetry: onRetryMock,
        })
      );

      // Find the Retry button
      const buttons = container.querySelectorAll("button");
      const retryButton = buttons.find((btn) => btn.textContent.includes("Retry"));

      expect(retryButton).toBeDefined();
      expect(retryButton?.textContent).toMatch(/Retry/i);

      // Trigger click
      act(() => {
        retryButton!.click();
      });

      expect(onRetryMock).toHaveBeenCalledTimes(1);
      unmount();
    });

    it("TEST-OFFLINE-012: displays loading indicator and disables Retry button when isRetrying is true", () => {
      if (!assertComponent("OutageScreen", OutageScreen)) return;

      const onRetryMock = vi.fn();
      const { container, unmount } = renderInteractive(
        React.createElement(OutageScreen, {
          error: new Error("Backend connection lost"),
          onRetry: onRetryMock,
          isRetrying: true,
        })
      );

      const buttons = container.querySelectorAll("button");
      const retryButton = buttons.find((btn) => btn.textContent.includes("Retry") || btn.hasAttribute("disabled") || btn.disabled);

      expect(retryButton).toBeDefined();
      expect(retryButton?.disabled || retryButton?.getAttribute("disabled")).toBeTruthy();

      // Click while retrying should not re-trigger onRetry
      act(() => {
        retryButton!.click();
      });

      expect(onRetryMock).not.toHaveBeenCalled();
      unmount();
    });
  });
});
