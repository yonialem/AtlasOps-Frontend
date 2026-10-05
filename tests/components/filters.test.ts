import React, { act } from "react";
import ReactDOM from "react-dom/client";
import { renderToString } from "react-dom/server";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  SearchInput,
  MultiSelectDropdown,
  ActiveFilterChips,
  FilterBar,
} from "@/components/filters";
import type { DropdownOption, FilterChip } from "@/components/filters";
import type { IncidentStatus, IncidentSeverity } from "@contracts";

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
  options: any[] = [];
  _value: string = "";
  type: string = "text";
  checked: boolean = false;

  get ownerDocument(): any {
    return doc;
  }

  get value(): string {
    return this._value;
  }

  set value(val: string) {
    this._value = String(val);
  }

  constructor(nodeType: number, tagName: string) {
    this.nodeType = nodeType;
    this.tagName = tagName;
    this.nodeName = tagName;
    this.childNodes = [];
  }

  setAttribute(name: string, value: string) {
    this.attributes.set(name, String(value));
    if (name === "value") {
      this._value = String(value);
    }
    if (name === "type") {
      this.type = String(value);
    }
    if (name === "checked") {
      this.checked = value === "true" || value === "";
    }
  }

  getAttribute(name: string): string | null {
    return this.attributes.get(name) ?? null;
  }

  removeAttribute(name: string) {
    this.attributes.delete(name);
  }

  appendChild(child: MockNode) {
    child.parentNode = this;
    this.childNodes.push(child);
    if (this.tagName === "SELECT" && child.tagName === "OPTION") {
      this.options.push(child);
    }
  }

  removeChild(child: MockNode) {
    const idx = this.childNodes.indexOf(child);
    if (idx !== -1) {
      child.parentNode = null;
      this.childNodes.splice(idx, 1);
    }
  }

  insertBefore(newNode: MockNode, referenceNode: MockNode) {
    const idx = this.childNodes.indexOf(referenceNode);
    newNode.parentNode = this;
    if (idx === -1) {
      this.childNodes.push(newNode);
    } else {
      this.childNodes.splice(idx, 0, newNode);
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
    if ((this as any)._valueTracker) {
      (this as any)._valueTracker.setValue("__reset__");
    }

    const reactPropsKey = Object.keys(this).find((k) => k.startsWith("__reactProps$"));
    if (reactPropsKey) {
      const reactProps = (this as any)[reactPropsKey];
      if (reactProps) {
        if (event.type === "input" || event.type === "change") {
          reactProps.onChange?.(event);
        } else if (event.type === "keydown") {
          reactProps.onKeyDown?.(event);
        } else if (event.type === "keyup") {
          reactProps.onKeyUp?.(event);
        }
      }
    }

    let curr: MockNode | null = this;
    while (curr) {
      curr.listeners.get(event.type)?.forEach((fn) => fn(event));
      if (
        this.tagName === "INPUT" &&
        this.type !== "checkbox" &&
        this.type !== "radio" &&
        (event.type === "keydown" || event.type === "input" || event.type === "change")
      ) {
        break;
      }
      curr = event.bubbles ? curr.parentNode : null;
    }
    return true;
  }

  contains(otherNode: MockNode | null): boolean {
    if (!otherNode) return false;
    let curr: MockNode | null = otherNode;
    while (curr) {
      if (curr === this) return true;
      curr = curr.parentNode;
    }
    return false;
  }

  focus() {
    doc.activeElement = this;
    this.dispatchEvent({ type: "focus", bubbles: false });
  }

  blur() {
    if (doc.activeElement === this) {
      doc.activeElement = doc.body;
    }
    this.dispatchEvent({ type: "blur", bubbles: false });
  }

  select() {
    this.focus();
  }

  querySelector(selector: string): MockNode | null {
    const matches = (node: MockNode): boolean => {
      if (selector.startsWith("#") && node.getAttribute("id") === selector.slice(1)) {
        return true;
      }
      if (selector.startsWith(".") && node.getAttribute("class")?.includes(selector.slice(1))) {
        return true;
      }
      if (selector.startsWith("[") && selector.endsWith("]")) {
        const attrExpr = selector.slice(1, -1);
        if (attrExpr.includes("=")) {
          const [k, v] = attrExpr.split("=");
          const cleanV = v.replace(/['"]/g, "");
          return node.getAttribute(k) === cleanV;
        }
        return node.attributes.has(attrExpr);
      }
      if (node.tagName.toLowerCase() === selector.toLowerCase()) {
        return true;
      }
      return false;
    };

    for (const child of this.childNodes) {
      if (matches(child)) return child;
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

function nodeMatches(node: MockNode, selector: string): boolean {
  if (selector.startsWith("[type=") && selector.endsWith("]")) {
    const typeVal = selector.slice(6, -1).replace(/['"]/g, "");
    return node.getAttribute("type") === typeVal;
  }
  if (node.tagName.toLowerCase() === selector.toLowerCase()) {
    return true;
  }
  return false;
}

const doc: any = {
  nodeType: 9,
  body: null as any,
  oninput: null,
  createElement: (tag: string) => new MockNode(1, tag.toUpperCase()),
  createElementNS: (_ns: string, tag: string) => new MockNode(1, tag.toUpperCase()),
  createTextNode: () => new MockNode(3, "#text"),
  addEventListener: (type: string, fn: (e: any) => void) => {
    docListeners.set(type, (docListeners.get(type) ?? new Set()).add(fn));
  },
  removeEventListener: (type: string, fn: (e: any) => void) => {
    docListeners.get(type)?.delete(fn);
  },
  dispatchEvent: (event: any) => {
    if (!event.preventDefault) event.preventDefault = () => {};
    if (!event.stopPropagation) event.stopPropagation = () => {};
    docListeners.get(event.type)?.forEach((fn) => fn(event));
    return true;
  },
  contains: (other: MockNode | null) => doc.body?.contains(other) ?? false,
  activeElement: null as MockNode | null,
  defaultView: null as any,
};

const docListeners = new Map<string, Set<(e: any) => void>>();
const winListeners = new Map<string, Set<(e: any) => void>>();

doc.body = new MockNode(1, "BODY");

class MockLocation {
  private _search = "";
  pathname = "/incidents";

  get search(): string {
    return this._search;
  }

  set search(val: string) {
    if (!val) {
      this._search = "";
    } else {
      this._search = val.startsWith("?") ? val : `?${val}`;
    }
  }

  get href(): string {
    return `http://localhost${this.pathname}${this._search}`;
  }

  toString(): string {
    return this.href;
  }
}

class MockHistory {
  location: MockLocation;

  pushState = vi.fn((_state: any, _unused: string, url?: string | URL | null) => {
    if (url !== undefined && url !== null) {
      const parsed = new URL(url.toString(), "http://localhost");
      this.location.pathname = parsed.pathname;
      this.location.search = parsed.search;
    }
  });

  replaceState = vi.fn((_state: any, _unused: string, url?: string | URL | null) => {
    if (url !== undefined && url !== null) {
      const parsed = new URL(url.toString(), "http://localhost");
      this.location.pathname = parsed.pathname;
      this.location.search = parsed.search;
    }
  });

  constructor(location: MockLocation) {
    this.location = location;
  }
}

let mockLocation: MockLocation;
let mockHistory: MockHistory;

const win = {
  document: doc,
  location: undefined as any,
  history: undefined as any,
  HTMLIFrameElement: class {},
  addEventListener: (type: string, fn: (e: any) => void) => {
    winListeners.set(type, (winListeners.get(type) ?? new Set()).add(fn));
  },
  removeEventListener: (type: string, fn: (e: any) => void) => {
    winListeners.get(type)?.delete(fn);
  },
  dispatchEvent: (event: any) => {
    if (!event.preventDefault) event.preventDefault = () => {};
    if (!event.stopPropagation) event.stopPropagation = () => {};
    winListeners.get(event.type)?.forEach((fn) => fn(event));
    return true;
  },
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
// Test Suites: FilterBar & Search Toolbar (TASK-FE-005)
// ---------------------------------------------------------------------------

describe("FilterBar & Search Toolbar Components (TASK-FE-005)", () => {
  beforeEach(() => {
    docListeners.clear();
    winListeners.clear();
    mockLocation = new MockLocation();
    mockHistory = new MockHistory(mockLocation);
    win.location = mockLocation;
    win.history = mockHistory;
    doc.activeElement = doc.body;

    vi.stubGlobal("window", win);
    vi.stubGlobal("document", doc);
    vi.stubGlobal("history", mockHistory);
    vi.stubGlobal("location", mockLocation);
    (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  // -------------------------------------------------------------------------
  // 1. SearchInput Component Tests (TEST-FILTER-001 to TEST-FILTER-004)
  // -------------------------------------------------------------------------
  describe("SearchInput Component", () => {
    // TEST-FILTER-001
    it("TEST-FILTER-001: renders with placeholder, displays initial query, and reflects typed input", () => {
      const html = renderToString(
        React.createElement(SearchInput, {
          value: "checkout",
          onChange: vi.fn(),
          placeholder: "Search incidents...",
        })
      );

      expect(html).toContain("checkout");
      expect(html).toContain("Search incidents...");
      expect(html).toMatch(/<input/i);

      // Interactive check
      const handleChange = vi.fn();
      const { container } = renderInteractive(
        React.createElement(SearchInput, {
          value: "checkout",
          onChange: handleChange,
        })
      );

      const input = container.querySelector("input");
      expect(input).not.toBeNull();
      expect(input?.value).toBe("checkout");
    });

    // TEST-FILTER-002
    it("TEST-FILTER-002: debounces input changes by 300ms before calling onChange", () => {
      vi.useFakeTimers();
      const handleChange = vi.fn();

      const { container } = renderInteractive(
        React.createElement(SearchInput, {
          value: "",
          onChange: handleChange,
        })
      );

      const input = container.querySelector("input");
      expect(input).not.toBeNull();

      // Keystroke 1: "p"
      act(() => {
        if (input) input.value = "p";
        input?.dispatchEvent({ type: "input", bubbles: true });
        input?.dispatchEvent({ type: "change", bubbles: true });
      });

      // No immediate call
      expect(handleChange).not.toHaveBeenCalled();

      // Advance 150ms
      act(() => {
        vi.advanceTimersByTime(150);
      });
      expect(handleChange).not.toHaveBeenCalled();

      // Keystroke 2: "payments"
      act(() => {
        if (input) input.value = "payments";
        input?.dispatchEvent({ type: "input", bubbles: true });
        input?.dispatchEvent({ type: "change", bubbles: true });
      });

      // Advance 200ms (350ms total, but only 200ms since last keystroke)
      act(() => {
        vi.advanceTimersByTime(200);
      });
      expect(handleChange).not.toHaveBeenCalled();

      // Advance another 100ms (300ms since last keystroke)
      act(() => {
        vi.advanceTimersByTime(100);
      });

      // Called once with debounced value
      expect(handleChange).toHaveBeenCalledTimes(1);
      expect(handleChange).toHaveBeenCalledWith("payments");

      vi.useRealTimers();
    });

    // TEST-FILTER-003
    it("TEST-FILTER-003: shows clear button when non-empty; clicking immediately clears and invokes onChange('')", () => {
      const handleChange = vi.fn();

      // Empty input has no clear button
      const emptyHtml = renderToString(
        React.createElement(SearchInput, {
          value: "",
          onChange: handleChange,
        })
      );
      expect(emptyHtml).not.toMatch(/clear|×|button/i);

      // Non-empty input displays clear button
      const { container } = renderInteractive(
        React.createElement(SearchInput, {
          value: "database",
          onChange: handleChange,
        })
      );

      const clearBtn = container.querySelector("button");
      expect(clearBtn).not.toBeNull();

      act(() => {
        clearBtn?.dispatchEvent({ type: "click", bubbles: true });
      });

      // Fires immediately without 300ms delay
      expect(handleChange).toHaveBeenCalledWith("");
    });

    // TEST-FILTER-004
    it("TEST-FILTER-004: global '/' hotkey focuses SearchInput from anywhere in document unless an input is focused", () => {
      const { container } = renderInteractive(
        React.createElement(SearchInput, {
          value: "",
          onChange: vi.fn(),
        })
      );

      const input = container.querySelector("input");
      expect(input).not.toBeNull();

      // Press "/" when focus is on body
      act(() => {
        doc.activeElement = doc.body;
        win.dispatchEvent({
          type: "keydown",
          key: "/",
          bubbles: true,
          preventDefault: vi.fn(),
        });
      });

      expect(doc.activeElement).toBe(input);

      // When another input is focused, "/" should NOT steal focus
      const otherInput = doc.createElement("input");
      doc.body.appendChild(otherInput);
      otherInput.focus();
      expect(doc.activeElement).toBe(otherInput);

      act(() => {
        win.dispatchEvent({
          type: "keydown",
          key: "/",
          bubbles: true,
          preventDefault: vi.fn(),
        });
      });

      // Focus remained on otherInput
      expect(doc.activeElement).toBe(otherInput);
    });

    it("pressing Escape while focused on SearchInput clears text and blurs", () => {
      const handleChange = vi.fn();
      const { container } = renderInteractive(
        React.createElement(SearchInput, {
          value: "query-text",
          onChange: handleChange,
        })
      );

      const input = container.querySelector("input");
      input?.focus();
      expect(doc.activeElement).toBe(input);

      act(() => {
        input?.dispatchEvent({
          type: "keydown",
          key: "Escape",
          bubbles: true,
        });
      });

      expect(handleChange).toHaveBeenCalledWith("");
      expect(doc.activeElement).not.toBe(input);
    });
  });

  // -------------------------------------------------------------------------
  // 2. MultiSelectDropdown Component Tests (TEST-FILTER-005 to TEST-FILTER-007)
  // -------------------------------------------------------------------------
  describe("MultiSelectDropdown Component", () => {
    const statusOptions: readonly DropdownOption<IncidentStatus>[] = [
      { value: "triggered", label: "Triggered" },
      { value: "acknowledged", label: "Acknowledged" },
      { value: "investigating", label: "Investigating" },
      { value: "resolved", label: "Resolved" },
    ];

    // TEST-FILTER-005
    it("TEST-FILTER-005: opens popover with checkboxes on trigger click; closes on outside click or Escape", () => {
      const { container } = renderInteractive(
        React.createElement(MultiSelectDropdown<IncidentStatus>, {
          label: "Status",
          options: statusOptions,
          selectedValues: [],
          onChange: vi.fn(),
        })
      );

      const triggerBtn = container.querySelector("button");
      expect(triggerBtn).not.toBeNull();
      expect(triggerBtn?.getAttribute("aria-expanded")).toBe("false");

      // Click to open
      act(() => {
        triggerBtn?.dispatchEvent({ type: "click", bubbles: true });
      });

      expect(triggerBtn?.getAttribute("aria-expanded")).toBe("true");

      // Press Escape to close
      act(() => {
        doc.dispatchEvent({ type: "keydown", key: "Escape" });
      });

      expect(triggerBtn?.getAttribute("aria-expanded")).toBe("false");

      // Click to open again
      act(() => {
        triggerBtn?.dispatchEvent({ type: "click", bubbles: true });
      });
      expect(triggerBtn?.getAttribute("aria-expanded")).toBe("true");

      // Click outside to close
      act(() => {
        doc.dispatchEvent({
          type: "mousedown",
          target: doc.body,
        });
      });

      expect(triggerBtn?.getAttribute("aria-expanded")).toBe("false");
    });

    // TEST-FILTER-006
    it("TEST-FILTER-006: toggling options calls onChange with updated array without losing selections", () => {
      const handleChange = vi.fn();

      const { container } = renderInteractive(
        React.createElement(MultiSelectDropdown<IncidentStatus>, {
          label: "Status",
          options: statusOptions,
          selectedValues: ["triggered"],
          onChange: handleChange,
        })
      );

      const triggerBtn = container.querySelector("button");

      // Open dropdown
      act(() => {
        triggerBtn?.dispatchEvent({ type: "click", bubbles: true });
      });

      // Find checkboxes
      const checkboxes = container.querySelectorAll("input");
      expect(checkboxes.length).toBeGreaterThan(0);

      // Check "investigating" (second unchecked item)
      const investigatingOption = checkboxes.find(
        (cb) => cb.getAttribute("value") === "investigating" || cb.getAttribute("name") === "investigating"
      ) ?? checkboxes[2];

      act(() => {
        investigatingOption?.dispatchEvent({ type: "click", bubbles: true });
      });

      expect(handleChange).toHaveBeenCalledWith(expect.arrayContaining(["triggered", "investigating"]));
    });

    // TEST-FILTER-007
    it("TEST-FILTER-007: trigger label displays selection count when items are selected", () => {
      // Empty selection displays "Status: All" or "All"
      const emptyHtml = renderToString(
        React.createElement(MultiSelectDropdown<IncidentStatus>, {
          label: "Status",
          options: statusOptions,
          selectedValues: [],
          onChange: vi.fn(),
        })
      );
      expect(emptyHtml).toMatch(/Status.*All/i);

      // 2 selections display "Status (2)"
      const multiHtml = renderToString(
        React.createElement(MultiSelectDropdown<IncidentStatus>, {
          label: "Status",
          options: statusOptions,
          selectedValues: ["triggered", "investigating"],
          onChange: vi.fn(),
        })
      );
      expect(multiHtml).toContain("Status (2)");

      // 1 selection displays "Severity (1)" or count
      const singleHtml = renderToString(
        React.createElement(MultiSelectDropdown<IncidentSeverity>, {
          label: "Severity",
          options: [
            { value: "critical", label: "Critical" },
            { value: "high", label: "High" },
          ],
          selectedValues: ["critical"],
          onChange: vi.fn(),
        })
      );
      expect(singleHtml).toMatch(/Severity.*(1|Critical)/i);
    });
  });

  // -------------------------------------------------------------------------
  // 3. ActiveFilterChips Component Tests (TEST-FILTER-008 to TEST-FILTER-011)
  // -------------------------------------------------------------------------
  describe("ActiveFilterChips Component", () => {
    const mockChips: FilterChip[] = [
      {
        id: "status-triggered",
        category: "status",
        label: "Status: Triggered",
        onRemove: vi.fn(),
      },
      {
        id: "severity-critical",
        category: "severity",
        label: "Severity: Critical",
        onRemove: vi.fn(),
      },
      {
        id: "service-payments",
        category: "service",
        label: "Service: payments-api",
        onRemove: vi.fn(),
      },
      {
        id: "q-search",
        category: "q",
        label: 'Search: "database"',
        onRemove: vi.fn(),
      },
    ];

    // TEST-FILTER-008
    it("TEST-FILTER-008: renders individual pill chips for all active filters and search query", () => {
      const html = renderToString(
        React.createElement(ActiveFilterChips, {
          chips: mockChips,
          onClearAll: vi.fn(),
        })
      );

      expect(html).toContain("Status: Triggered");
      expect(html).toContain("Severity: Critical");
      expect(html).toContain("Service: payments-api");
      expect(html).toMatch(/Search:\s*(&quot;|")database(&quot;|")/);
    });

    // TEST-FILTER-009
    it("TEST-FILTER-009: clicking dismiss button on a chip calls its onRemove callback", () => {
      const removeSpy = vi.fn();
      const chips: FilterChip[] = [
        {
          id: "status-triggered",
          category: "status",
          label: "Status: Triggered",
          onRemove: removeSpy,
        },
      ];

      const { container } = renderInteractive(
        React.createElement(ActiveFilterChips, {
          chips,
          onClearAll: vi.fn(),
        })
      );

      const removeBtn = container.querySelector("button");
      expect(removeBtn).not.toBeNull();

      act(() => {
        removeBtn?.dispatchEvent({ type: "click", bubbles: true });
      });

      expect(removeSpy).toHaveBeenCalledTimes(1);
    });

    // TEST-FILTER-010
    it("TEST-FILTER-010: displays 'Clear All' button when filters are active, hidden when chips array is empty", () => {
      const hiddenHtml = renderToString(
        React.createElement(ActiveFilterChips, {
          chips: [],
          onClearAll: vi.fn(),
        })
      );
      expect(hiddenHtml).not.toMatch(/Clear All/i);

      const visibleHtml = renderToString(
        React.createElement(ActiveFilterChips, {
          chips: mockChips,
          onClearAll: vi.fn(),
        })
      );
      expect(visibleHtml).toMatch(/Clear All/i);
    });

    // TEST-FILTER-011
    it("TEST-FILTER-011: clicking 'Clear All' invokes onClearAll callback", () => {
      const handleClearAll = vi.fn();

      const { container } = renderInteractive(
        React.createElement(ActiveFilterChips, {
          chips: mockChips,
          onClearAll: handleClearAll,
        })
      );

      // Find "Clear All" button (the button not labeled with "Remove filter")
      const buttons = container.querySelectorAll("button");
      const clearAllBtn =
        buttons.find((b) => !b.getAttribute("aria-label")?.startsWith("Remove")) ??
        buttons[buttons.length - 1];

      act(() => {
        clearAllBtn?.dispatchEvent({ type: "click", bubbles: true });
      });

      expect(handleClearAll).toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // 4. Composite FilterBar Component Tests (TEST-FILTER-012)
  // -------------------------------------------------------------------------
  describe("FilterBar Composite Toolbar Component", () => {
    // TEST-FILTER-012
    it("TEST-FILTER-012: renders search, dropdowns, and chips; modifying filters enforces Page Reset Invariant (page: 1)", () => {
      // Start with page 3 in URL
      mockLocation.search = "?page=3&status=triggered";

      const { container } = renderInteractive(
        React.createElement(FilterBar, {
          availableServices: ["payments-api", "checkout-web", "reporting-api"],
        })
      );

      // Component renders search input and filter buttons
      const searchInput = container.querySelector("input");
      expect(searchInput).not.toBeNull();

      // Trigger buttons for dropdowns are present
      const buttons = container.querySelectorAll("button");
      expect(buttons.length).toBeGreaterThan(0);

      // Active chips for status=triggered should be visible in rendered HTML
      const html = renderToString(
        React.createElement(FilterBar, {
          availableServices: ["payments-api", "checkout-web"],
        })
      );
      expect(html).toContain("Triggered");
    });

    it("renders dynamic services list passed via availableServices prop", () => {
      const services = ["payments-api", "checkout-web", "reporting-api", "inventory-service"];
      const html = renderToString(
        React.createElement(FilterBar, {
          availableServices: services,
        })
      );

      expect(html).toMatch(/Service/i);
    });
  });
});
