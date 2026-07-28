export function clearProcessingToast(doc: Document = document): void {
    doc.getElementById("zg-processing-toast")?.remove();
}

export function consumeTargetingContextMenuEvent(event: MouseEvent): HTMLElement | null {
    const target = event.target as HTMLElement | null;
    if (!target) {
        return null;
    }

    event.preventDefault();
    event.stopPropagation();
    return target;
}
