import React, { act } from "react";
import ReactDOM from "react-dom/client";
import { renderToString } from "react-dom/server";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  SeverityBadge,
  StatusBadge,
  IncidentTable,
  IncidentCard,
  IncidentList,
  PaginationControls,
} from "@/components/incidents";
import type {
  Incident,
  IncidentSeverity,
  IncidentStatus,
  UserSummary,
} from "@contracts";
import type { IncidentSortField, SortOrder } from "@contracts";

// ---------------------------------------------------------------------------
// Lightweight DOM / Event Harness for Component Interactions
// ---------------------------------------------------------------------------

class MockNode {
  nodeType: number;
  tagName: string;
  nodeName: string;
  ownerDocument: any;
  childNodes: MockNode[];
  parentNode: MockNode | null = null;
  style: Record<string, string> = {};
  attributes: Map<string, string> = new Map();
  listeners: Map<string, Set<(e: any) => void>> = new Map();
  options: any[] = [];
  _value: string = "";

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
    this.ownerDocument = doc;
    this.childNodes = [];
  }

  setAttribute(name: string, value: string) {
    this.attributes.set(name, String(value));
    if (name === "value") {
      this._value = String(value);
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
    let curr: MockNode | null = this;
    while (curr) {
      curr.listeners.get(event.type)?.forEach((fn) => fn(event));
      curr = event.bubbles ? curr.parentNode : null;
    }
    return true;
  }

  querySelector(selector: string): MockNode | null {
    const matches = (node: MockNode): boolean => {
      if (selector.startsWith("#") && node.getAttribute("id") === selector.slice(1)) {
        return true;
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
        if (child.tagName.toLowerCase() === selector.toLowerCase()) {
          results.push(child);
        }
        walk(child);
      }
    };
    walk(this);
    return results;
  }
}

const doc = {
  nodeType: 9,
  createElement: (tag: string) => new MockNode(1, tag.toUpperCase()),
  createElementNS: (_ns: string, tag: string) => new MockNode(1, tag.toUpperCase()),
  createTextNode: () => new MockNode(3, "#text"),
  addEventListener: () => {},
  removeEventListener: () => {},
  activeElement: null,
  defaultView: null as any,
};

const win = {
  document: doc,
  HTMLIFrameElement: class {},
  addEventListener: () => {},
  removeEventListener: () => {},
};
doc.defaultView = win;

function renderInteractive(element: React.ReactElement) {
  const container = new MockNode(1, "DIV");
  const root = ReactDOM.createRoot(container as any);
  act(() => {
    root.render(element);
  });
  return {
    container,
    unmount: () => act(() => root.unmount()),
    rerender: (el: React.ReactElement) => act(() => root.render(el)),
  };
}

// ---------------------------------------------------------------------------
// Mock Domain Fixtures (Strict adherence to contracts)
// ---------------------------------------------------------------------------

const mockUserMaya: UserSummary = {
  id: "usr-12",
  name: "Maya Chen",
  email: "maya@example.com",
  avatarUrl: "https://example.com/avatars/maya.png",
};

const mockUserOmar: UserSummary = {
  id: "usr-18",
  name: "Omar Hassan",
  email: "omar@example.com",
};

const mockIncidentCritical: Incident = {
  id: "INC-1001",
  title: "Database connection pool saturated",
  description: "Primary database pool latency exceeded 500ms threshold during peak load.",
  status: "investigating",
  severity: "critical",
  service: "payments-api",
  assignee: mockUserMaya,
  createdAt: "2026-08-01T08:42:00.000Z",
  updatedAt: "2026-08-01T09:18:00.000Z",
  version: 3,
  notes: [],
};

const mockIncidentHigh: Incident = {
  id: "INC-1002",
  title: "Checkout service p99 latency above 2.5s",
  description: "Checkout latency elevated after deployment of v2.4.1 canary worker pool.",
  status: "triggered",
  severity: "high",
  service: "checkout-web",
  assignee: null, // Unassigned
  createdAt: "2026-08-01T09:00:00.000Z",
  updatedAt: "2026-08-01T09:15:00.000Z",
  version: 1,
  notes: [],
};

const mockIncidentMedium: Incident = {
  id: "INC-1003",
  title: "Search index update worker backlog",
  description: "Search indexing latency is 15 minutes behind schedule due to rate limits.",
  status: "acknowledged",
  severity: "medium",
  service: "search-indexer",
  assignee: mockUserOmar,
  createdAt: "2026-08-01T07:30:00.000Z",
  updatedAt: "2026-08-01T08:45:00.000Z",
  version: 2,
  notes: [],
};

const mockIncidentLow: Incident = {
  id: "INC-1004",
  title: "Daily reporting cron job timeout",
  description: "Scheduled analytics extract completed after transient retry on worker 4.",
  status: "resolved",
  severity: "low",
  service: "reporting-api",
  assignee: mockUserOmar,
  createdAt: "2026-08-01T06:00:00.000Z",
  updatedAt: "2026-08-01T07:00:00.000Z",
  version: 4,
  notes: [],
};

const mockIncidentsList: Incident[] = [
  mockIncidentCritical,
  mockIncidentHigh,
  mockIncidentMedium,
  mockIncidentLow,
];

// ---------------------------------------------------------------------------
// Test Suites
// ---------------------------------------------------------------------------

describe("Incident Presentation & Interaction Components (TASK-FE-004)", () => {
  beforeEach(() => {
    vi.stubGlobal("window", win);
    vi.stubGlobal("document", doc);
    (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  // -------------------------------------------------------------------------
  // 1. SeverityBadge Component
  // -------------------------------------------------------------------------
  describe("SeverityBadge Component", () => {
    // TEST-COMP-001
    it("TEST-COMP-001: renders distinct textual label and iconography for critical and low without relying solely on color (WCAG AA)", () => {
      const criticalHtml = renderToString(React.createElement(SeverityBadge, { severity: "critical" }));
      expect(criticalHtml).toContain("CRITICAL");
      // Multi-modal non-color requirement: contains an svg icon or symbol
      expect(criticalHtml).toMatch(/<svg|󰈸|icon/i);

      const highHtml = renderToString(React.createElement(SeverityBadge, { severity: "high" }));
      expect(highHtml).toContain("HIGH");
      expect(highHtml).toMatch(/<svg|▲|triangle|warning|icon/i);

      const mediumHtml = renderToString(React.createElement(SeverityBadge, { severity: "medium" }));
      expect(mediumHtml).toContain("MEDIUM");
      expect(mediumHtml).toMatch(/<svg|◆|diamond|circle|icon/i);

      const lowHtml = renderToString(React.createElement(SeverityBadge, { severity: "low" }));
      expect(lowHtml).toContain("LOW");
      expect(lowHtml).toMatch(/<svg|▼|shield|chevron|icon/i);
    });

    it("applies custom className passed via props", () => {
      const html = renderToString(
        React.createElement(SeverityBadge, { severity: "critical", className: "custom-sev-class" })
      );
      expect(html).toContain("custom-sev-class");
    });
  });

  // -------------------------------------------------------------------------
  // 2. StatusBadge Component
  // -------------------------------------------------------------------------
  describe("StatusBadge Component", () => {
    // TEST-COMP-002
    it("TEST-COMP-002: renders status labels and displays micro-spinner when isOptimisticPending is true", () => {
      const triggeredHtml = renderToString(React.createElement(StatusBadge, { status: "triggered" }));
      expect(triggeredHtml).toContain("Triggered");
      expect(triggeredHtml).toMatch(/pulse|●|<svg/i);

      const acknowledgedHtml = renderToString(React.createElement(StatusBadge, { status: "acknowledged" }));
      expect(acknowledgedHtml).toContain("Acknowledged");

      const investigatingHtml = renderToString(React.createElement(StatusBadge, { status: "investigating" }));
      expect(investigatingHtml).toContain("Investigating");

      const resolvedHtml = renderToString(React.createElement(StatusBadge, { status: "resolved" }));
      expect(resolvedHtml).toContain("Resolved");

      // Optimistic pending state
      const pendingHtml = renderToString(
        React.createElement(StatusBadge, { status: "investigating", isOptimisticPending: true })
      );
      expect(pendingHtml).toContain("Investigating");
      expect(pendingHtml).toMatch(/animate-spin|spinner|pending/i);
    });
  });

  // -------------------------------------------------------------------------
  // 3. IncidentTable Component
  // -------------------------------------------------------------------------
  describe("IncidentTable Component", () => {
    // TEST-COMP-003
    it("TEST-COMP-003: renders semantic desktop table with all required columns and metadata", () => {
      const html = renderToString(
        React.createElement(IncidentTable, {
          incidents: [mockIncidentCritical, mockIncidentHigh],
          sort: "updatedAt",
          order: "desc",
          onSortChange: vi.fn(),
          onSelectIncident: vi.fn(),
        })
      );

      // Semantic HTML5 table tags
      expect(html).toContain("<table");
      expect(html).toContain("<thead");
      expect(html).toContain("<tbody");
      expect(html).toContain("<th");
      expect(html).toContain("<td");

      // Required column header concepts
      expect(html).toMatch(/ID/i);
      expect(html).toMatch(/Title/i);
      expect(html).toMatch(/Status/i);
      expect(html).toMatch(/Severity/i);
      expect(html).toMatch(/Service/i);
      expect(html).toMatch(/Assignee/i);
      expect(html).toMatch(/Updated/i);

      // Row data
      expect(html).toContain("INC-1001");
      expect(html).toContain("Database connection pool saturated");
      expect(html).toContain("payments-api");
      expect(html).toContain("Maya Chen");

      // Unassigned placeholder
      expect(html).toContain("INC-1002");
      expect(html).toContain("Unassigned");
    });

    // TEST-COMP-004
    it("TEST-COMP-004: reflects active sort direction via aria-sort and direction arrow", () => {
      const htmlDesc = renderToString(
        React.createElement(IncidentTable, {
          incidents: mockIncidentsList,
          sort: "updatedAt",
          order: "desc",
          onSortChange: vi.fn(),
          onSelectIncident: vi.fn(),
        })
      );

      expect(htmlDesc).toMatch(/aria-sort="descending"|aria-sort="desc"/i);
      expect(htmlDesc).toMatch(/▼|↓|arrow-down/i);

      const htmlAsc = renderToString(
        React.createElement(IncidentTable, {
          incidents: mockIncidentsList,
          sort: "updatedAt",
          order: "asc",
          onSortChange: vi.fn(),
          onSelectIncident: vi.fn(),
        })
      );

      expect(htmlAsc).toMatch(/aria-sort="ascending"|aria-sort="asc"/i);
      expect(htmlAsc).toMatch(/▲|↑|arrow-up/i);
    });

    it("TEST-COMP-004 (interactive): clicking column header invokes onSortChange with field identifier", () => {
      const handleSortChange = vi.fn();
      const { container } = renderInteractive(
        React.createElement(IncidentTable, {
          incidents: mockIncidentsList,
          sort: "updatedAt",
          order: "desc",
          onSortChange: handleSortChange,
          onSelectIncident: vi.fn(),
        })
      );

      // Find th elements or sort buttons inside headers
      const ths = container.querySelectorAll("th");
      expect(ths.length).toBeGreaterThan(0);

      // Click the first header that has a button or is interactive
      const headerWithSort = ths.find((th) => th.querySelector("button") || th.attributes.has("role"));
      const target = headerWithSort?.querySelector("button") ?? headerWithSort ?? ths[0];

      act(() => {
        target.dispatchEvent({ type: "click", bubbles: true });
      });

      expect(handleSortChange).toHaveBeenCalled();
    });

    // TEST-COMP-005
    it("TEST-COMP-005: clicking an incident row invokes onSelectIncident with incident ID", () => {
      const handleSelect = vi.fn();
      const { container } = renderInteractive(
        React.createElement(IncidentTable, {
          incidents: [mockIncidentCritical],
          sort: "updatedAt",
          order: "desc",
          onSortChange: vi.fn(),
          onSelectIncident: handleSelect,
        })
      );

      const rows = container.querySelectorAll("tr");
      // Header row is index 0; body row is index 1
      const bodyRow = rows.find((r) => r.parentNode?.tagName === "TBODY") ?? rows[1] ?? rows[0];

      act(() => {
        bodyRow.dispatchEvent({ type: "click", bubbles: true });
      });

      expect(handleSelect).toHaveBeenCalledWith("INC-1001");
    });

    it("TEST-COMP-005 (keyboard): pressing Enter or Space on a table row invokes onSelectIncident", () => {
      const handleSelect = vi.fn();
      const { container } = renderInteractive(
        React.createElement(IncidentTable, {
          incidents: [mockIncidentCritical],
          sort: "updatedAt",
          order: "desc",
          onSortChange: vi.fn(),
          onSelectIncident: handleSelect,
        })
      );

      const rows = container.querySelectorAll("tr");
      const bodyRow = rows.find((r) => r.parentNode?.tagName === "TBODY") ?? rows[1];

      act(() => {
        bodyRow.dispatchEvent({ type: "keydown", key: "Enter", bubbles: true });
      });

      expect(handleSelect).toHaveBeenCalledWith("INC-1001");

      act(() => {
        bodyRow.dispatchEvent({ type: "keydown", key: " ", bubbles: true });
      });

      expect(handleSelect).toHaveBeenCalledTimes(2);
    });

    it("highlights row when selectedIncidentId matches incident.id", () => {
      const html = renderToString(
        React.createElement(IncidentTable, {
          incidents: [mockIncidentCritical, mockIncidentHigh],
          sort: "updatedAt",
          order: "desc",
          selectedIncidentId: "INC-1001",
          onSortChange: vi.fn(),
          onSelectIncident: vi.fn(),
        })
      );

      // Selected row should have selected accent styling or aria-selected
      expect(html).toMatch(/aria-selected="true"|bg-slate-800|border-focus|ring-2/i);
    });
  });

  // -------------------------------------------------------------------------
  // 4. IncidentCard Component (Mobile View)
  // -------------------------------------------------------------------------
  describe("IncidentCard Component", () => {
    // TEST-COMP-006
    it("TEST-COMP-006: renders mobile card layout with title, service, badges, and invokes onSelectIncident on click", () => {
      const handleSelect = vi.fn();
      const html = renderToString(
        React.createElement(IncidentCard, {
          incident: mockIncidentCritical,
          onSelectIncident: handleSelect,
        })
      );

      expect(html).toContain("INC-1001");
      expect(html).toContain("Database connection pool saturated");
      expect(html).toContain("payments-api");
      expect(html).toContain("CRITICAL");
      expect(html).toContain("Investigating");
      expect(html).toContain("Maya Chen");

      // Interactive click
      const { container } = renderInteractive(
        React.createElement(IncidentCard, {
          incident: mockIncidentCritical,
          onSelectIncident: handleSelect,
        })
      );

      const card = container.childNodes[0];
      act(() => {
        card.dispatchEvent({ type: "click", bubbles: true });
      });

      expect(handleSelect).toHaveBeenCalledWith("INC-1001");
    });

    it("handles unassigned incident in card layout gracefully", () => {
      const html = renderToString(
        React.createElement(IncidentCard, {
          incident: mockIncidentHigh,
          onSelectIncident: vi.fn(),
        })
      );

      expect(html).toContain("INC-1002");
      expect(html).toContain("Unassigned");
    });
  });

  // -------------------------------------------------------------------------
  // 5. IncidentList Component (Responsive Wrapper)
  // -------------------------------------------------------------------------
  describe("IncidentList Component", () => {
    // TEST-COMP-007
    it("TEST-COMP-007: renders skeleton shimmer placeholders when isLoading is true", () => {
      const html = renderToString(
        React.createElement(IncidentList, {
          incidents: [],
          isLoading: true,
          sort: "updatedAt",
          order: "desc",
          onSortChange: vi.fn(),
          onSelectIncident: vi.fn(),
        })
      );

      expect(html).toMatch(/animate-pulse/i);
      // Does not render empty state messages while loading
      expect(html).not.toContain("No matching incidents found");
      expect(html).not.toContain("No incidents recorded");
    });

    // TEST-COMP-008
    it("TEST-COMP-008: renders filtered empty state with 'Clear All Filters' action button when hasActiveFilters is true", () => {
      const handleClear = vi.fn();
      const html = renderToString(
        React.createElement(IncidentList, {
          incidents: [],
          isLoading: false,
          hasActiveFilters: true,
          onClearFilters: handleClear,
          sort: "updatedAt",
          order: "desc",
          onSortChange: vi.fn(),
          onSelectIncident: vi.fn(),
        })
      );

      expect(html).toMatch(/No matching incidents found/i);
      expect(html).toMatch(/Clear All Filters/i);

      // Interactive button click
      const { container } = renderInteractive(
        React.createElement(IncidentList, {
          incidents: [],
          isLoading: false,
          hasActiveFilters: true,
          onClearFilters: handleClear,
          sort: "updatedAt",
          order: "desc",
          onSortChange: vi.fn(),
          onSelectIncident: vi.fn(),
        })
      );

      const btn = container.querySelector("button");
      expect(btn).not.toBeNull();
      act(() => {
        btn?.dispatchEvent({ type: "click", bubbles: true });
      });

      expect(handleClear).toHaveBeenCalledTimes(1);
    });

    // TEST-COMP-009
    it("TEST-COMP-009: renders zero-data empty state when incidents list is empty and hasActiveFilters is false", () => {
      const html = renderToString(
        React.createElement(IncidentList, {
          incidents: [],
          isLoading: false,
          hasActiveFilters: false,
          sort: "updatedAt",
          order: "desc",
          onSortChange: vi.fn(),
          onSelectIncident: vi.fn(),
        })
      );

      expect(html).toMatch(/No incidents recorded/i);
      expect(html).toMatch(/operating normally/i);
    });

    it("renders both desktop table and mobile card containers for responsive presentation", () => {
      const html = renderToString(
        React.createElement(IncidentList, {
          incidents: mockIncidentsList,
          isLoading: false,
          sort: "updatedAt",
          order: "desc",
          onSortChange: vi.fn(),
          onSelectIncident: vi.fn(),
        })
      );

      expect(html).toContain("INC-1001");
      // Responsive classes should be present
      expect(html).toMatch(/hidden md:block|block md:hidden/i);
    });
  });

  // -------------------------------------------------------------------------
  // 6. PaginationControls Component
  // -------------------------------------------------------------------------
  describe("PaginationControls Component", () => {
    // TEST-COMP-010
    it("TEST-COMP-010: calculates and displays human-readable range summary for first, middle, and empty pages", () => {
      // First page
      const page1Html = renderToString(
        React.createElement(PaginationControls, {
          page: 1,
          pageSize: 25,
          total: 1048,
          totalPages: 42,
          onPageChange: vi.fn(),
          onPageSizeChange: vi.fn(),
        })
      );
      expect(page1Html).toMatch(/Showing (1–25|1-25) of 1,048 incidents/i);

      // Second page
      const page2Html = renderToString(
        React.createElement(PaginationControls, {
          page: 2,
          pageSize: 25,
          total: 1048,
          totalPages: 42,
          onPageChange: vi.fn(),
          onPageSizeChange: vi.fn(),
        })
      );
      expect(page2Html).toMatch(/Showing (26–50|26-50) of 1,048 incidents/i);

      // Zero total incidents
      const zeroHtml = renderToString(
        React.createElement(PaginationControls, {
          page: 1,
          pageSize: 25,
          total: 0,
          totalPages: 1,
          onPageChange: vi.fn(),
          onPageSizeChange: vi.fn(),
        })
      );
      expect(zeroHtml).toMatch(/Showing 0 of 0 incidents|0 incidents/i);
    });

    // TEST-COMP-011
    it("TEST-COMP-011: disables previous/first navigation on page 1 and invokes onPageChange on Next", () => {
      const handlePageChange = vi.fn();

      const htmlPage1 = renderToString(
        React.createElement(PaginationControls, {
          page: 1,
          pageSize: 25,
          total: 1048,
          totalPages: 42,
          onPageChange: handlePageChange,
          onPageSizeChange: vi.fn(),
        })
      );

      // Disabled attributes on prev buttons
      expect(htmlPage1).toMatch(/disabled/i);

      // Interactive test: click Next button
      const { container } = renderInteractive(
        React.createElement(PaginationControls, {
          page: 1,
          pageSize: 25,
          total: 1048,
          totalPages: 42,
          onPageChange: handlePageChange,
          onPageSizeChange: vi.fn(),
        })
      );

      const buttons = container.querySelectorAll("button");
      // Find Next button (typically contains 'Next' or '>' or last non-disabled nav button)
      const nextBtn = buttons.find(
        (b) => !b.attributes.has("disabled") && (b.attributes.get("aria-label")?.includes("Next") || true)
      );

      act(() => {
        nextBtn?.dispatchEvent({ type: "click", bubbles: true });
      });

      expect(handlePageChange).toHaveBeenCalledWith(2);
    });

    it("disables next/last navigation buttons on the final page", () => {
      const htmlLastPage = renderToString(
        React.createElement(PaginationControls, {
          page: 42,
          pageSize: 25,
          total: 1048,
          totalPages: 42,
          onPageChange: vi.fn(),
          onPageSizeChange: vi.fn(),
        })
      );

      expect(htmlLastPage).toMatch(/disabled/i);
    });

    it("disables all navigation controls when disabled prop is true", () => {
      const htmlDisabled = renderToString(
        React.createElement(PaginationControls, {
          page: 2,
          pageSize: 25,
          total: 1048,
          totalPages: 42,
          disabled: true,
          onPageChange: vi.fn(),
          onPageSizeChange: vi.fn(),
        })
      );

      expect(htmlDisabled).toMatch(/disabled/i);
    });

    // TEST-COMP-012
    it("TEST-COMP-012: renders page size selector and invokes onPageSizeChange on dropdown selection", () => {
      const handlePageSizeChange = vi.fn();
      const html = renderToString(
        React.createElement(PaginationControls, {
          page: 1,
          pageSize: 25,
          total: 1048,
          totalPages: 42,
          onPageChange: vi.fn(),
          onPageSizeChange: handlePageSizeChange,
        })
      );

      // Contains options 10, 25, 50, 100
      expect(html).toContain("10");
      expect(html).toContain("25");
      expect(html).toContain("50");
      expect(html).toContain("100");

      // Interactive select change
      const { container } = renderInteractive(
        React.createElement(PaginationControls, {
          page: 1,
          pageSize: 25,
          total: 1048,
          totalPages: 42,
          onPageChange: vi.fn(),
          onPageSizeChange: handlePageSizeChange,
        })
      );

      const select = container.querySelector("select");
      expect(select).not.toBeNull();

      act(() => {
        if (select) {
          (select as any).value = "50";
        }
        select?.dispatchEvent({
          type: "change",
          target: { value: "50" },
          bubbles: true,
        });
      });

      expect(handlePageSizeChange).toHaveBeenCalledWith(50);
    });
  });
});
