"use client";

import { PRODUCTION_LINES, ALL_CATEGORIES, catalogHref } from "@/lib/catalog-helpers";

export type FilterState = { line: string; category: string };

type Item = { key: string; label: string; href: string; active: boolean; title?: string; soon?: boolean; onPick: () => void };

// Dos filtros ORTOGONALES (estética × tipo de prenda), no un árbol línea->categorías:
// VOLT es cultura automotriz, la estética es una lente sobre el mismo catálogo.
// Antes cada línea repetía las 4 categorías y elegir una te encerraba en un universo.
export default function CategorySidebar({
  filterState,
  onSelect,
  open,
  onToggleOpen,
  counts,
}: {
  filterState: FilterState;
  onSelect: (next: FilterState) => void;
  open: boolean;
  onToggleOpen: () => void;
  /** Productos por estética y por prenda en todo el catálogo; null mientras
   *  carga (sin datos no se puede distinguir "vacío" de "todavía no llegó").
   *  Una opción en 0 se muestra como PRONTO — Pantalones y Gorras hoy, sin
   *  hardcodear nada: aparecen solas cuando se sube el primer producto. */
  counts: { line: Record<string, number>; category: Record<string, number> } | null;
}) {
  function pick(next: FilterState) {
    onSelect(next);
    // En mobile, cerrar el panel al elegir para liberar espacio (legacy:423-429).
    if (open) onToggleOpen();
  }

  const groups: { title: string; items: Item[] }[] = [
    {
      title: "Estética",
      items: [
        {
          key: "line-all",
          label: "Todo VOLT",
          href: catalogHref({ ...filterState, line: "all" }),
          active: filterState.line === "all",
          onPick: () => pick({ ...filterState, line: "all" }),
        },
        ...PRODUCTION_LINES.map((l) => ({
          key: `line-${l.id}`,
          label: l.label,
          href: catalogHref({ ...filterState, line: l.id }),
          title: l.blurb,
          active: filterState.line === l.id,
          soon: !!counts && !counts.line[l.id],
          onPick: () => pick({ ...filterState, line: l.id }),
        })),
      ],
    },
    {
      title: "Prenda",
      items: [
        {
          key: "cat-all",
          label: "Ver todos",
          href: catalogHref({ ...filterState, category: "all" }),
          active: filterState.category === "all",
          onPick: () => pick({ ...filterState, category: "all" }),
        },
        ...ALL_CATEGORIES.map((cat) => ({
          key: `cat-${cat}`,
          label: cat,
          href: catalogHref({ ...filterState, category: cat }),
          active: filterState.category === cat,
          soon: !!counts && !counts.category[cat],
          onPick: () => pick({ ...filterState, category: cat }),
        })),
      ],
    },
  ];

  return (
    <div className={`category-list${open ? " open" : ""}`}>
      <button
        type="button"
        className="category-toggle"
        aria-expanded={open}
        aria-controls="category-nav"
        onClick={onToggleOpen}
      >
        Filtros <span className="category-toggle__icon" aria-hidden="true">▾</span>
      </button>
      <ul className="line-nav" id="category-nav">
        {groups.map((group) => (
          <li key={group.title} className="line-group">
            <h3 className="line-group__title">{group.title}</h3>
            <ul className="cat-list">
              {group.items.map((it) => (
                <li key={it.key} className={`cat-item${it.active ? " active" : ""}`} title={it.title}>
                  {/* <a> real: la categoría tiene URL propia, se puede copiar,
                      compartir y abrir en pestaña nueva. El click normal lo
                      maneja el router (sin recargar); ctrl/cmd/click y el
                      middle-click caen en el comportamiento nativo. */}
                  <a
                    className="cat-item__link"
                    href={it.href}
                    aria-current={it.active ? "page" : undefined}
                    onClick={(e) => {
                      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
                      e.preventDefault();
                      it.onPick();
                    }}
                  >
                    {it.label}
                    {it.soon && <span className="category-soon-badge">PRONTO</span>}
                  </a>
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ul>
    </div>
  );
}
