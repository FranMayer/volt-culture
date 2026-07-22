"use client";

import { PRODUCTION_LINES, ALL_CATEGORIES } from "@/lib/catalog-helpers";

export type FilterState = { line: string; category: string };

// Port of legacy/js/catalog.js loadCategories()/initCategoryFilters() — the
// sidebar is a static two-level tree (line -> categories) built from the
// same fixed lists, filter selection lives in the parent (CatalogView).
export default function CategorySidebar({
  filterState,
  onSelect,
  open,
  onToggleOpen,
}: {
  filterState: FilterState;
  onSelect: (next: FilterState) => void;
  open: boolean;
  onToggleOpen: () => void;
}) {
  return (
    <div className={`category-list${open ? " open" : ""}`}>
      <button
        type="button"
        className="category-toggle"
        aria-expanded={open}
        aria-controls="category-nav"
        onClick={onToggleOpen}
      >
        Categorías <span className="category-toggle__icon" aria-hidden="true">▾</span>
      </button>
      <ul className="line-nav" id="category-nav">
        {PRODUCTION_LINES.map((line) => {
          if (!line.available) {
            return (
              <li key={line.id} className="line-group line-group--soon" aria-disabled="true">
                <h3 className="line-group__title line-group__title--soon">
                  {line.label} <span className="category-soon-badge">PRÓXIMAMENTE</span>
                </h3>
              </li>
            );
          }

          const items = [
            { category: "all", label: "Ver todos" },
            ...ALL_CATEGORIES.map((cat) => ({ category: cat, label: cat })),
          ];

          return (
            <li key={line.id} className="line-group">
              <h3 className="line-group__title">{line.label}</h3>
              <ul className="cat-list">
                {items.map((it) => {
                  const active = filterState.line === line.id && filterState.category === it.category;
                  return (
                    <li
                      key={`${line.id}-${it.category}`}
                      className={`cat-item${active ? " active" : ""}`}
                      data-line={line.id}
                      data-category={it.category}
                      onClick={() => {
                        onSelect({ line: line.id, category: it.category });
                        // En mobile, cerrar el panel al elegir para liberar espacio (legacy:423-429).
                        if (open) onToggleOpen();
                      }}
                    >
                      {it.label}
                    </li>
                  );
                })}
              </ul>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
