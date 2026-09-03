const HIGHLIGHT_CLASS = "__vocalize-region-highlight";
const STYLE_ID = "__vocalize-region-select-style";

let active = false;
let hovered: HTMLElement | null = null;
let onPick: ((text: string) => void) | null = null;

function ensureStyle(): void {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `
    .${HIGHLIGHT_CLASS} {
      outline: 2px solid #f54e00 !important;
      outline-offset: 2px !important;
      cursor: pointer !important;
      background: rgba(245, 78, 0, 0.08) !important;
    }
  `;
  document.head.appendChild(style);
}

function handleMouseOver(event: MouseEvent): void {
  if (!active) return;
  const target = event.target as HTMLElement;
  if (hovered && hovered !== target) hovered.classList.remove(HIGHLIGHT_CLASS);
  hovered = target;
  hovered.classList.add(HIGHLIGHT_CLASS);
}

function handleClick(event: MouseEvent): void {
  if (!active) return;
  event.preventDefault();
  event.stopPropagation();
  const target = event.target as HTMLElement;
  const text = target.innerText?.trim() ?? "";
  stopRegionSelect();
  if (text && onPick) onPick(text);
}

export function startRegionSelect(callback: (text: string) => void): void {
  ensureStyle();
  active = true;
  onPick = callback;
  document.addEventListener("mouseover", handleMouseOver, true);
  document.addEventListener("click", handleClick, true);
}

export function stopRegionSelect(): void {
  active = false;
  onPick = null;
  if (hovered) {
    hovered.classList.remove(HIGHLIGHT_CLASS);
    hovered = null;
  }
  document.removeEventListener("mouseover", handleMouseOver, true);
  document.removeEventListener("click", handleClick, true);
}

export function getUserTextSelection(): string | null {
  const selection = window.getSelection();
  const text = selection?.toString().trim();
  return text ? text : null;
}
