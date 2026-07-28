type PopupScope = {
    tabId: number | null;
    hostname: string;
    pageUrl: string | null;
    isExtensionPage: boolean;
};

export function shouldResetTransientPopupState(
    previousScope: PopupScope | null,
    nextScope: PopupScope | null,
): boolean {
    if (!previousScope || !nextScope) {
        return false;
    }

    return previousScope.tabId !== nextScope.tabId
        || previousScope.hostname !== nextScope.hostname
        || previousScope.pageUrl !== nextScope.pageUrl
        || previousScope.isExtensionPage !== nextScope.isExtensionPage;
}
